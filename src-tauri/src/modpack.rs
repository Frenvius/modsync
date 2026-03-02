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
    pub name: Option<String>,
    pub author: Option<String>,
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
    pub author: Option<String>,
    pub version_number: String,
    pub website_url: Option<String>,
    pub description: Option<String>,
    pub dependencies: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct MmV2VersionNumber {
    major: u32,
    minor: u32,
    patch: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MmV2Manifest {
    name: String,
    author_name: Option<String>,
    display_name: Option<String>,
    version_number: MmV2VersionNumber,
    website_url: Option<String>,
    dependencies: Option<Vec<String>>,
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

pub struct ParsedManifest {
    pub name: String,
    pub author: Option<String>,
    pub package_id: String,
    pub version: String,
}

pub fn parse_thunderstore_manifest(manifest_path: &Path, folder_name: &str, yml_author: Option<&str>) -> Option<ParsedManifest> {
    let content = fs::read_to_string(manifest_path).ok()?;
    let content = content.strip_prefix('\u{feff}').unwrap_or(&content);

    let (raw_name, manifest_author, version, website_url, dependencies) =
        if let Ok(m) = serde_json::from_str::<ThunderstoreManifest>(content) {
            (m.name, m.author, m.version_number, m.website_url, m.dependencies)
        } else if let Ok(m) = serde_json::from_str::<MmV2Manifest>(content) {
            let version = format!("{}.{}.{}", m.version_number.major, m.version_number.minor, m.version_number.patch);
            let name = m.display_name.unwrap_or(m.name);
            (name, m.author_name, version, m.website_url, m.dependencies)
        } else {
            return None;
        };

    let parts: Vec<&str> = folder_name.splitn(3, '-').collect();

    let (package_id, author) = if let Some(author) = manifest_author {
        (format!("{}-{}", author, raw_name), Some(author))
    } else if let Some(author) = yml_author {
        (format!("{}-{}", author, raw_name), Some(author.to_string()))
    } else {
        let suffix = format!("-{}", raw_name);
        if folder_name.ends_with(&suffix) && folder_name.len() > suffix.len() {
            let author = folder_name[..folder_name.len() - suffix.len()].to_string();
            (format!("{}-{}", author, raw_name), Some(author))
        } else if parts.len() >= 2 {
            let owner = parts[0].to_string();
            let pkg_name = parts[1].to_string();
            (format!("{}-{}", owner, pkg_name), Some(owner))
        } else {
            let author = if let Some(url) = &website_url {
                url.split('/')
                    .find(|s| !s.is_empty() && *s != "https:" && *s != "thunderstore.io" && *s != "c" && *s != "valheim" && *s != "p")
                    .map(|s| s.to_string())
            } else if let Some(deps) = &dependencies {
                deps.first().and_then(|d| d.split('-').next()).map(|s| s.to_string())
            } else {
                None
            };

            let package_id = match &author {
                Some(a) => format!("{}-{}", a, raw_name),
                None => raw_name.clone(),
            };

            (package_id, author)
        }
    };

    Some(ParsedManifest {
        name: raw_name,
        author,
        package_id,
        version,
    })
}

pub fn scan_plugins_directory(plugins_path: &Path) -> Result<Vec<ModEntry>, String> {
    use std::collections::{HashMap, HashSet};

    let mut mods = Vec::new();

    if !plugins_path.exists() {
        return Ok(mods);
    }

    let mods_yml_path = plugins_path.parent()
        .and_then(|bepinex| bepinex.parent())
        .map(|profile| profile.join("mods.yml"));

    let author_map: HashMap<String, String> = mods_yml_path
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|content| serde_yaml::from_str::<Vec<crate::profile::models::YmlMod>>(&content).ok())
        .map(|mods| mods.into_iter()
            .filter_map(|m| m.author.map(|a| (m.package_id, a)))
            .collect())
        .unwrap_or_default();

    let mut processed_mod_dirs: HashSet<std::path::PathBuf> = HashSet::new();

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let is_manifest = path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with("manifest.json"))
            .unwrap_or(false);
        if is_manifest {
            if let Some(mod_dir) = path.parent() {
                let folder_name = mod_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let yml_author = author_map.get(&folder_name).map(|s| s.as_str());
                if let Some(parsed) = parse_thunderstore_manifest(path, &folder_name, yml_author) {
                    let (combined_hash, total_size) = calculate_folder_hash_and_size(mod_dir)?;

                    let main_dll = find_main_dll(mod_dir);

                    let relative_path = mod_dir
                        .strip_prefix(plugins_path)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .to_string()
                        .replace('\\', "/");

                    mods.push(ModEntry {
                        path: relative_path,
                        filename: main_dll.unwrap_or(folder_name),
                        name: Some(parsed.name),
                        author: parsed.author,
                        thunderstore_id: Some(parsed.package_id),
                        thunderstore_version: Some(parsed.version),
                        sha256: combined_hash,
                        size: total_size,
                        is_custom: false,
                    });

                    processed_mod_dirs.insert(mod_dir.to_path_buf());
                }
            }
        }
    }

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if extension != "dll" {
            continue;
        }

        let is_in_processed_dir = processed_mod_dirs.iter().any(|mod_dir| {
            path.starts_with(mod_dir)
        });

        if is_in_processed_dir {
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

        let sha256 = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        let name_from_filename = extract_name_from_dll_filename(&filename);

        mods.push(ModEntry {
            path: relative_path,
            filename: filename.clone(),
            name: name_from_filename,
            author: None,
            thunderstore_id: None,
            thunderstore_version: None,
            sha256,
            size,
            is_custom: true,
        });
    }

    Ok(mods)
}

