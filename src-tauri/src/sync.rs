use rayon::prelude::*;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use futures_util::stream::{self, StreamExt};
use std::path::PathBuf;

use crate::games;
use crate::http::HTTP_CLIENT;
use crate::instance;
use crate::server::{SourceMod, SyncManifest};
use crate::sources::thunderstore;
use crate::utils;

#[derive(Debug, Serialize, Clone)]
pub struct HybridSyncResult {
    pub mods_downloaded: Vec<String>,
    pub mods_failed: Vec<HybridSyncError>,
    pub configs_synced: usize,
    pub bytes_from_source: u64,
    pub bytes_from_p2p: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct HybridSyncError {
    pub identifier: String,
    pub message: String,
    pub fallback_attempted: bool,
}

async fn download_file(
    owner_address: &str,
    file_path: &str,
    instance_dir: &Path,
) -> Result<u64, String> {
    let url = format!("http://{}/files/{}", owner_address, file_path);

    let response = HTTP_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", file_path, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {}: HTTP {}",
            file_path,
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read {}: {}", file_path, e))?;

    let size = bytes.len() as u64;
    let target_path = instance_dir.join(file_path);

    if let Some(parent) = target_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory for {}: {}", file_path, e))?;
    }

    std::fs::write(&target_path, &bytes)
        .map_err(|e| format!("Failed to write {}: {}", file_path, e))?;

    Ok(size)
}

#[derive(Debug, Clone)]
struct CachedMod {
    identifier: String,
    version: String,
    enabled: bool,
    cache_dir: PathBuf,
    dependencies: Vec<String>,
    display_name: Option<String>,
    is_loader: bool,
}

type DownloadResult = Result<CachedMod, HybridSyncError>;

