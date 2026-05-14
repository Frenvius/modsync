use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::games;
use crate::instance;
use crate::modpack::{Modpack, ModpackIdentity, ModpackMod};
use crate::sources::modrinth::profile as modrinth_profile;
use crate::sources::thunderstore::profile as thunderstore_profile;
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

fn modpack_file_path(app_handle: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(get_modpacks_dir(app_handle)?.join(format!("{}.json", id)))
}

fn mod_source_for(game_id: &str) -> &'static str {
    match games::get_game(game_id) {
        Some(g) if g.mod_source == "thunderstore" => "thunderstore",
        Some(g) if g.mod_source == "modrinth" => "modrinth",
        _ => "unknown",
    }
}

fn compose_mods_from_disk(
    app_handle: &tauri::AppHandle,
    identity: &ModpackIdentity,
) -> Vec<ModpackMod> {
    let instance_dir = match instance::get_instance_dir(app_handle, &identity.id) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };

    match mod_source_for(&identity.game_id) {
        "thunderstore" => {
            if !instance_dir.exists() {
                return Vec::new();
            }
            thunderstore_profile::load_mods_yml(&instance_dir)
                .unwrap_or_default()
                .into_iter()
                .map(|m| ModpackMod {
                    slug: m.name.clone(),
                    title: m.display_name.clone(),
                    version: m.version_number.to_string(),
                    author: m.author_name.clone(),
                    icon_url: m.icon.clone(),
                    project_id: None,
                    version_id: None,
                    enabled: m.enabled,
                    filename: None,
                    is_loader: games::is_loader_package(&m.name),
                    is_deprecated: false,
                })
                .collect()
        }
        "modrinth" => modrinth_profile::load_mods_json(&instance_dir).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn persist_mods_for_game(
    app_handle: &tauri::AppHandle,
    modpack: &Modpack,
) -> Result<(), String> {
    if mod_source_for(&modpack.game_id) != "modrinth" {
        return Ok(());
    }

    let instance_dir = instance::get_instance_dir(app_handle, &modpack.id)?;
    modrinth_profile::save_mods_json(&instance_dir, &modpack.mods)
}

pub fn save_modpack(app_handle: &tauri::AppHandle, modpack: &Modpack) -> Result<(), String> {
    let file_path = modpack_file_path(app_handle, &modpack.id)?;

    let identity = ModpackIdentity::from(modpack);
    let json = serde_json::to_string_pretty(&identity)
        .map_err(|e| format!("Failed to serialize modpack: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write modpack file: {}", e))?;

    persist_mods_for_game(app_handle, modpack)?;

    Ok(())
}

fn read_identity(path: &std::path::Path) -> Result<ModpackIdentity, String> {
    let json =
        fs::read_to_string(path).map_err(|e| format!("Failed to read modpack file: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse modpack: {}", e))
}

pub fn load_modpack(app_handle: &tauri::AppHandle, id: &str) -> Result<Modpack, String> {
    let file_path = modpack_file_path(app_handle, id)?;

    if !file_path.exists() {
        return Err(format!("Modpack not found: {}", id));
    }

    let mut identity = read_identity(&file_path)?;
    let legacy_mods = identity.legacy_mods.take();

    let source = mod_source_for(&identity.game_id);
    let instance_dir = instance::get_instance_dir(app_handle, &identity.id).ok();

    let mut mods = compose_mods_from_disk(app_handle, &identity);

    if let Some(legacy) = legacy_mods {
        let needs_migration = match source {
            "modrinth" => {
                if let Some(dir) = instance_dir.as_ref() {
                    !modrinth_profile::mods_json_path(dir).exists()
                } else {
                    true
                }
            }
            _ => false,
        };

        if needs_migration && !legacy.is_empty() {
            if source == "modrinth" {
                if let Some(dir) = instance_dir.as_ref() {
                    let _ = modrinth_profile::save_mods_json(dir, &legacy);
                    mods = legacy;
                }
            }
        } else if mods.is_empty() && !legacy.is_empty() {
            mods = legacy;
        }

        let stripped = identity.clone().into_modpack(mods.clone());
        let _ = write_identity_only(&file_path, &stripped);
    }

    Ok(identity.into_modpack(mods))
}

fn write_identity_only(path: &std::path::Path, modpack: &Modpack) -> Result<(), String> {
    let identity = ModpackIdentity::from(modpack);
    let json = serde_json::to_string_pretty(&identity)
        .map_err(|e| format!("Failed to serialize modpack: {}", e))?;
    fs::write(path, json).map_err(|e| format!("Failed to write modpack file: {}", e))
}

pub fn load_all_modpacks(app_handle: &tauri::AppHandle) -> Result<Vec<Modpack>, String> {
    let modpacks_dir = get_modpacks_dir(app_handle)?;

    let mut modpacks = Vec::new();

    let entries = fs::read_dir(&modpacks_dir)
        .map_err(|e| format!("Failed to read modpacks directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        let id = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        match load_modpack(app_handle, &id) {
            Ok(modpack) => modpacks.push(modpack),
            Err(e) => eprintln!("Warning: Failed to load modpack file {:?}: {}", path, e),
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
