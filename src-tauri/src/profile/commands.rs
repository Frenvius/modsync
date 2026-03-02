use chrono::Utc;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

use super::models::{ModKind, ModUpdateInfo, Profile, ProfileMod, ProfileSummary, R2zPreview, TmmProfileInfo};
use super::r2z;
use super::{db::ProfileDb, migration, storage};

fn get_db() -> Result<ProfileDb, String> {
    let db_path = storage::get_database_path()?;

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {}", e))?;
    }

    ProfileDb::open(&db_path)
}

#[tauri::command]
pub fn create_profile(
    game_id: String,
    name: String,
    custom_path: Option<String>,
) -> Result<Profile, String> {
    let db = get_db()?;

    if db.profile_name_exists(&game_id, &name)? {
        return Err(format!("A profile named '{}' already exists", name));
    }

    let profile_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let profile_path = if let Some(ref path_str) = custom_path {
        let custom = PathBuf::from(path_str);
        validate_custom_path(&custom)?;
        storage::create_profile_directory_at(&custom)?;
        custom
    } else {
        let folder_name = storage::name_to_folder_name(&name);
        storage::create_profile_directory(&game_id, &folder_name)?
    };

    let profile = Profile {
        id: profile_id,
        name,
        game_id,
        path: profile_path,
        mods: vec![],
        created_at: now,
        updated_at: now,
    };

    db.create_profile(&profile)?;

    storage::write_profile_metadata(&profile)?;

    Ok(profile)
}

