use std::path::PathBuf;

use super::bepinex::{self, ConfigFile};

fn config_dir_for_profile_path(profile_path: &std::path::Path) -> PathBuf {
    profile_path.join("BepInEx").join("config")
}

#[tauri::command]
pub fn get_config_files() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn get_profile_config_files(profile_path: String) -> Result<Vec<String>, String> {
    let config_dir = config_dir_for_profile_path(std::path::Path::new(&profile_path));

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
pub fn get_config_summaries(profile_path: String) -> Result<Vec<ConfigFileSummary>, String> {
    let files = get_profile_config_files(profile_path)?;
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