fn read_deps_from_cached_manifest(cache_dir: &Path) -> Vec<String> {
    let manifest_path = cache_dir.join("manifest.json");
    let Ok(content) = std::fs::read_to_string(manifest_path) else {
        return vec![];
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else {
        return vec![];
    };
    json["dependencies"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|d| d.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

async fn download_single_mod_to_cache(
    cache_base: &Path,
    community: &str,
    source_mod: &SourceMod,
    api_cache_dir: Option<&Path>,
) -> DownloadResult {
    let cache_dir = cache_base
        .join(&source_mod.identifier)
        .join(&source_mod.version);

    if cache_dir.exists() && cache_dir.join(".cached").exists() {
        let dependencies = read_deps_from_cached_manifest(&cache_dir);
        return Ok(CachedMod {
            identifier: source_mod.identifier.clone(),
            version: source_mod.version.clone(),
            enabled: source_mod.enabled,
            cache_dir,
            dependencies,
            display_name: source_mod.display_name.clone(),
            is_loader: crate::games::is_loader_package(&source_mod.identifier),
        });
    }

    let version_info = thunderstore::sync::get_package_version(
        community,
        &source_mod.identifier,
        &source_mod.version,
        api_cache_dir,
    )
    .await
    .map_err(|e| HybridSyncError {
        identifier: source_mod.identifier.clone(),
        message: format!("Failed to get version info: {}", e),
        fallback_attempted: false,
    })?;

    let cache_dir = thunderstore::cache::download_and_extract(
        cache_base,
        &source_mod.identifier,
        &source_mod.version,
        &version_info.download_url,
    )
    .await
    .map_err(|e| HybridSyncError {
        identifier: source_mod.identifier.clone(),
        message: format!("Failed to download: {}", e),
        fallback_attempted: false,
    })?;

    Ok(CachedMod {
        identifier: source_mod.identifier.clone(),
        version: source_mod.version.clone(),
        enabled: source_mod.enabled,
        cache_dir,
        dependencies: version_info.dependencies,
        display_name: source_mod.display_name.clone(),
        is_loader: crate::games::is_loader_package(&source_mod.identifier),
    })
}

async fn download_mods_to_cache(
    cache_base: PathBuf,
    community: String,
    mods: Vec<SourceMod>,
    app_handle: AppHandle,
    concurrency_limit: usize,
    api_cache_dir: Option<PathBuf>,
) -> Vec<DownloadResult> {
    let total = mods.len();
    let counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let cache_base = std::sync::Arc::new(cache_base);
    let community = std::sync::Arc::new(community);
    let app_handle = std::sync::Arc::new(app_handle);
    let api_cache_dir = std::sync::Arc::new(api_cache_dir);

    let results: Vec<DownloadResult> = stream::iter(mods.into_iter().enumerate())
        .map(|(idx, source_mod)| {
            let cache_base = cache_base.clone();
            let community = community.clone();
            let app_handle = app_handle.clone();
            let counter = counter.clone();
            let api_cache_dir = api_cache_dir.clone();

            async move {
                                let current = counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                let _ = app_handle.emit(
                    "sync:progress",
                    serde_json::json!({
                        "mode": "hybrid",
                        "phase": "downloading",
                        "current": current,
                        "total": total,
                        "mod_name": source_mod.display_name.as_ref().unwrap_or(&source_mod.identifier),
                        "action": "downloading",
                        "concurrent": true,
                        "index": idx
                    }),
                );

                let result = download_single_mod_to_cache(&*cache_base, &*community, &source_mod, api_cache_dir.as_deref()).await;

                                let status = if result.is_ok() { "downloaded" } else { "failed" };
                let _ = app_handle.emit(
                    "sync:mod_download_complete",
                    serde_json::json!({
                        "identifier": source_mod.identifier,
                        "status": status,
                        "index": idx
                    }),
                );

                result
            }
        })
        .buffer_unordered(concurrency_limit)
        .collect()
        .await;

    results
}

fn partition_download_results(
    results: Vec<DownloadResult>,
) -> (Vec<CachedMod>, Vec<HybridSyncError>) {
    let mut successes = Vec::new();
    let mut failures = Vec::new();

    for result in results {
        match result {
            Ok(cached_mod) => successes.push(cached_mod),
            Err(error) => failures.push(error),
        }
    }

    (successes, failures)
}

fn install_cached_mods(
    instance_dir: &Path,
    cached_mods: &[CachedMod],
    game_id: &str,
    loader: Option<&str>,
    app_handle: &AppHandle,
) -> (Vec<String>, Vec<HybridSyncError>) {
    use crate::sources::thunderstore::installer::ModInstaller;
    use crate::sources::thunderstore::manifest::ManifestV2;
    use crate::sources::thunderstore::profile::{
        add_mod_to_list, load_mods_yml, save_mods_yml, set_enabled_in_list,
    };

    let mut installed = Vec::new();
    let mut errors = Vec::new();
    let total = cached_mods.len();

    let mut mods_list = match load_mods_yml(instance_dir) {
        Ok(list) => list,
        Err(e) => {
            eprintln!("Warning: Failed to load mods.yml, starting fresh: {}", e);
            Vec::new()
        }
    };

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);

    for (idx, cached_mod) in cached_mods.iter().enumerate() {
        if mods_list.iter().any(|m| m.name == cached_mod.identifier) {
            installed.push(cached_mod.identifier.clone());
            continue;
        }

        let _ = app_handle.emit(
            "sync:progress",
            serde_json::json!({
                "mode": "hybrid",
                "phase": "installing",
                "current": idx + 1,
                "total": total,
                "mod_name": cached_mod.display_name.as_ref().unwrap_or(&cached_mod.identifier),
                "action": "installing"
            }),
        );

        let (author, display_name) = cached_mod
            .identifier
            .split_once('-')
            .map(|(a, n)| (a.to_string(), n.to_string()))
            .unwrap_or_else(|| ("unknown".to_string(), cached_mod.identifier.clone()));

        let manifest = ManifestV2::new(
            &cached_mod.identifier,
            &author,
            &display_name,
            &cached_mod.version,
            None,
            None,
            cached_mod.dependencies.clone(),
            None,
        );

        let install_result = if cached_mod.is_loader {
            installer.install_loader(&cached_mod.cache_dir, &manifest)
        } else {
            installer.install_mod(&cached_mod.cache_dir, &manifest)
        };

        match install_result {
            Ok(_) => {
                add_mod_to_list(&mut mods_list, manifest);
                installed.push(cached_mod.identifier.clone());

                if !cached_mod.enabled {
                    if let Err(e) = installer.disable_mod(&cached_mod.identifier) {
                        eprintln!(
                            "Warning: Failed to disable {}: {}",
                            cached_mod.identifier, e
                        );
                    }
                    set_enabled_in_list(&mut mods_list, &cached_mod.identifier, false);
                }
            }
            Err(e) => {
                errors.push(HybridSyncError {
                    identifier: cached_mod.identifier.clone(),
                    message: format!("Install failed: {}", e),
                    fallback_attempted: false,
                });
            }
        }
    }

    if let Err(e) = save_mods_yml(instance_dir, &mods_list) {
        eprintln!("Error: Failed to save mods.yml: {}", e);
    }

    (installed, errors)
}

async fn resolve_and_cache_dependencies(
    cache_base: PathBuf,
    community: String,
    cached_mods: &[CachedMod],
    existing_mods: &[String],
    app_handle: AppHandle,
    concurrency_limit: usize,
    api_cache_dir: Option<PathBuf>,
) -> Vec<CachedMod> {
    use crate::sources::thunderstore::cache::resolve_dependencies_with_visited;
    use std::collections::HashSet;

    let mut all_deps: Vec<String> = Vec::new();
    let mut visited: HashSet<String> = existing_mods.iter().cloned().collect();

    for cached in cached_mods {
        visited.insert(cached.identifier.clone());
    }

    for cached in cached_mods {
        for dep in &cached.dependencies {
            if let Some(parsed) =
                crate::sources::thunderstore::manifest::DependencyString::parse(dep)
            {
                let full_name = parsed.full_name();
                if !visited.contains(&full_name) {
                    all_deps.push(dep.clone());
                    visited.insert(full_name);
                }
            }
        }
    }

    if all_deps.is_empty() {
        return Vec::new();
    }

    let mut resolve_visited: HashSet<String> = existing_mods.iter().cloned().collect();
    for cached in cached_mods {
        resolve_visited.insert(cached.identifier.clone());
    }

    let resolved = match resolve_dependencies_with_visited(
        &community,
        &all_deps,
        &mut resolve_visited,
        api_cache_dir.as_deref(),
    )
    .await
    {
        Ok(deps) => deps,
        Err(e) => {
            eprintln!("Warning: Failed to resolve dependencies: {}", e);
            return Vec::new();
        }
    };

    let dep_source_mods: Vec<SourceMod> = resolved
        .iter()
        .filter(|d| !crate::games::is_loader_package(&d.full_name))
        .map(|d| SourceMod {
            identifier: d.full_name.clone(),
            version: d.version.clone(),
            enabled: true,
            version_id: None,
            display_name: Some(d.name.clone()),
            author: Some(d.owner.clone()),
            icon_url: d.icon.clone(),
        })
        .collect();

    if dep_source_mods.is_empty() {
        return Vec::new();
    }

    let _ = app_handle.emit(
        "sync:progress",
        serde_json::json!({
            "mode": "hybrid",
            "phase": "dependencies",
            "message": format!("Downloading {} dependencies...", dep_source_mods.len())
        }),
    );

    let results = download_mods_to_cache(
        cache_base,
        community,
        dep_source_mods,
        app_handle,
        concurrency_limit,
        api_cache_dir,
    )
    .await;
    let (cached_deps, _errors) = partition_download_results(results);

    cached_deps
}

const DOWNLOAD_CONCURRENCY: usize = 8;

fn compute_file_hash(path: &std::path::Path) -> Result<String, std::io::Error> {
    utils::compute_file_hash(path)
}

fn mods_already_synced(instance_dir: &Path, source_mods: &[SourceMod]) -> bool {
    let Ok(all_local) = thunderstore::profile::load_mods_yml(instance_dir) else {
        return false;
    };

    let local_mods: Vec<_> = all_local
        .into_iter()
        .filter(|m| !games::is_loader_package(&m.name))
        .collect();

    if local_mods.len() != source_mods.len() {
        return false;
    }

    let source_set: HashSet<(&str, &str)> = source_mods
        .iter()
        .map(|m| (m.identifier.as_str(), m.version.as_str()))
        .collect();

    local_mods.iter().all(|m| {
        let ver = m.version_number.to_string();
        source_set.contains(&(m.name.as_str(), ver.as_str()))
    })
}

pub async fn hybrid_sync_from_owner_with_manifest(
    app_handle: AppHandle,
    modpack_id: String,
    modpack_name: String,
    owner_address: String,
    manifest: SyncManifest,
) -> Result<HybridSyncResult, String> {
    let _ = instance::get_or_create_folder_name(&app_handle, &modpack_id, &modpack_name);

    let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;

    if !instance_dir.exists() {
        std::fs::create_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to create instance directory: {}", e))?;
    }

    let mods_in_sync = mods_already_synced(&instance_dir, &manifest.source_mods);

    let total_mods = manifest.source_mods.len();
    let total_files = manifest.p2p_files.len();

    let mut result = HybridSyncResult {
        mods_downloaded: vec![],
        mods_failed: vec![],
        configs_synced: 0,
        bytes_from_source: 0,
        bytes_from_p2p: 0,
    };

    if !mods_in_sync && manifest.mod_source == "thunderstore" {
        let _ = app_handle.emit(
            "sync:started",
            serde_json::json!({
                "mode": "hybrid",
                "total_mods": total_mods,
                "total_configs": total_files,
                "message": "Starting hybrid sync with parallel downloads...",
                "parallel": true,
                "concurrency": DOWNLOAD_CONCURRENCY
            }),
        );
    }

    if !mods_in_sync && manifest.mod_source == "thunderstore" {
        if let Some(community) = &manifest.community {
            let cache_base = instance::get_cache_dir(&app_handle)?;
            let api_cache_dir = cache_base
                .parent()
                .map(|p| p.to_path_buf());

            if let Some(ref acd) = api_cache_dir {
                let _ = thunderstore::api::load_cache_from_disk(community, acd);
            }

            let game = games::get_game(&manifest.game_id);
            let loader_config = game.as_ref().and_then(|g| g.loader.as_ref());
            let loader_name = loader_config.map(|lc| lc.loader_type.name());

            if let Some(loader) = loader_config {
                if !manifest.source_mods.is_empty() {
                    let _ = app_handle.emit(
                        "sync:progress",
                        serde_json::json!({
                            "mode": "hybrid",
                            "phase": "loader",
                            "message": "Installing mod loader..."
                        }),
                    );
                    let _ = thunderstore::ensure_loader_installed(
                        &cache_base,
                        &instance_dir,
                        community,
                        loader,
                        &manifest.game_id,
                    )
                    .await;
                }
            }

            if !manifest.source_mods.is_empty() {
                let _ = app_handle.emit(
                    "sync:progress",
                    serde_json::json!({
                        "mode": "hybrid",
                        "phase": "downloading",
                        "message": format!("Downloading {} mods in parallel...", total_mods),
                        "total": total_mods
                    }),
                );

                let download_results = download_mods_to_cache(
                    cache_base.clone(),
                    community.clone(),
                    manifest.source_mods.clone(),
                    app_handle.clone(),
                    DOWNLOAD_CONCURRENCY,
                    api_cache_dir.clone(),
                )
                .await;

                let (mut cached_mods, download_errors) =
                    partition_download_results(download_results);

                result.mods_failed.extend(download_errors);

                let existing_mods: Vec<String> =
                    thunderstore::profile::load_mods_yml(&instance_dir)
                        .unwrap_or_default()
                        .iter()
                        .map(|m| m.name.clone())
                        .collect();

                let cached_deps = resolve_and_cache_dependencies(
                    cache_base.clone(),
                    community.clone(),
                    &cached_mods,
                    &existing_mods,
                    app_handle.clone(),
                    DOWNLOAD_CONCURRENCY,
                    api_cache_dir.clone(),
                )
                .await;

                let mut all_cached = cached_deps;
                all_cached.append(&mut cached_mods);

                let _ = app_handle.emit(
                    "sync:progress",
                    serde_json::json!({
                        "mode": "hybrid",
                        "phase": "installing",
                        "message": format!("Installing {} mods from cache...", all_cached.len()),
                        "total": all_cached.len()
                    }),
                );

                let (installed, install_errors) = install_cached_mods(
                    &instance_dir,
                    &all_cached,
                    &manifest.game_id,
                    loader_name,
                    &app_handle,
                );

                result.mods_downloaded.extend(installed);
                result.mods_failed.extend(install_errors);
            }
        }
    }

    if !manifest.p2p_files.is_empty() {
        let inst_dir_for_hash = instance_dir.clone();
        let files_to_download: Vec<_> = manifest
            .p2p_files
            .par_iter()
            .filter(|f| {
                let local_path = inst_dir_for_hash.join(&f.path);
                if !local_path.exists() {
                    return true;
                }
                match compute_file_hash(&local_path) {
                    Ok(local_hash) => local_hash != f.hash,
                    Err(_) => true,
                }
            })
            .cloned()
            .collect();

        let files_to_download_count = files_to_download.len();

        let _ = app_handle.emit(
            "sync:progress",
            serde_json::json!({
                "mode": "hybrid",
                "phase": "configs",
                "message": format!("Syncing {}/{} files...", files_to_download_count, total_files)
            }),
        );

        let paths_to_download: Vec<String> =
            files_to_download.iter().map(|f| f.path.clone()).collect();

        let download_results: Vec<_> = stream::iter(paths_to_download)
            .map(|file_path| {
                let owner_addr = owner_address.clone();
                let inst_dir = instance_dir.clone();
                async move {
                    let res = download_file(&owner_addr, &file_path, &inst_dir).await;
                    (file_path, res)
                }
            })
            .buffer_unordered(8)
            .collect()
            .await;

        for (idx, (file_path, res)) in download_results.into_iter().enumerate() {
            let _ = app_handle.emit(
                "sync:progress",
                serde_json::json!({
                    "mode": "hybrid",
                    "phase": "configs",
                    "current": idx + 1,
                    "total": files_to_download_count,
                    "file_name": &file_path,
                    "action": "downloading_file"
                }),
            );
            match res {
                Ok(size) => {
                    result.bytes_from_p2p += size;
                    result.configs_synced += 1;
                }
                Err(e) => {
                    eprintln!("Failed to download {}: {}", file_path, e);
                }
            }
        }

        let sync_patterns = ["BepInEx/config/", "BepInEx/plugins/", "config/"];
        let owner_paths: HashSet<&str> = manifest.p2p_files.iter().map(|f| f.path.as_str()).collect();

        let stale_files: Vec<_> = WalkDir::new(&instance_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                let path = e.path().to_path_buf();
                let relative = path.strip_prefix(&instance_dir).ok()?.to_string_lossy().replace('\\', "/");
                if sync_patterns.iter().any(|p| relative.starts_with(p)) && !owner_paths.contains(relative.as_str()) {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        stale_files.par_iter().for_each(|path| {
            let _ = std::fs::remove_file(path);
        });
    }

    let _ = app_handle.emit("sync:completed", &result);

    Ok(result)
}
