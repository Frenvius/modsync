use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::modpack::Modpack;
use crate::AppSettings;

pub fn get_modpacks_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let modpacks_dir = app_data_dir.join("modpacks");

    if !modpacks_dir.exists() {
        fs::create_dir_all(&modpacks_dir)
            .map_err(|e| format!("Failed to create modpacks directory: {}", e))?;
    }

    Ok(modpacks_dir)
}

pub fn save_modpack(app_handle: &tauri::AppHandle, modpack: &Modpack) -> Result<(), String> {
    let modpacks_dir = get_modpacks_dir(app_handle)?;
    let file_path = modpacks_dir.join(format!("{}.json", modpack.id));

    let json = serde_json::to_string_pretty(modpack)
        .map_err(|e| format!("Failed to serialize modpack: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write modpack file: {}", e))?;

    Ok(())
}

pub fn load_modpack(app_handle: &tauri::AppHandle, id: &str) -> Result<Modpack, String> {
    let modpacks_dir = get_modpacks_dir(app_handle)?;
    let file_path = modpacks_dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err(format!("Modpack not found: {}", id));
    }

    let json = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read modpack file: {}", e))?;

    let modpack: Modpack =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse modpack: {}", e))?;

    Ok(modpack)
}

pub fn load_all_modpacks(app_handle: &tauri::AppHandle) -> Result<Vec<Modpack>, String> {
    let modpacks_dir = get_modpacks_dir(app_handle)?;

    let mut modpacks = Vec::new();

    let entries = fs::read_dir(&modpacks_dir)
        .map_err(|e| format!("Failed to read modpacks directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let json =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

            match serde_json::from_str::<Modpack>(&json) {
                Ok(modpack) => modpacks.push(modpack),
                Err(e) => eprintln!("Warning: Failed to parse modpack file {:?}: {}", path, e),
            }
        }
    }

    modpacks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(modpacks)
}

pub fn delete_modpack_file(app_handle: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let modpacks_dir = get_modpacks_dir(app_handle)?;
    let file_path = modpacks_dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err(format!("Modpack not found: {}", id));
    }

    fs::remove_file(&file_path).map_err(|e| format!("Failed to delete modpack file: {}", e))?;

    Ok(())
}

fn get_settings_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join("settings.json"))
}

pub fn load_settings(app_handle: &tauri::AppHandle) -> Result<AppSettings, String> {
    let file_path = get_settings_file(app_handle)?;

    if !file_path.exists() {
        return Ok(AppSettings::default());
    }

    let json = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    serde_json::from_str(&json).map_err(|e| format!("Failed to parse settings: {}", e))
}

pub fn save_settings(app_handle: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let file_path = get_settings_file(app_handle)?;

    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}
