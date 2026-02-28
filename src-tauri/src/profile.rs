use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmmProfile {
    pub name: String,
    pub bepinex_path: String,
    pub has_mods: bool,
}

fn get_tmm_profiles_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|d| {
            d.join("Thunderstore Mod Manager")
                .join("DataFolder")
                .join("Valheim")
                .join("profiles")
        })
        .ok_or("Could not find AppData directory".to_string())
}

#[tauri::command]
pub fn discover_tmm_profiles() -> Result<Vec<TmmProfile>, String> {
    let tmm_dir = get_tmm_profiles_dir()?;

    if !tmm_dir.exists() {
        return Ok(vec![]);
    }

    let mut profiles = Vec::new();
    let entries = fs::read_dir(&tmm_dir).map_err(|e| format!("Failed to read TMM profiles dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let bepinex_path = path.join("BepInEx");
            let has_bepinex = bepinex_path.exists() && bepinex_path.join("plugins").exists();

            let has_mods_yml = path.join("mods.yml").exists();

            if has_bepinex || has_mods_yml {
                let name = entry.file_name().to_string_lossy().to_string();
                profiles.push(TmmProfile {
                    name,
                    bepinex_path: bepinex_path.to_string_lossy().to_string(),
                    has_mods: has_bepinex,
                });
            }
        }
    }

    profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(profiles)
}

#[tauri::command]
pub fn get_tmm_bepinex_path(name: String) -> Result<String, String> {
    let tmm_dir = get_tmm_profiles_dir()?;
    let profile_path = tmm_dir.join(&name);

    if !profile_path.exists() {
        return Err(format!("TMM profile '{}' not found", name));
    }

    let bepinex_path = profile_path.join("BepInEx");
    Ok(bepinex_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_tmm_profile(name: String) -> Result<TmmProfile, String> {
    let tmm_dir = get_tmm_profiles_dir()?;
    let profile_path = tmm_dir.join(&name);

    if profile_path.exists() {
        return Err(format!("TMM profile '{}' already exists", name));
    }

    let bepinex_path = profile_path.join("BepInEx");
    let plugins_path = bepinex_path.join("plugins");
    let config_path = bepinex_path.join("config");

    fs::create_dir_all(&plugins_path)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    fs::create_dir_all(&config_path)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(TmmProfile {
        name,
        bepinex_path: bepinex_path.to_string_lossy().to_string(),
        has_mods: false,
    })
}
