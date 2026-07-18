use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

fn deserialize_mod_type<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let val: Option<Value> = Option::deserialize(deserializer)?;
    Ok(val.and_then(|v| match v {
        Value::String(s) => Some(s),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VsModInfo {
    #[serde(default, alias = "type", alias = "Type", deserialize_with = "deserialize_mod_type")]
    pub mod_type: Option<String>,
    #[serde(default, alias = "modid", alias = "modId", alias = "ModId", alias = "ModID")]
    pub modid: Option<String>,
    #[serde(default, alias = "Name")]
    pub name: Option<String>,
    #[serde(default, alias = "Version")]
    pub version: Option<String>,
    #[serde(default, alias = "Description")]
    pub description: Option<String>,
    #[serde(default, alias = "Authors")]
    pub authors: Option<Vec<String>>,
    #[serde(default, alias = "Side")]
    pub side: Option<String>,
    #[serde(default, alias = "Dependencies")]
    pub dependencies: Option<serde_json::Map<String, Value>>,
    #[serde(default, alias = "Website")]
    pub website: Option<String>,
}

pub fn read_modinfo_from_zip(zip_path: &Path) -> Option<VsModInfo> {
    let file = std::fs::File::open(zip_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    let mut modinfo = archive.by_name("modinfo.json").ok()?;
    let mut contents = String::new();
    std::io::Read::read_to_string(&mut modinfo, &mut contents).ok()?;

    serde_json::from_str(&contents).ok()
}

pub fn get_disabled_mods(data_dir: &Path) -> Result<Vec<String>, String> {
    let settings_path = data_dir.join("clientsettings.json");

    if !settings_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read clientsettings.json: {}", e))?;

    let json: Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse clientsettings.json: {}", e))?;

    let disabled = json
        .pointer("/stringListSettings/disabledMods")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(disabled)
}

pub fn set_disabled_mods(data_dir: &Path, disabled: &[String]) -> Result<(), String> {
    let settings_path = data_dir.join("clientsettings.json");

    let mut json: Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read clientsettings.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse clientsettings.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    let obj = json.as_object_mut().ok_or("clientsettings.json is not an object")?;

    let sls = obj
        .entry("stringListSettings")
        .or_insert_with(|| serde_json::json!({}));

    let sls_obj = sls
        .as_object_mut()
        .ok_or("stringListSettings is not an object")?;

    let disabled_value: Vec<Value> = disabled.iter().map(|s| Value::String(s.clone())).collect();
    sls_obj.insert("disabledMods".to_string(), Value::Array(disabled_value));

    let output = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize clientsettings.json: {}", e))?;

    std::fs::write(&settings_path, output)
        .map_err(|e| format!("Failed to write clientsettings.json: {}", e))?;

    Ok(())
}

pub fn is_mod_disabled(data_dir: &Path, modid: &str) -> Result<bool, String> {
    let disabled = get_disabled_mods(data_dir)?;
    Ok(disabled.iter().any(|d| {
        let base = d.split('@').next().unwrap_or(d);
        base == modid
    }))
}

pub fn disable_mod(data_dir: &Path, modid: &str) -> Result<(), String> {
    let mut disabled = get_disabled_mods(data_dir)?;
    if !disabled.iter().any(|d| d.split('@').next().unwrap_or(d) == modid) {
        disabled.push(modid.to_string());
    }
    set_disabled_mods(data_dir, &disabled)
}

pub fn enable_mod(data_dir: &Path, modid: &str) -> Result<(), String> {
    let mut disabled = get_disabled_mods(data_dir)?;
    disabled.retain(|d| d.split('@').next().unwrap_or(d) != modid);
    set_disabled_mods(data_dir, &disabled)
}

pub fn detect_game_version(data_dir: &Path) -> Option<String> {
    if let Some(version) = detect_version_from_logs(data_dir) {
        return Some(version);
    }

    detect_version_from_mods(data_dir)
}

fn detect_version_from_logs(data_dir: &Path) -> Option<String> {
    let logs_dir = data_dir.join("Logs");
    if !logs_dir.exists() {
        return None;
    }

    for name in &["client-main.txt", "server-main.txt"] {
        let log_path = logs_dir.join(name);
        if !log_path.exists() {
            continue;
        }

        let content = std::fs::read_to_string(&log_path).ok()?;
        for line in content.lines().take(30) {
            if let Some(version) = extract_version_from_line(line) {
                return Some(version);
            }
        }
    }

    None
}

fn extract_version_from_line(line: &str) -> Option<String> {
    let patterns = ["Game Version: v", "Game Version: ", "Running on v", "Version: v", "Version: "];
    for pat in &patterns {
        if let Some(idx) = line.find(pat) {
            let rest = &line[idx + pat.len()..];
            let version: String = rest
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            if !version.is_empty() && version.contains('.') {
                let clean = version.trim_end_matches(|c: char| c == '.' || c == '-');
                return Some(clean.to_string());
            }
        }
    }
    None
}

fn detect_version_from_mods(data_dir: &Path) -> Option<String> {
    let mods_dir = data_dir.join("Mods");
    if !mods_dir.exists() {
        return None;
    }

    let mut highest_version: Option<String> = None;

    let entries = std::fs::read_dir(&mods_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().map(|e| e == "zip").unwrap_or(false) {
            continue;
        }

        if let Some(info) = read_modinfo_from_zip(&path) {
            if let Some(deps) = &info.dependencies {
                if let Some(game_dep) = deps.get("game") {
                    if let Some(ver) = game_dep.as_str() {
                        if !ver.is_empty() {
                            let is_higher = highest_version
                                .as_ref()
                                .map(|h| ver > h.as_str())
                                .unwrap_or(true);
                            if is_higher {
                                highest_version = Some(ver.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    highest_version
}

pub fn detect_data_dir() -> Option<std::path::PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let path = std::path::PathBuf::from(&appdata).join("VintagestoryData");
        if path.exists() {
            return Some(path);
        }
    }

    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        let path = std::path::PathBuf::from(&localappdata).join("VintagestoryData");
        if path.exists() {
            return Some(path);
        }
    }

    None
}

#[derive(Debug, Serialize, Clone)]
pub struct ScannedMod {
    pub modid: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub filename: String,
    pub side: String,
    pub enabled: bool,
    pub mod_type: String,
    pub db_slug: Option<String>,
    pub db_icon_url: Option<String>,
}

pub fn scan_mods_in_dir(
    data_dir: &Path,
) -> Result<Vec<ScannedMod>, String> {
    let mods_dir = data_dir.join("Mods");
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let disabled = get_disabled_mods(data_dir)?;

    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read Mods directory: {}", e))?;

    let mut scanned = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();

        if !filename.ends_with(".zip") && !filename.ends_with(".cs") {
            if path.is_dir() {
                let modinfo_path = path.join("modinfo.json");
                if modinfo_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&modinfo_path) {
                        if let Ok(info) = serde_json::from_str::<VsModInfo>(&content) {
                            let modid = info
                                .modid
                                .clone()
                                .unwrap_or_else(|| filename.clone());

                            let is_disabled = disabled.iter().any(|d| {
                                d.split('@').next().unwrap_or(d) == modid
                            });

                            scanned.push(ScannedMod {
                                modid: modid.clone(),
                                name: info.name.unwrap_or_else(|| modid.clone()),
                                version: info.version.unwrap_or_else(|| "unknown".to_string()),
                                author: info
                                    .authors
                                    .as_ref()
                                    .and_then(|a| a.first().cloned())
                                    .unwrap_or_else(|| "Unknown".to_string()),
                                filename,
                                side: info.side.unwrap_or_else(|| "universal".to_string()),
                                enabled: !is_disabled,
                                mod_type: info.mod_type.unwrap_or_else(|| "code".to_string()),
                                db_slug: None,
                                db_icon_url: None,
                            });
                        }
                    }
                }
                continue;
            }
            continue;
        }

        if filename.ends_with(".cs") {
            continue;
        }

        if let Some(info) = read_modinfo_from_zip(&path) {
            let modid = info
                .modid
                .clone()
                .unwrap_or_else(|| filename.trim_end_matches(".zip").to_string());

            let is_disabled = disabled.iter().any(|d| {
                d.split('@').next().unwrap_or(d) == modid
            });

            scanned.push(ScannedMod {
                modid: modid.clone(),
                name: info.name.unwrap_or_else(|| modid.clone()),
                version: info.version.unwrap_or_else(|| "unknown".to_string()),
                author: info
                    .authors
                    .as_ref()
                    .and_then(|a| a.first().cloned())
                    .unwrap_or_else(|| "Unknown".to_string()),
                filename,
                side: info.side.unwrap_or_else(|| "universal".to_string()),
                enabled: !is_disabled,
                mod_type: info.mod_type.unwrap_or_else(|| "code".to_string()),
                db_slug: None,
                db_icon_url: None,
            });
        }
    }

    scanned.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(scanned)
}

#[derive(Debug, Serialize, Clone)]
pub struct ModStatus {
    pub modid: String,
    pub side: String,
    pub status_level: String,
    pub issues: Vec<String>,
    pub game_version_compatible: bool,
}

pub fn check_mod_statuses(
    data_dir: &Path,
    game_version: &str,
) -> Result<Vec<ModStatus>, String> {
    let mods_dir = data_dir.join("Mods");
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let disabled = get_disabled_mods(data_dir)?;

    struct LocalMod {
        modid: String,
        version: String,
        side: String,
        deps: Option<serde_json::Map<String, Value>>,
    }

    let mut all_mods: Vec<LocalMod> = Vec::new();

    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read Mods dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("").to_string();

        let info = if filename.ends_with(".zip") {
            read_modinfo_from_zip(&path)
        } else if path.is_dir() {
            let modinfo_path = path.join("modinfo.json");
            if modinfo_path.exists() {
                std::fs::read_to_string(&modinfo_path)
                    .ok()
                    .and_then(|c| serde_json::from_str::<VsModInfo>(&c).ok())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(info) = info {
            let modid = info.modid.clone().unwrap_or_else(|| filename.trim_end_matches(".zip").to_string());
            let version = info.version.clone().unwrap_or_else(|| "0.0.0".to_string());
            let side = match info.side.as_deref().map(|s| s.to_lowercase()).as_deref() {
                Some("universal") | None => "both".to_string(),
                Some(s) => s.to_string(),
            };
            all_mods.push(LocalMod { modid, version, side, deps: info.dependencies });
        }
    }

    let installed_map: std::collections::HashMap<String, String> = all_mods
        .iter()
        .map(|m| (m.modid.clone(), m.version.clone()))
        .collect();

    let builtin = ["game", "survival", "creative"];
    let gv = game_version.trim();

    let mut statuses = Vec::new();

    for local_mod in &all_mods {
        if builtin.contains(&local_mod.modid.as_str()) {
            continue;
        }

        let is_disabled = disabled.iter().any(|d| d.split('@').next().unwrap_or(d) == local_mod.modid);
        if is_disabled {
            continue;
        }

        let mut issues: Vec<String> = Vec::new();

        let game_dep_version = local_mod.deps.as_ref()
            .and_then(|d| d.get("game"))
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let has_version_constraint = !game_dep_version.is_empty();
        let game_compatible = !has_version_constraint || version_satisfies(gv, game_dep_version);

        if let Some(dep_map) = &local_mod.deps {
            for (dep_id, dep_ver_val) in dep_map {
                if builtin.contains(&dep_id.as_str()) {
                    continue;
                }

                if !installed_map.contains_key(dep_id.as_str()) {
                    let req_ver = dep_ver_val.as_str().unwrap_or("");
                    if req_ver.is_empty() {
                        issues.push(format!("Requires dependency {}", dep_id));
                    } else {
                        issues.push(format!("Requires dependency {} v{}", dep_id, req_ver));
                    }
                }
            }
        }

        let status_level = if issues.iter().any(|i| i.starts_with("Requires dependency")) {
            "error".to_string()
        } else if !game_compatible {
            "warning".to_string()
        } else if has_version_constraint {
            "ok".to_string()
        } else {
            "unknown".to_string()
        };

        statuses.push(ModStatus {
            modid: local_mod.modid.clone(),
            side: local_mod.side.clone(),
            status_level,
            issues,
            game_version_compatible: game_compatible,
        });
    }

    Ok(statuses)
}

fn version_satisfies(installed: &str, required: &str) -> bool {
    let installed_parts = parse_version_parts(installed);
    let required_parts = parse_version_parts(required);

    for i in 0..required_parts.len() {
        let inst = installed_parts.get(i).copied().unwrap_or(0);
        let req = required_parts[i];
        if inst > req {
            return true;
        }
        if inst < req {
            return false;
        }
    }
    true
}

fn parse_version_parts(version: &str) -> Vec<i32> {
    let clean = version.split('-').next().unwrap_or(version);
    clean
        .split('.')
        .filter_map(|p| p.parse::<i32>().ok())
        .collect()
}