fn calculate_folder_hash_and_size(folder_path: &Path) -> Result<(String, u64), String> {
    let mut hasher = Sha256::new();
    let mut total_size: u64 = 0;

    let mut files: Vec<_> = WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();
    files.sort_by(|a, b| a.path().cmp(b.path()));

    for entry in files {
        let path = entry.path();
        let file_hash = calculate_file_hash(path).map_err(|e| e.to_string())?;
        let size = path.metadata().map_err(|e| e.to_string())?.len();

        hasher.update(file_hash.as_bytes());
        total_size += size;
    }

    Ok((hex::encode(hasher.finalize()), total_size))
}

fn find_main_dll(folder_path: &Path) -> Option<String> {
    for entry in WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "dll" {
                    return path.file_name().map(|n| n.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

fn extract_name_from_dll_filename(filename: &str) -> Option<String> {
    let name = filename.trim_end_matches(".dll");
    if name.is_empty() {
        return None;
    }

    let parts: Vec<&str> = name.split('-').collect();
    if parts.len() >= 2 {
        return Some(parts[1].to_string());
    }

    let parts: Vec<&str> = name.split('_').collect();
    if parts.len() >= 2 {
        return Some(parts[1..].join("_"));
    }

    Some(name.to_string())
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

fn count_mods_in_plugins_dir(plugins_path: &Path) -> usize {
    use std::collections::HashSet;

    if !plugins_path.exists() {
        return 0;
    }

    let mut processed_mod_dirs: HashSet<std::path::PathBuf> = HashSet::new();
    let mut count = 0;

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let is_manifest = path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with("manifest.json"))
            .unwrap_or(false);
        if path.is_file() && is_manifest {
            if let Some(mod_dir) = path.parent() {
                processed_mod_dirs.insert(mod_dir.to_path_buf());
                count += 1;
            }
        }
    }

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext == "dll" {
                let is_in_processed_dir = processed_mod_dirs.iter().any(|mod_dir| {
                    path.starts_with(mod_dir)
                });
                if !is_in_processed_dir {
                    count += 1;
                }
            }
        }
    }

    count
}

fn count_config_files(config_path: &Path, extensions: &[&str]) -> usize {
    if !config_path.exists() {
        return 0;
    }

    WalkDir::new(config_path)
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

    let config_extensions = ["cfg", "json", "txt", "xml", "yaml", "yml", "ini"];

    let total_mods = count_mods_in_plugins_dir(&plugins_path);
    let total_configs = count_config_files(&config_path, &config_extensions);
    let total_items = total_mods + total_configs;

    let _ = app_handle.emit(
        "scanning-progress",
        ScanningProgress {
            current: 0,
            total: total_items,
            filename: "Starting scan...".to_string(),
            phase: "counting".to_string(),
        },
    );

    let mods = scan_plugins_directory_with_progress(&plugins_path, app_handle, 0, total_items)?;

    let configs = scan_config_directory_with_progress(
        &config_path,
        app_handle,
        mods.len(),
        total_items,
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
    use std::collections::{HashMap, HashSet};

    let mut mods = Vec::new();

    if !plugins_path.exists() {
        return Ok(mods);
    }

    let mods_yml_path = plugins_path.parent()
        .and_then(|bepinex| bepinex.parent())
        .map(|profile| profile.join("mods.yml"));

    let author_map: HashMap<String, String> = mods_yml_path
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|content| serde_yaml::from_str::<Vec<crate::profile::models::YmlMod>>(&content).ok())
        .map(|mods| mods.into_iter()
            .filter_map(|m| m.author.map(|a| (m.package_id, a)))
            .collect())
        .unwrap_or_default();

    let mut current = offset;
    let mut processed_mod_dirs: HashSet<std::path::PathBuf> = HashSet::new();

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let is_manifest = path.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.ends_with("manifest.json"))
            .unwrap_or(false);
        if is_manifest {
            if let Some(mod_dir) = path.parent() {
                let folder_name = mod_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let yml_author = author_map.get(&folder_name).map(|s| s.as_str());
                if let Some(parsed) = parse_thunderstore_manifest(path, &folder_name, yml_author) {
                    current += 1;

                    let _ = app_handle.emit(
                        "scanning-progress",
                        ScanningProgress {
                            current,
                            total,
                            filename: parsed.name.clone(),
                            phase: "scanning".to_string(),
                        },
                    );

                    let (combined_hash, total_size) = calculate_folder_hash_and_size(mod_dir)?;

                    let main_dll = find_main_dll(mod_dir);

                    let relative_path = mod_dir
                        .strip_prefix(plugins_path)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .to_string()
                        .replace('\\', "/");

                    mods.push(ModEntry {
                        path: relative_path,
                        filename: main_dll.unwrap_or(folder_name),
                        name: Some(parsed.name),
                        author: parsed.author,
                        thunderstore_id: Some(parsed.package_id),
                        thunderstore_version: Some(parsed.version),
                        sha256: combined_hash,
                        size: total_size,
                        is_custom: false,
                    });

                    processed_mod_dirs.insert(mod_dir.to_path_buf());
                }
            }
        }
    }

    for entry in WalkDir::new(plugins_path)
        .min_depth(1)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if extension != "dll" {
            continue;
        }

        let is_in_processed_dir = processed_mod_dirs.iter().any(|mod_dir| {
            path.starts_with(mod_dir)
        });

        if is_in_processed_dir {
            continue;
        }

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        current += 1;

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

        let name_from_filename = extract_name_from_dll_filename(&filename);

        mods.push(ModEntry {
            path: relative_path,
            filename: filename.clone(),
            name: name_from_filename,
            author: None,
            thunderstore_id: None,
            thunderstore_version: None,
            sha256,
            size,
            is_custom: true,
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
