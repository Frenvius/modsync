use std::path::PathBuf;

use super::bepinex::{self, ConfigFile};

fn get_config_dir() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir()
        .ok_or("Could not find AppData directory")?;

    let tmm_path = app_data
        .join("Thunderstore Mod Manager")
        .join("DataFolder")
        .join("Valheim")
        .join("profiles");

    if tmm_path.exists() {
        for entry in std::fs::read_dir(&tmm_path).map_err(|e| e.to_string())? {
            if let Ok(entry) = entry {
                let profile_config = entry.path().join("BepInEx").join("config");
                if profile_config.exists() {
                    return Ok(profile_config);
                }
            }
        }
    }

    Err("No config directory found".to_string())
}

#[tauri::command]
pub fn get_config_files() -> Result<Vec<String>, String> {
    let config_dir = get_config_dir()?;
    bepinex::list_config_files(&config_dir)
}

#[tauri::command]
pub fn get_profile_config_files(profile_name: String) -> Result<Vec<String>, String> {
    let app_data = dirs::data_dir()
        .ok_or("Could not find AppData directory")?;

    let config_dir = app_data
        .join("Thunderstore Mod Manager")
        .join("DataFolder")
        .join("Valheim")
        .join("profiles")
        .join(&profile_name)
        .join("BepInEx")
        .join("config");

    if !config_dir.exists() {
        return Ok(Vec::new());
    }

    bepinex::list_config_files(&config_dir)
}

#[tauri::command]
pub fn parse_config_file(path: String) -> Result<ConfigFile, String> {
    let path = PathBuf::from(&path);
    bepinex::parse_config_file(&path)
}

#[tauri::command]
pub fn set_config_entry(
    path: String,
    section: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let path = PathBuf::from(&path);
    bepinex::update_config_entry(&path, &section, &key, &value)
}

#[tauri::command]
pub fn reset_config_entry(
    path: String,
    section: String,
    key: String,
) -> Result<String, String> {
    let path = PathBuf::from(&path);
    bepinex::reset_config_entry(&path, &section, &key)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConfigFileSummary {
    pub path: String,
    pub filename: String,
    pub mod_name: Option<String>,
    pub section_count: usize,
    pub entry_count: usize,
}

#[tauri::command]
pub fn get_config_summaries(profile_name: String) -> Result<Vec<ConfigFileSummary>, String> {
    let files = get_profile_config_files(profile_name)?;
    let mut summaries = Vec::new();

    for file_path in files {
        let path = PathBuf::from(&file_path);
        if let Ok(config) = bepinex::parse_config_file(&path) {
            let entry_count: usize = config.sections.iter()
                .map(|s| s.entries.len())
                .sum();

            summaries.push(ConfigFileSummary {
                path: file_path,
                filename: config.filename,
                mod_name: config.mod_name,
                section_count: config.sections.len(),
                entry_count,
            });
        }
    }

    Ok(summaries)
}
