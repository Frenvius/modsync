use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use futures_util::stream::{self, StreamExt};
use std::path::PathBuf;

use crate::games;
use crate::instance;
use crate::modpack::{Modpack, ModpackMod};
use crate::server::{FileEntry, ProfileManifest, SourceMod, SyncManifest};
use crate::sources::thunderstore;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("ModSync/0.1.0 (https://github.com/Frenvius/modpack-sync)")
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .build()
        .expect("Failed to build HTTP client")
});

#[derive(Debug, Clone)]
pub struct SyncActions {
    pub mods_to_add: Vec<ModpackMod>,
    pub mods_to_remove: Vec<ModpackMod>,
    pub mods_to_update: Vec<(ModpackMod, ModpackMod)>,
    pub mods_to_toggle: Vec<(String, bool)>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SyncResult {
    pub mods_added: Vec<String>,
    pub mods_removed: Vec<String>,
    pub mods_updated: Vec<String>,
    pub mods_toggled: Vec<String>,
    pub errors: Vec<SyncError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SyncError {
    pub mod_slug: String,
    pub action: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SyncProgress {
    pub current: usize,
    pub total: usize,
    pub mod_name: String,
    pub action: String,
}

impl SyncActions {
    pub fn total_actions(&self) -> usize {
        self.mods_to_add.len()
            + self.mods_to_remove.len()
            + self.mods_to_update.len()
            + self.mods_to_toggle.len()
    }

    pub fn is_empty(&self) -> bool {
        self.mods_to_add.is_empty()
            && self.mods_to_remove.is_empty()
            && self.mods_to_update.is_empty()
            && self.mods_to_toggle.is_empty()
    }
}

pub fn compute_sync_actions(local: &Modpack, remote: &Modpack) -> SyncActions {
    let local_mods: HashMap<&str, &ModpackMod> =
        local.mods.iter().map(|m| (m.slug.as_str(), m)).collect();
    let remote_mods: HashMap<&str, &ModpackMod> =
        remote.mods.iter().map(|m| (m.slug.as_str(), m)).collect();

    let local_slugs: HashSet<&str> = local_mods.keys().copied().collect();
    let remote_slugs: HashSet<&str> = remote_mods.keys().copied().collect();

    let mods_to_add: Vec<ModpackMod> = remote_slugs
        .difference(&local_slugs)
        .filter_map(|slug| remote_mods.get(slug).map(|m| (*m).clone()))
        .collect();

    let mods_to_remove: Vec<ModpackMod> = local_slugs
        .difference(&remote_slugs)
        .filter_map(|slug| local_mods.get(slug).map(|m| (*m).clone()))
        .filter(|m| !m.is_loader)
        .collect();

    let mods_to_update: Vec<(ModpackMod, ModpackMod)> = local_slugs
        .intersection(&remote_slugs)
        .filter_map(|slug| {
            let local_mod = local_mods.get(slug)?;
            let remote_mod = remote_mods.get(slug)?;
            if local_mod.version != remote_mod.version {
                Some(((*local_mod).clone(), (*remote_mod).clone()))
            } else {
                None
            }
        })
        .collect();

    let mods_to_toggle: Vec<(String, bool)> = local_slugs
        .intersection(&remote_slugs)
        .filter_map(|slug| {
            let local_mod = local_mods.get(slug)?;
            let remote_mod = remote_mods.get(slug)?;
            if local_mod.version == remote_mod.version && local_mod.enabled != remote_mod.enabled {
                Some((slug.to_string(), remote_mod.enabled))
            } else {
                None
            }
        })
        .collect();

    SyncActions {
        mods_to_add,
        mods_to_remove,
        mods_to_update,
        mods_to_toggle,
    }
}

pub async fn sync_thunderstore_modpack(
    app_handle: &AppHandle,
    modpack: &Modpack,
    remote_modpack: &Modpack,
) -> Result<SyncResult, String> {
    let game = games::get_game(&modpack.game_id)
        .ok_or_else(|| format!("Unknown game: {}", modpack.game_id))?;

    if game.mod_source != "thunderstore" {
        return Err("This sync handler is only for Thunderstore games".to_string());
    }

    let community = game
        .thunderstore_community
        .as_ref()
        .ok_or("Game has no Thunderstore community configured")?;

    let instance_dir = instance::get_instance_dir(app_handle, &modpack.id)?;
    let cache_base = instance::get_cache_dir(app_handle)?;
    let loader_config = game.loader.as_ref();
    let loader_name = loader_config.map(|lc| lc.loader_type.name());

    if !instance_dir.exists() {
        instance::create_instance_dirs_for_game(
            app_handle,
            &modpack.id,
            &modpack.name,
            Some("thunderstore"),
        )?;
    }

    let actions = compute_sync_actions(modpack, remote_modpack);

    if actions.is_empty() {
        return Ok(SyncResult {
            mods_added: vec![],
            mods_removed: vec![],
            mods_updated: vec![],
            mods_toggled: vec![],
            errors: vec![],
        });
    }

    let total = actions.total_actions();
    let _ = app_handle.emit("sync:started", serde_json::json!({ "total": total }));

    let mut result = SyncResult {
        mods_added: vec![],
        mods_removed: vec![],
        mods_updated: vec![],
        mods_toggled: vec![],
        errors: vec![],
    };

    let mut current = 0;

    if !actions.mods_to_add.is_empty() {
        if let Some(loader) = loader_config {
            let _ = thunderstore::ensure_loader_installed(
                &cache_base,
                &instance_dir,
                community,
                loader,
                &modpack.game_id,
            )
            .await;
        }
    }

    for mod_to_remove in &actions.mods_to_remove {
        current += 1;
        let _ = app_handle.emit(
            "sync:progress",
            SyncProgress {
                current,
                total,
                mod_name: mod_to_remove.title.clone(),
                action: "removing".to_string(),
            },
        );

        match thunderstore::remove_mod_from_profile(
            &instance_dir,
            &mod_to_remove.slug,
            &modpack.game_id,
            loader_name,
        ) {
            Ok(_) => {
                result.mods_removed.push(mod_to_remove.slug.clone());
            }
            Err(e) => {
                result.errors.push(SyncError {
                    mod_slug: mod_to_remove.slug.clone(),
                    action: "remove".to_string(),
                    message: e,
                });
            }
        }
    }

    for (local_mod, remote_mod) in &actions.mods_to_update {
        current += 1;
        let _ = app_handle.emit(
            "sync:progress",
            SyncProgress {
                current,
                total,
                mod_name: remote_mod.title.clone(),
                action: "updating".to_string(),
            },
        );

        match thunderstore::sync::sync_update_mod(
            &cache_base,
            &instance_dir,
            community,
            &remote_mod.slug,
            &remote_mod.version,
            local_mod.enabled,
            &modpack.game_id,
            loader_name,
            None,
        )
        .await
        {
            Ok(_) => {
                result.mods_updated.push(remote_mod.slug.clone());
            }
            Err(e) => {
                result.errors.push(SyncError {
                    mod_slug: remote_mod.slug.clone(),
                    action: "update".to_string(),
                    message: e,
                });
            }
        }
    }

    for mod_to_add in &actions.mods_to_add {
        current += 1;
        let _ = app_handle.emit(
            "sync:progress",
            SyncProgress {
                current,
                total,
                mod_name: mod_to_add.title.clone(),
                action: "installing".to_string(),
            },
        );

        match thunderstore::sync::sync_install_mod(
            &cache_base,
            &instance_dir,
            community,
            &mod_to_add.slug,
            &mod_to_add.version,
            mod_to_add.enabled,
            &modpack.game_id,
            loader_name,
            None,
        )
        .await
        {
            Ok(_) => {
                result.mods_added.push(mod_to_add.slug.clone());
            }
            Err(e) => {
                result.errors.push(SyncError {
                    mod_slug: mod_to_add.slug.clone(),
                    action: "install".to_string(),
                    message: e,
                });
            }
        }
    }

    for (slug, enabled) in &actions.mods_to_toggle {
        current += 1;
        let action_str = if *enabled { "enabling" } else { "disabling" };
        let _ = app_handle.emit(
            "sync:progress",
            SyncProgress {
                current,
                total,
                mod_name: slug.clone(),
                action: action_str.to_string(),
            },
        );

        match thunderstore::toggle_mod_enabled(
            &instance_dir,
            slug,
            *enabled,
            &modpack.game_id,
            loader_name,
        ) {
            Ok(_) => {
                result.mods_toggled.push(slug.clone());
            }
            Err(e) => {
                result.errors.push(SyncError {
                    mod_slug: slug.clone(),
                    action: action_str.to_string(),
                    message: e,
                });
            }
        }
    }

    let _ = app_handle.emit("sync:completed", &result);

    Ok(result)
}

pub async fn sync_modpack_files(
    app_handle: &AppHandle,
    modpack: &Modpack,
    remote_modpack: &Modpack,
) -> Result<SyncResult, String> {
    let game = games::get_game(&modpack.game_id);

    match game {
        Some(g) if g.mod_source == "thunderstore" => {
            sync_thunderstore_modpack(app_handle, modpack, remote_modpack).await
        }
        Some(g) if g.mod_source == "modrinth" => {
            Err("Modrinth sync not yet implemented".to_string())
        }
        Some(g) => Err(format!("Unknown mod source: {}", g.mod_source)),
        None => Err(format!("Unknown game: {}", modpack.game_id)),
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct P2PSyncResult {
    pub mode: String,
    pub files_added: usize,
    pub files_updated: usize,
    pub files_deleted: usize,
    pub bytes_downloaded: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct P2PSyncProgress {
    pub mode: String,
    pub current: usize,
    pub total: usize,
    pub file_name: String,
    pub action: String,
}

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

#[derive(Debug)]
struct ManifestDiff {
    to_download: Vec<FileEntry>,
    to_delete: Vec<String>,
}

const EXCLUDED_PATTERNS: &[&str] = &[
    "LogOutput.log",
    "BepInEx/LogOutput.log",
    ".log",
    "__MACOSX",
    ".DS_Store",
    "Thumbs.db",
];

fn should_exclude(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    for pattern in EXCLUDED_PATTERNS {
        if path_lower.contains(&pattern.to_lowercase()) {
            return true;
        }
    }
    if path
        .split('/')
        .any(|part| part.starts_with('.') && part != ".")
    {
        return true;
    }
    false
}

fn is_empty_profile(instance_dir: &Path) -> bool {
    if !instance_dir.exists() {
        return true;
    }

    let mods_yml = instance_dir.join("mods.yml");
    let bepinex_dir = instance_dir.join("BepInEx");

    !mods_yml.exists() && !bepinex_dir.exists()
}

fn generate_local_manifest(instance_dir: &Path) -> Result<ProfileManifest, String> {
    if !instance_dir.exists() {
        return Ok(ProfileManifest { files: Vec::new() });
    }

    let entries: Vec<_> = WalkDir::new(instance_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let path = e.path().to_path_buf();
            let relative = path
                .strip_prefix(instance_dir)
                .ok()?
                .to_string_lossy()
                .replace('\\', "/");
            if should_exclude(&relative) {
                None
            } else {
                Some((path, relative))
            }
        })
        .collect();

    let files: Result<Vec<FileEntry>, String> = entries
        .par_iter()
        .map(|(path, relative_path)| {
            let mut file = std::fs::File::open(path)
                .map_err(|e| format!("Failed to open {}: {}", relative_path, e))?;
            let mut hasher = Sha256::new();
            let mut buffer = [0u8; 8192];
            loop {
                let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if bytes_read == 0 {
                    break;
                }
                hasher.update(&buffer[..bytes_read]);
            }
            let hash = format!("{:x}", hasher.finalize());
            let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
            Ok(FileEntry {
                path: relative_path.clone(),
                hash,
                size: metadata.len(),
            })
        })
        .collect();

    Ok(ProfileManifest { files: files? })
}

fn compute_manifest_diff(local: &ProfileManifest, remote: &ProfileManifest) -> ManifestDiff {
    let local_files: HashMap<&str, &FileEntry> =
        local.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let remote_files: HashMap<&str, &FileEntry> =
        remote.files.iter().map(|f| (f.path.as_str(), f)).collect();

    let to_download: Vec<FileEntry> = remote
        .files
        .iter()
        .filter(
            |remote_file| match local_files.get(remote_file.path.as_str()) {
                None => true,
                Some(local_file) => local_file.hash != remote_file.hash,
            },
        )
        .cloned()
        .collect();

    let to_delete: Vec<String> = local
        .files
        .iter()
        .filter(|local_file| !remote_files.contains_key(local_file.path.as_str()))
        .map(|f| f.path.clone())
        .collect();

    ManifestDiff {
        to_download,
        to_delete,
    }
}

async fn fetch_remote_manifest(owner_address: &str) -> Result<ProfileManifest, String> {
    let url = format!("http://{}/manifest", owner_address);

    let response = HTTP_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch manifest: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse manifest: {}", e))
}

async fn sync_full_profile(
    app_handle: &AppHandle,
    owner_address: &str,
    instance_dir: &Path,
) -> Result<P2PSyncResult, String> {
    let _ = app_handle.emit(
        "sync:started",
        serde_json::json!({ "mode": "full", "message": "Downloading full profile..." }),
    );

    let url = format!("http://{}/profile", owner_address);

    let response = HTTP_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("Failed to download profile: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download profile: HTTP {}",
            response.status()
        ));
    }

    let zip_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read profile data: {}", e))?;

    let bytes_downloaded = zip_bytes.len() as u64;

    std::fs::create_dir_all(instance_dir)
        .map_err(|e| format!("Failed to create instance directory: {}", e))?;

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open ZIP: {}", e))?;

    let total_files = archive.len();
    let mut files_added = 0;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry: {}", e))?;

        let file_path = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };

        let _ = app_handle.emit(
            "sync:progress",
            P2PSyncProgress {
                mode: "full".to_string(),
                current: i + 1,
                total: total_files,
                file_name: file_path.to_string_lossy().to_string(),
                action: "extracting".to_string(),
            },
        );

        let target_path = instance_dir.join(&file_path);

        if file.is_dir() {
            std::fs::create_dir_all(&target_path).ok();
        } else {
            if let Some(parent) = target_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&target_path)
                .map_err(|e| format!("Failed to create file {:?}: {}", target_path, e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file {:?}: {}", target_path, e))?;
            files_added += 1;
        }
    }

    let result = P2PSyncResult {
        mode: "full".to_string(),
        files_added,
        files_updated: 0,
        files_deleted: 0,
        bytes_downloaded,
    };

    let _ = app_handle.emit("sync:completed", &result);

    Ok(result)
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

async fn sync_delta(
    app_handle: &AppHandle,
    owner_address: &str,
    instance_dir: &Path,
) -> Result<P2PSyncResult, String> {
    let _ = app_handle.emit(
        "sync:started",
        serde_json::json!({ "mode": "delta", "message": "Checking for changes..." }),
    );

    let remote_manifest = fetch_remote_manifest(owner_address).await?;

    let local_manifest = generate_local_manifest(instance_dir)?;

    let diff = compute_manifest_diff(&local_manifest, &remote_manifest);

    let total_actions = diff.to_download.len() + diff.to_delete.len();

    if total_actions == 0 {
        let result = P2PSyncResult {
            mode: "delta".to_string(),
            files_added: 0,
            files_updated: 0,
            files_deleted: 0,
            bytes_downloaded: 0,
        };
        let _ = app_handle.emit("sync:completed", &result);
        return Ok(result);
    }

    let mut files_added = 0;
    let mut files_updated = 0;
    let mut files_deleted = 0;
    let mut bytes_downloaded: u64 = 0;
    let mut current = 0;

    let local_paths: HashSet<&str> = local_manifest
        .files
        .iter()
        .map(|f| f.path.as_str())
        .collect();

    for file in &diff.to_download {
        current += 1;
        let action = if local_paths.contains(file.path.as_str()) {
            "updating"
        } else {
            "downloading"
        };

        let _ = app_handle.emit(
            "sync:progress",
            P2PSyncProgress {
                mode: "delta".to_string(),
                current,
                total: total_actions,
                file_name: file.path.clone(),
                action: action.to_string(),
            },
        );

        match download_file(owner_address, &file.path, instance_dir).await {
            Ok(size) => {
                bytes_downloaded += size;
                if local_paths.contains(file.path.as_str()) {
                    files_updated += 1;
                } else {
                    files_added += 1;
                }
            }
            Err(e) => {
                eprintln!("Failed to download {}: {}", file.path, e);
            }
        }
    }

    for path in &diff.to_delete {
        current += 1;
        let _ = app_handle.emit(
            "sync:progress",
            P2PSyncProgress {
                mode: "delta".to_string(),
                current,
                total: total_actions,
                file_name: path.clone(),
                action: "deleting".to_string(),
            },
        );

        let full_path = instance_dir.join(path);
        if full_path.exists() {
            if let Err(e) = std::fs::remove_file(&full_path) {
                eprintln!("Failed to delete {}: {}", path, e);
            } else {
                files_deleted += 1;

                if let Some(parent) = full_path.parent() {
                    let _ = remove_empty_parents(parent, instance_dir);
                }
            }
        }
    }

    let result = P2PSyncResult {
        mode: "delta".to_string(),
        files_added,
        files_updated,
        files_deleted,
        bytes_downloaded,
    };

    let _ = app_handle.emit("sync:completed", &result);

    Ok(result)
}

fn remove_empty_parents(dir: &Path, root: &Path) -> Result<(), std::io::Error> {
    if dir == root || !dir.starts_with(root) {
        return Ok(());
    }

    if dir.is_dir() {
        if std::fs::read_dir(dir)?.next().is_none() {
            std::fs::remove_dir(dir)?;
            if let Some(parent) = dir.parent() {
                return remove_empty_parents(parent, root);
            }
        }
    }

    Ok(())
}

pub async fn sync_from_owner(
    app_handle: &AppHandle,
    modpack: &Modpack,
    owner_address: &str,
) -> Result<P2PSyncResult, String> {
    let instance_dir = instance::get_instance_dir(app_handle, &modpack.id)?;

    let _ = instance::get_or_create_folder_name(app_handle, &modpack.id, &modpack.name);

    if is_empty_profile(&instance_dir) {
        sync_full_profile(app_handle, owner_address, &instance_dir).await
    } else {
        sync_delta(app_handle, owner_address, &instance_dir).await
    }
}

#[derive(Debug, Clone)]
struct CachedMod {
    identifier: String,
    version: String,
    enabled: bool,
    cache_dir: PathBuf,
    download_url: String,
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
            download_url: String::new(),
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
        download_url: version_info.download_url,
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
    _cache_base: &Path,
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

        let manifest = if cached_mod.is_loader {
            ManifestV2::new_loader(
                &cached_mod.identifier,
                &author,
                &display_name,
                &cached_mod.version,
                None,
                None,
                cached_mod.dependencies.clone(),
                None,
            )
        } else {
            ManifestV2::new(
                &cached_mod.identifier,
                &author,
                &display_name,
                &cached_mod.version,
                None,
                None,
                cached_mod.dependencies.clone(),
                None,
            )
        };

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

async fn fetch_sync_manifest(owner_address: &str) -> Result<SyncManifest, String> {
    let url = format!("http://{}/sync-manifest", owner_address);

    let response = HTTP_CLIENT
        .get(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch sync manifest: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch sync manifest: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse sync manifest: {}", e))
}

const DOWNLOAD_CONCURRENCY: usize = 8;

fn compute_file_hash(path: &std::path::Path) -> Result<String, std::io::Error> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
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

pub async fn hybrid_sync_from_owner(
    app_handle: AppHandle,
    modpack_id: String,
    modpack_name: String,
    owner_address: String,
) -> Result<HybridSyncResult, String> {
    let _ = app_handle.emit(
        "sync:progress",
        serde_json::json!({
            "phase": "connecting",
            "message": "Connecting to owner..."
        }),
    );

    let manifest = fetch_sync_manifest(&owner_address).await?;

    hybrid_sync_from_owner_with_manifest(
        app_handle,
        modpack_id,
        modpack_name,
        owner_address,
        manifest,
    )
    .await
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
                    &cache_base,
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
