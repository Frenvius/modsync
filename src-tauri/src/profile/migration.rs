use std::fs;
use std::path::PathBuf;

use super::models::TmmProfileInfo;
use super::storage;

fn get_tmm_profiles_dir(game_id: &str) -> Result<PathBuf, String> {
    let game_folder = match game_id {
        "valheim" => "Valheim",
        "ror2" => "RiskOfRain2",
        "lethal_company" => "LethalCompany",
        _ => return Err(format!("Unknown game ID for TMM: {}", game_id)),
    };

    dirs::data_dir()
        .map(|d| {
            d.join("Thunderstore Mod Manager")
                .join("DataFolder")
                .join(game_folder)
                .join("profiles")
        })
        .ok_or_else(|| "Could not find AppData directory".to_string())
}

pub fn discover_tmm_profiles(game_id: &str) -> Result<Vec<TmmProfileInfo>, String> {
    let tmm_dir = get_tmm_profiles_dir(game_id)?;

    if !tmm_dir.exists() {
        return Ok(vec![]);
    }

    let mut profiles = Vec::new();
    let entries = fs::read_dir(&tmm_dir)
        .map_err(|e| format!("Failed to read TMM profiles dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let bepinex_path = path.join("BepInEx");
            let plugins_path = bepinex_path.join("plugins");
            let has_bepinex = bepinex_path.exists() && plugins_path.exists();
            let has_mods_yml = path.join("mods.yml").exists();

            if has_bepinex || has_mods_yml {
                let name = entry.file_name().to_string_lossy().to_string();

                let mod_count = if plugins_path.exists() {
                    fs::read_dir(&plugins_path)
                        .map(|entries| entries.filter_map(|e| e.ok()).count())
                        .unwrap_or(0)
                } else {
                    0
                };

                profiles.push(TmmProfileInfo {
                    name,
                    path: path.clone(),
                    mod_count,
                    has_bepinex,
                });
            }
        }
    }

    profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(profiles)
}

pub fn import_tmm_profile(
    game_id: &str,
    tmm_profile_name: &str,
    target_profile_id: &str,
) -> Result<PathBuf, String> {
    let tmm_dir = get_tmm_profiles_dir(game_id)?;
    let tmm_profile_path = tmm_dir.join(tmm_profile_name);

    if !tmm_profile_path.exists() {
        return Err(format!("TMM profile '{}' not found", tmm_profile_name));
    }

    let target_dir = storage::get_profile_dir(game_id, target_profile_id)?;

    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profiles directory: {}", e))?;
    }

    copy_dir_recursive(&tmm_profile_path, &target_dir)?;

    Ok(target_dir)
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Failed to create directory: {}", e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(())
}

#[allow(dead_code)]
pub fn parse_tmm_mods_yml(profile_path: &std::path::Path) -> Result<Vec<TmmModEntry>, String> {
    let mods_yml_path = profile_path.join("mods.yml");

    if !mods_yml_path.exists() {
        return Ok(vec![]);
    }

    Ok(vec![])
}

#[derive(Debug, Clone)]
pub struct TmmModEntry {
    pub name: String,
    pub version: String,
    pub enabled: bool,
}

pub fn scan_tmm_plugins(profile_path: &std::path::Path) -> Result<Vec<ScannedMod>, String> {
    let plugins_dir = profile_path.join("BepInEx").join("plugins");

    if !plugins_dir.exists() {
        return Ok(vec![]);
    }

    let mut mods = Vec::new();

    for entry in fs::read_dir(&plugins_dir)
        .map_err(|e| format!("Failed to read plugins directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();

            let (author, mod_name) = if let Some(dash_pos) = name.find('-') {
                let author = name[..dash_pos].to_string();
                let mod_name = name[dash_pos + 1..].to_string();
                (Some(author), mod_name)
            } else {
                (None, name.clone())
            };

            mods.push(ScannedMod {
                folder_name: name,
                author,
                name: mod_name,
                path,
            });
        }
    }

    Ok(mods)
}

#[derive(Debug, Clone)]
pub struct ScannedMod {
    pub folder_name: String,
    pub author: Option<String>,
    pub name: String,
    pub path: PathBuf,
}
