use chrono::Utc;
use uuid::Uuid;

use super::models::{ModKind, Profile, ProfileMod, ProfileSummary, TmmProfile, TmmProfileInfo};
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
pub fn create_profile(game_id: String, name: String) -> Result<Profile, String> {
    let db = get_db()?;

    if db.profile_name_exists(&game_id, &name)? {
        return Err(format!("A profile named '{}' already exists", name));
    }

    let profile_id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let profile_path = storage::create_profile_directory(&game_id, &profile_id)?;

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

    storage::delete_profile_directory(&profile.game_id, &profile_id)?;

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

    let new_path = storage::duplicate_profile_directory(
        &source_profile.game_id,
        &profile_id,
        &new_profile_id,
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

fn get_tmm_profiles_dir() -> Result<std::path::PathBuf, String> {
    dirs::data_dir()
        .map(|d| {
            d.join("Thunderstore Mod Manager")
                .join("DataFolder")
                .join("Valheim")
                .join("profiles")
        })
        .ok_or_else(|| "Could not find AppData directory".to_string())
}

#[tauri::command]
pub fn discover_tmm_profiles() -> Result<Vec<TmmProfile>, String> {
    let tmm_dir = get_tmm_profiles_dir()?;

    if !tmm_dir.exists() {
        return Ok(vec![]);
    }

    let mut profiles = Vec::new();
    let entries = std::fs::read_dir(&tmm_dir)
        .map_err(|e| format!("Failed to read TMM profiles dir: {}", e))?;

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

    std::fs::create_dir_all(&plugins_path)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    std::fs::create_dir_all(&config_path)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(TmmProfile {
        name,
        bepinex_path: bepinex_path.to_string_lossy().to_string(),
        has_mods: false,
    })
}
