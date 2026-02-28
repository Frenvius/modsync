use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize)]
pub struct ScanningProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Modpack {
    pub id: String,
    pub name: String,
    pub mods: Vec<ModEntry>,
    pub configs: Vec<ConfigEntry>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModEntry {
    pub path: String,
    pub filename: String,
    pub thunderstore_id: Option<String>,
    pub thunderstore_version: Option<String>,
    pub sha256: String,
    pub size: u64,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct ThunderstoreManifest {
    pub name: String,
    pub version_number: String,
    pub website_url: Option<String>,
    pub description: Option<String>,
    pub dependencies: Option<Vec<String>>,
}

pub fn calculate_file_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

pub fn parse_thunderstore_manifest(manifest_path: &Path) -> Option<(String, String)> {
    let content = fs::read_to_string(manifest_path).ok()?;
    let manifest: ThunderstoreManifest = serde_json::from_str(&content).ok()?;

    let author = if let Some(url) = &manifest.website_url {
        url.split('/').find(|s| !s.is_empty() && s != &"https:" && s != &"thunderstore.io" && s != &"c" && s != &"valheim" && s != &"p")
    } else if let Some(deps) = &manifest.dependencies {
        deps.first().and_then(|d| d.split('-').next())
    } else {
        None
    };

    let package_id = match author {
        Some(a) => format!("{}-{}", a, manifest.name),
        None => manifest.name.clone(),
    };

    Some((package_id, manifest.version_number))
}

pub fn scan_plugins_directory(plugins_path: &Path) -> Result<Vec<ModEntry>, String> {
    let mut mods = Vec::new();

    if !plugins_path.exists() {
        return Ok(mods);
    }

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        let relative_path = path
            .strip_prefix(plugins_path)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(extension, "dll" | "json" | "cfg" | "txt" | "png" | "jpg" | "xml") {
            continue;
        }

        let sha256 = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        let mut thunderstore_id = None;
        let mut thunderstore_version = None;
        let mut is_custom = true;

        if let Some(parent) = path.parent() {
            let manifest_path = parent.join("manifest.json");
            if manifest_path.exists() {
                if let Some((id, version)) = parse_thunderstore_manifest(&manifest_path) {
                    thunderstore_id = Some(id);
                    thunderstore_version = Some(version);
                    is_custom = false;
                }
            }

            if let Some(grandparent) = parent.parent() {
                let manifest_path = grandparent.join("manifest.json");
                if manifest_path.exists() && thunderstore_id.is_none() {
                    if let Some((id, version)) = parse_thunderstore_manifest(&manifest_path) {
                        thunderstore_id = Some(id);
                        thunderstore_version = Some(version);
                        is_custom = false;
                    }
                }
            }
        }

        mods.push(ModEntry {
            path: relative_path,
            filename,
            thunderstore_id,
            thunderstore_version,
            sha256,
            size,
            is_custom,
        });
    }

    Ok(mods)
}

pub fn scan_config_directory(config_path: &Path) -> Result<Vec<ConfigEntry>, String> {
    let mut configs = Vec::new();

    if !config_path.exists() {
        return Ok(configs);
    }

    for entry in WalkDir::new(config_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        let relative_path = path
            .strip_prefix(config_path)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(extension, "cfg" | "json" | "txt" | "xml" | "yaml" | "yml" | "ini") {
            continue;
        }

        let sha256 = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        configs.push(ConfigEntry {
            path: relative_path,
            sha256,
            size,
        });
    }

    Ok(configs)
}

pub fn scan_bepinex_directory(bepinex_path: &Path, name: &str, id: &str) -> Result<Modpack, String> {
    let plugins_path = bepinex_path.join("plugins");
    let config_path = bepinex_path.join("config");

    let mods = scan_plugins_directory(&plugins_path)?;
    let configs = scan_config_directory(&config_path)?;

    let updated_at = chrono_timestamp();

    Ok(Modpack {
        id: id.to_string(),
        name: name.to_string(),
        mods,
        configs,
        updated_at,
    })
}

fn chrono_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();

    let secs = duration.as_secs();

    format!("{}", secs)
}

fn count_scannable_files(dir_path: &Path, extensions: &[&str]) -> usize {
    if !dir_path.exists() {
        return 0;
    }

    WalkDir::new(dir_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            if path.is_dir() {
                return false;
            }
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            extensions.contains(&ext)
        })
        .count()
}

pub fn scan_bepinex_directory_with_progress(
    bepinex_path: &Path,
    name: &str,
    id: &str,
    app_handle: &AppHandle,
) -> Result<Modpack, String> {
    let plugins_path = bepinex_path.join("plugins");
    let config_path = bepinex_path.join("config");

    let plugin_extensions = ["dll", "json", "cfg", "txt", "png", "jpg", "xml"];
    let config_extensions = ["cfg", "json", "txt", "xml", "yaml", "yml", "ini"];

    let total_plugins = count_scannable_files(&plugins_path, &plugin_extensions);
    let total_configs = count_scannable_files(&config_path, &config_extensions);
    let total_files = total_plugins + total_configs;

    let _ = app_handle.emit(
        "scanning-progress",
        ScanningProgress {
            current: 0,
            total: total_files,
            filename: "Starting scan...".to_string(),
            phase: "counting".to_string(),
        },
    );

    let mods = scan_plugins_directory_with_progress(&plugins_path, app_handle, 0, total_files)?;

    let configs = scan_config_directory_with_progress(
        &config_path,
        app_handle,
        mods.len(),
        total_files,
    )?;

    let updated_at = chrono_timestamp();

    let _ = app_handle.emit("scanning-complete", ());

    Ok(Modpack {
        id: id.to_string(),
        name: name.to_string(),
        mods,
        configs,
        updated_at,
    })
}