fn validate_custom_path(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("Cannot read custom path: {}", e))?
            .count();
        if entries > 0 {
            return Err(format!(
                "Custom path '{}' already exists and is not empty",
                path.display()
            ));
        }
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Custom path has no parent directory".to_string())?;

    if !parent.exists() {
        return Err(format!(
            "Parent directory '{}' does not exist",
            parent.display()
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn get_profiles(game_id: String) -> Result<Vec<ProfileSummary>, String> {
    let db = get_db()?;
    db.get_profiles(&game_id)
}

#[tauri::command]
pub fn get_profile(profile_id: String) -> Result<Profile, String> {
    let db = get_db()?;
    db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))
}

#[tauri::command]
pub fn delete_profile(profile_id: String) -> Result<(), String> {
    let db = get_db()?;

    let profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    db.delete_profile(&profile_id)?;

    storage::delete_profile_directory(&profile.path)?;

    Ok(())
}

#[tauri::command]
pub fn rename_profile(profile_id: String, new_name: String) -> Result<Profile, String> {
    let db = get_db()?;

    let mut profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    if profile.name != new_name && db.profile_name_exists(&profile.game_id, &new_name)? {
        return Err(format!("A profile named '{}' already exists", new_name));
    }

    let now = Utc::now().timestamp();

    db.rename_profile(&profile_id, &new_name, now)?;

    profile.name = new_name;
    profile.updated_at = now;

    storage::write_profile_metadata(&profile)?;

    Ok(profile)
}

#[tauri::command]
pub fn duplicate_profile(profile_id: String, new_name: String) -> Result<Profile, String> {
    let db = get_db()?;

    let source_profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    if db.profile_name_exists(&source_profile.game_id, &new_name)? {
        return Err(format!("A profile named '{}' already exists", new_name));
    }

    let new_profile_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let new_folder_name = storage::name_to_folder_name(&new_name);
    let new_path = storage::duplicate_profile_directory(
        &source_profile.path,
        &source_profile.game_id,
        &new_folder_name,
    )?;

    let mut new_mods = Vec::new();
    for old_mod in &source_profile.mods {
        new_mods.push(ProfileMod {
            id: Uuid::new_v4().to_string(),
            package_id: old_mod.package_id.clone(),
            version: old_mod.version.clone(),
            enabled: old_mod.enabled,
            kind: old_mod.kind.clone(),
            install_time: now,
        });
    }

    let new_profile = Profile {
        id: new_profile_id,
        name: new_name,
        game_id: source_profile.game_id,
        path: new_path,
        mods: new_mods.clone(),
        created_at: now,
        updated_at: now,
    };

    db.create_profile(&new_profile)?;

    for mod_entry in &new_mods {
        db.add_mod(&new_profile.id, mod_entry)?;
    }

    storage::write_profile_metadata(&new_profile)?;

    Ok(new_profile)
}

#[tauri::command]
pub fn set_active_profile(game_id: String, profile_id: String) -> Result<(), String> {
    let db = get_db()?;

    let _ = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    db.set_active_profile(&game_id, &profile_id)
}

#[tauri::command]
pub fn get_active_profile(game_id: String) -> Result<Option<Profile>, String> {
    let db = get_db()?;

    let profile_id = db.get_active_profile_id(&game_id)?;

    match profile_id {
        Some(id) => db.get_profile(&id),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn get_active_bepinex_path(game_id: String) -> Result<String, String> {
    let db = get_db()?;

    let profile_id = db.get_active_profile_id(&game_id)?
        .ok_or_else(|| format!("No active profile set for game '{}'", game_id))?;

    let profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Active profile '{}' not found", profile_id))?;

    let bepinex_path = profile.path.join("BepInEx");
    Ok(bepinex_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_profile_mods_fast(profile_id: String) -> Result<Vec<super::models::YmlMod>, String> {
    let db = get_db()?;
    let profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;
    storage::read_mods_yml(&profile.path)
}

#[tauri::command]
pub fn update_profile_mods_yml(
    profile_id: String,
    mods: Vec<super::models::YmlMod>,
) -> Result<(), String> {
    let db = get_db()?;
    let profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;
    storage::write_mods_yml(&profile.path, &mods)
}

#[tauri::command]
pub fn set_mod_enabled(profile_id: String, package_id: String, enabled: bool) -> Result<(), String> {
    let db = get_db()?;

    let profile = db.get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    let plugins_path = profile.path.join("BepInEx").join("plugins");

    storage::set_mod_enabled_on_disk(&plugins_path, &package_id, enabled)?;

    db.set_mod_enabled(&profile_id, &package_id, enabled)?;

    let mut yml_mods = storage::read_mods_yml(&profile.path)?;
    for m in yml_mods.iter_mut() {
        if m.package_id == package_id {
            m.enabled = enabled;
        }
    }
    storage::write_mods_yml(&profile.path, &yml_mods)?;

    Ok(())
}

#[tauri::command]
pub fn preview_r2z(r2z_path: String) -> Result<R2zPreview, String> {
    let path = std::path::Path::new(&r2z_path);
    r2z::preview_r2z(path)
}

#[derive(Debug, Clone, serde::Serialize)]
struct R2zImportProgress {
    current: usize,
    total: usize,
    mod_name: String,
}

#[tauri::command]
pub async fn import_r2z(
    game_id: String,
    r2z_path: String,
    profile_name: Option<String>,
    app_handle: tauri::AppHandle,
) -> Result<Profile, String> {
    let db = get_db()?;
    let path = std::path::PathBuf::from(&r2z_path);

    let manifest = r2z::parse_r2z_file(&path)?;

    let name = profile_name.unwrap_or_else(|| manifest.profile_name.clone());

    if db.profile_name_exists(&game_id, &name)? {
        return Err(format!("A profile named '{}' already exists", name));
    }

    let profile_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let folder_name = storage::name_to_folder_name(&name);
    let profile_path = storage::create_profile_directory(&game_id, &folder_name)?;

    let _ = r2z::extract_r2z_configs(&path, &profile_path);

    let mods_raw = r2z::mods_from_manifest(&manifest.mods);
    let mut mods = Vec::new();
    for (mod_name, version, enabled) in mods_raw {
        mods.push(ProfileMod {
            id: Uuid::new_v4().to_string(),
            package_id: mod_name.clone(),
            version,
            enabled,
            kind: ModKind::Thunderstore {
                full_name: mod_name,
                dependencies: vec![],
            },
            install_time: now,
        });
    }

    let profile = Profile {
        id: profile_id.clone(),
        name,
        game_id: game_id.clone(),
        path: profile_path.clone(),
        mods: mods.clone(),
        created_at: now,
        updated_at: now,
    };

    db.create_profile(&profile)?;
    db.add_mods_batch(&profile_id, &mods)?;
    storage::write_profile_metadata(&profile)?;

    let game = crate::thunderstore::models::ThunderstoreGame::from_api_name(&game_id)
        .ok_or_else(|| format!("Unknown game: {}", game_id))?;
    let plugins_path = profile_path.join("BepInEx").join("plugins");
    let total = manifest.mods.len();

    for (i, mod_entry) in manifest.mods.iter().enumerate() {
        let version_str = mod_entry.version_number
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default();

        if version_str.is_empty() {
            continue;
        }

        let _ = app_handle.emit("r2z_import_progress", R2zImportProgress {
            current: i + 1,
            total,
            mod_name: mod_entry.name.clone(),
        });

        let mod_target = plugins_path.join(&mod_entry.name);
        if let Err(e) = crate::thunderstore::commands::install_mod_to_path(
            &game,
            &mod_entry.name,
            &version_str,
            &mod_target,
        ).await {
            eprintln!("Warning: Failed to install {}: {}", mod_entry.name, e);
        } else if !mod_entry.enabled {
            let disabled_target = plugins_path.join(format!("{}.disabled", mod_entry.name));
            let _ = std::fs::rename(&mod_target, &disabled_target);
        }
    }

    Ok(profile)
}

#[tauri::command]
pub async fn check_profile_updates(
    profile_id: String,
    game: String,
) -> Result<Vec<ModUpdateInfo>, String> {
    let db = get_db()?;
    let profile = db
        .get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    let ts_game = crate::thunderstore::models::ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    let ts_mods: Vec<(String, String)> = profile
        .mods
        .iter()
        .filter_map(|m| {
            if let ModKind::Thunderstore { .. } = &m.kind {
                let v = m.version.trim().to_string();
                if !v.is_empty() && v != "unknown" {
                    return Some((m.package_id.clone(), v));
                }
            }
            None
        })
        .collect();

    if ts_mods.is_empty() {
        return Ok(vec![]);
    }

    let full_names: Vec<String> = ts_mods.iter().map(|(id, _)| id.clone()).collect();
    let package_map =
        crate::thunderstore::fetch::get_packages_bulk(&ts_game, &full_names).await?;

    let results = ts_mods
        .into_iter()
        .map(|(package_id, installed_version)| {
            let latest_version = package_map
                .get(&package_id)
                .map(|p| p.version.clone())
                .unwrap_or_default();
            let has_update = if latest_version.is_empty() {
                false
            } else {
                super::version::has_newer_version(&installed_version, &latest_version)
            };
            ModUpdateInfo {
                package_id,
                installed_version,
                latest_version,
                has_update,
            }
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn update_mod(
    profile_id: String,
    package_id: String,
    new_version: String,
    game: String,
) -> Result<(), String> {
    let db = get_db()?;
    let profile = db
        .get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    let ts_game = crate::thunderstore::models::ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    let plugins_path = profile.path.join("BepInEx").join("plugins");
    let mod_dir = plugins_path.join(&package_id);
    let mod_dir_disabled = plugins_path.join(format!("{}.disabled", &package_id));

    let was_disabled = !mod_dir.exists() && mod_dir_disabled.exists();

    if mod_dir.exists() {
        std::fs::remove_dir_all(&mod_dir)
            .map_err(|e| format!("Failed to remove old mod directory: {}", e))?;
    } else if mod_dir_disabled.exists() {
        std::fs::remove_dir_all(&mod_dir_disabled)
            .map_err(|e| format!("Failed to remove old mod directory: {}", e))?;
    }

    crate::thunderstore::commands::install_mod_to_path(
        &ts_game,
        &package_id,
        &new_version,
        &mod_dir,
    )
    .await?;

    if was_disabled {
        std::fs::rename(&mod_dir, &mod_dir_disabled)
            .map_err(|e| format!("Failed to re-disable mod after update: {}", e))?;
    }

    db.update_mod_version(&profile_id, &package_id, &new_version)?;

    let mut yml_mods = storage::read_mods_yml(&profile.path)?;
    for m in yml_mods.iter_mut() {
        if m.package_id == package_id {
            m.version = new_version.clone();
        }
    }
    storage::write_mods_yml(&profile.path, &yml_mods)?;

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
struct ModUpdateProgressEvent {
    current: usize,
    total: usize,
    mod_name: String,
    phase: String,
}

#[tauri::command]
pub async fn update_all_mods(
    profile_id: String,
    game: String,
    updates: Vec<ModUpdateInfo>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let db = get_db()?;
    let profile = db
        .get_profile(&profile_id)?
        .ok_or_else(|| format!("Profile '{}' not found", profile_id))?;

    let ts_game = crate::thunderstore::models::ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    let pending: Vec<&ModUpdateInfo> = updates.iter().filter(|u| u.has_update).collect();
    let total = pending.len();
    let mut failed_ids: Vec<String> = Vec::new();

    let plugins_path = profile.path.join("BepInEx").join("plugins");

    for (i, update) in pending.iter().enumerate() {
        let _ = app_handle.emit(
            "mod_update_progress",
            ModUpdateProgressEvent {
                current: i + 1,
                total,
                mod_name: update.package_id.clone(),
                phase: "updating".to_string(),
            },
        );

        let mod_dir = plugins_path.join(&update.package_id);
        let mod_dir_disabled = plugins_path.join(format!("{}.disabled", &update.package_id));

        let was_disabled = !mod_dir.exists() && mod_dir_disabled.exists();

        if mod_dir.exists() {
            let _ = std::fs::remove_dir_all(&mod_dir);
        } else if mod_dir_disabled.exists() {
            let _ = std::fs::remove_dir_all(&mod_dir_disabled);
        }

        match crate::thunderstore::commands::install_mod_to_path(
            &ts_game,
            &update.package_id,
            &update.latest_version,
            &mod_dir,
        )
        .await
        {
            Ok(_) => {
                if was_disabled {
                    let _ = std::fs::rename(&mod_dir, &mod_dir_disabled);
                }
                let _ = db.update_mod_version(&profile_id, &update.package_id, &update.latest_version);
            }
            Err(e) => {
                eprintln!("Warning: Failed to update {}: {}", update.package_id, e);
                failed_ids.push(update.package_id.clone());
            }
        }
    }

    let succeeded: std::collections::HashSet<&str> = pending
        .iter()
        .filter(|u| !failed_ids.contains(&u.package_id))
        .map(|u| u.package_id.as_str())
        .collect();

    if !succeeded.is_empty() {
        let version_map: std::collections::HashMap<&str, &str> = pending
            .iter()
            .filter(|u| succeeded.contains(u.package_id.as_str()))
            .map(|u| (u.package_id.as_str(), u.latest_version.as_str()))
            .collect();

        let mut yml_mods = storage::read_mods_yml(&profile.path)?;
        for m in yml_mods.iter_mut() {
            if let Some(&new_ver) = version_map.get(m.package_id.as_str()) {
                m.version = new_ver.to_string();
            }
        }
        storage::write_mods_yml(&profile.path, &yml_mods)?;
    }

    Ok(failed_ids)
}

#[tauri::command]
pub fn discover_tmm_profiles_for_import(game_id: String) -> Result<Vec<TmmProfileInfo>, String> {
    migration::discover_tmm_profiles(&game_id)
}

#[tauri::command]
pub fn import_from_tmm(
    game_id: String,
    tmm_profile_name: String,
    new_name: Option<String>,
) -> Result<Profile, String> {
    let db = get_db()?;

    let profile_name = new_name.unwrap_or_else(|| tmm_profile_name.clone());

    if db.profile_name_exists(&game_id, &profile_name)? {
        return Err(format!("A profile named '{}' already exists", profile_name));
    }

    let profile_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let profile_path = migration::import_tmm_profile(&game_id, &tmm_profile_name, &profile_id)?;

    let scanned_mods = migration::scan_tmm_plugins(&profile_path)?;

    let mut mods = Vec::new();
    for scanned in scanned_mods {
        let mod_entry = ProfileMod {
            id: Uuid::new_v4().to_string(),
            package_id: scanned.folder_name.clone(),
            version: "unknown".to_string(),
            enabled: true,
            kind: ModKind::Local {
                source_path: Some(scanned.path),
            },
            install_time: now,
        };
        mods.push(mod_entry);
    }

    let profile = Profile {
        id: profile_id.clone(),
        name: profile_name,
        game_id,
        path: profile_path,
        mods: mods.clone(),
        created_at: now,
        updated_at: now,
    };

    db.create_profile(&profile)?;

    for mod_entry in &mods {
        db.add_mod(&profile_id, mod_entry)?;
    }

    storage::write_profile_metadata(&profile)?;

    Ok(profile)
}
