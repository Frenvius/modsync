use std::fs;
use std::path::{Path, PathBuf};

pub fn get_app_data_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|d| d.join("Valheim Mod Updater"))
        .ok_or_else(|| "Could not find AppData directory".to_string())
}

pub fn get_profiles_root_dir() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("profiles"))
}

pub fn get_game_profiles_dir(game_id: &str) -> Result<PathBuf, String> {
    Ok(get_profiles_root_dir()?.join(game_id))
}

pub fn get_profile_dir(game_id: &str, profile_id: &str) -> Result<PathBuf, String> {
    Ok(get_game_profiles_dir(game_id)?.join(profile_id))
}

pub fn get_database_path() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("profiles.db"))
}

pub fn create_profile_directory(game_id: &str, profile_id: &str) -> Result<PathBuf, String> {
    let profile_dir = get_profile_dir(game_id, profile_id)?;
    let bepinex_dir = profile_dir.join("BepInEx");

    fs::create_dir_all(bepinex_dir.join("core"))
        .map_err(|e| format!("Failed to create core directory: {}", e))?;
    fs::create_dir_all(bepinex_dir.join("plugins"))
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    fs::create_dir_all(bepinex_dir.join("config"))
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(profile_dir)
}

pub fn delete_profile_directory(game_id: &str, profile_id: &str) -> Result<(), String> {
    let profile_dir = get_profile_dir(game_id, profile_id)?;

    if profile_dir.exists() {
        fs::remove_dir_all(&profile_dir)
            .map_err(|e| format!("Failed to delete profile directory: {}", e))?;
    }

    Ok(())
}

pub fn duplicate_profile_directory(
    game_id: &str,
    source_profile_id: &str,
    target_profile_id: &str,
) -> Result<PathBuf, String> {
    let source_dir = get_profile_dir(game_id, source_profile_id)?;
    let target_dir = get_profile_dir(game_id, target_profile_id)?;

    if !source_dir.exists() {
        return Err(format!("Source profile directory does not exist: {}", source_dir.display()));
    }

    copy_dir_recursive(&source_dir, &target_dir)?;

    Ok(target_dir)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
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

pub fn get_profile_bepinex_path(game_id: &str, profile_id: &str) -> Result<PathBuf, String> {
    let profile_dir = get_profile_dir(game_id, profile_id)?;
    Ok(profile_dir.join("BepInEx"))
}

pub fn profile_has_bepinex(game_id: &str, profile_id: &str) -> Result<bool, String> {
    let bepinex_path = get_profile_bepinex_path(game_id, profile_id)?;
    Ok(bepinex_path.exists() && bepinex_path.join("plugins").exists())
}

pub fn count_profile_mods(game_id: &str, profile_id: &str) -> Result<usize, String> {
    let plugins_dir = get_profile_bepinex_path(game_id, profile_id)?.join("plugins");

    if !plugins_dir.exists() {
        return Ok(0);
    }

    let count = fs::read_dir(&plugins_dir)
        .map_err(|e| format!("Failed to read plugins directory: {}", e))?
        .filter_map(|e| e.ok())
        .count();

    Ok(count)
}

pub fn write_profile_metadata(profile: &super::models::Profile) -> Result<(), String> {
    let metadata_path = profile.path.join("profile.json");
    let json = serde_json::to_string_pretty(profile)
        .map_err(|e| format!("Failed to serialize profile metadata: {}", e))?;

    fs::write(&metadata_path, json)
        .map_err(|e| format!("Failed to write profile metadata: {}", e))?;

    Ok(())
}

pub fn read_profile_metadata(profile_path: &Path) -> Result<super::models::Profile, String> {
    let metadata_path = profile_path.join("profile.json");
    let json = fs::read_to_string(&metadata_path)
        .map_err(|e| format!("Failed to read profile metadata: {}", e))?;

    serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse profile metadata: {}", e))
}