fn scan_plugins_directory_with_progress(
    plugins_path: &Path,
    app_handle: &AppHandle,
    offset: usize,
    total: usize,
) -> Result<Vec<ModEntry>, String> {
    let mut mods = Vec::new();

    if !plugins_path.exists() {
        return Ok(mods);
    }

    let mut current = offset;

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(extension, "dll" | "json" | "cfg" | "txt" | "png" | "jpg" | "xml") {
            continue;
        }

        current += 1;
        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app_handle.emit(
            "scanning-progress",
            ScanningProgress {
                current,
                total,
                filename: filename.clone(),
                phase: "scanning".to_string(),
            },
        );

        let relative_path = path
            .strip_prefix(plugins_path)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let sha256 = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        let mut thunderstore_id = None;
        let mut thunderstore_version = None;
        let mut is_custom = true;

        if let Some(parent) = path.parent() {
            let manifest_path = parent.join("manifest.json");
            if manifest_path.exists() {
                if let Some((id, version)) = parse_thunderstore_manifest(&manifest_path) {
                    thunderstore_id = Some(id);
                    thunderstore_version = Some(version);
                    is_custom = false;
                }
            }

            if let Some(grandparent) = parent.parent() {
                let manifest_path = grandparent.join("manifest.json");
                if manifest_path.exists() && thunderstore_id.is_none() {
                    if let Some((id, version)) = parse_thunderstore_manifest(&manifest_path) {
                        thunderstore_id = Some(id);
                        thunderstore_version = Some(version);
                        is_custom = false;
                    }
                }
            }
        }

        mods.push(ModEntry {
            path: relative_path,
            filename,
            thunderstore_id,
            thunderstore_version,
            sha256,
            size,
            is_custom,
        });
    }

    Ok(mods)
}

fn scan_config_directory_with_progress(
    config_path: &Path,
    app_handle: &AppHandle,
    offset: usize,
    total: usize,
) -> Result<Vec<ConfigEntry>, String> {
    let mut configs = Vec::new();

    if !config_path.exists() {
        return Ok(configs);
    }

    let mut current = offset;

    for entry in WalkDir::new(config_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if path.is_dir() {
            continue;
        }

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(extension, "cfg" | "json" | "txt" | "xml" | "yaml" | "yml" | "ini") {
            continue;
        }

        current += 1;
        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app_handle.emit(
            "scanning-progress",
            ScanningProgress {
                current,
                total,
                filename,
                phase: "scanning".to_string(),
            },
        );

        let relative_path = path
            .strip_prefix(config_path)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string()
            .replace('\\', "/");

        let sha256 = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        configs.push(ConfigEntry {
            path: relative_path,
            sha256,
            size,
        });
    }

    Ok(configs)
}

#[derive(Debug, Serialize)]
pub struct SyncDiff {
    pub mods_to_download: Vec<ModEntry>,
    pub mods_to_remove: Vec<String>,
    pub configs_to_download: Vec<ConfigEntry>,
    pub configs_to_remove: Vec<String>,
}

pub fn compare_modpacks(local: &Modpack, remote: &Modpack) -> SyncDiff {
    let mut mods_to_download = Vec::new();
    let mut mods_to_remove = Vec::new();
    let mut configs_to_download = Vec::new();
    let mut configs_to_remove = Vec::new();

    for remote_mod in &remote.mods {
        let local_mod = local.mods.iter().find(|m| m.path == remote_mod.path);
        match local_mod {
            Some(lm) if lm.sha256 != remote_mod.sha256 => {
                mods_to_download.push(remote_mod.clone());
            }
            None => {
                mods_to_download.push(remote_mod.clone());
            }
            _ => {}
        }
    }

    for local_mod in &local.mods {
        if !remote.mods.iter().any(|m| m.path == local_mod.path) {
            mods_to_remove.push(local_mod.path.clone());
        }
    }

    for remote_config in &remote.configs {
        let local_config = local.configs.iter().find(|c| c.path == remote_config.path);
        match local_config {
            Some(lc) if lc.sha256 != remote_config.sha256 => {
                configs_to_download.push(remote_config.clone());
            }
            None => {
                configs_to_download.push(remote_config.clone());
            }
            _ => {}
        }
    }

    for local_config in &local.configs {
        if !remote.configs.iter().any(|c| c.path == local_config.path) {
            configs_to_remove.push(local_config.path.clone());
        }
    }

    SyncDiff {
        mods_to_download,
        mods_to_remove,
        configs_to_download,
        configs_to_remove,
    }
}
