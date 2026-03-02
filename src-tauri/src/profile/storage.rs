use std::fs;
use std::path::{Path, PathBuf};

pub fn get_app_data_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|d| d.join("Mod Updater"))
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

pub fn name_to_folder_name(name: &str) -> String {
    name.to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

pub fn get_database_path() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("profiles.db"))
}

pub fn create_profile_directory(game_id: &str, profile_id: &str) -> Result<PathBuf, String> {
    let profile_dir = get_profile_dir(game_id, profile_id)?;
    create_profile_directory_at(&profile_dir)?;
    Ok(profile_dir)
}

pub fn create_profile_directory_at(profile_dir: &Path) -> Result<(), String> {
    let bepinex_dir = profile_dir.join("BepInEx");

    fs::create_dir_all(bepinex_dir.join("core"))
        .map_err(|e| format!("Failed to create core directory: {}", e))?;
    fs::create_dir_all(bepinex_dir.join("plugins"))
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    fs::create_dir_all(bepinex_dir.join("config"))
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(())
}

pub fn delete_profile_directory(profile_path: &Path) -> Result<(), String> {
    if profile_path.exists() {
        fs::remove_dir_all(profile_path)
            .map_err(|e| format!("Failed to delete profile directory: {}", e))?;
    }

    Ok(())
}

pub fn duplicate_profile_directory(
    source_path: &Path,
    game_id: &str,
    folder_name: &str,
) -> Result<PathBuf, String> {
    let target_dir = get_game_profiles_dir(game_id)?.join(folder_name);

    if !source_path.exists() {
        return Err(format!("Source profile directory does not exist: {}", source_path.display()));
    }

    copy_dir_recursive(source_path, &target_dir)?;

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

pub fn get_mods_yml_path(profile_path: &std::path::Path) -> std::path::PathBuf {
    profile_path.join("mods.yml")
}

pub fn read_mods_yml(profile_path: &std::path::Path) -> Result<Vec<super::models::YmlMod>, String> {
    use super::models::{R2ManifestV2, YmlMod};

    let path = get_mods_yml_path(profile_path);
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read mods.yml: {}", e))?;

    if let Ok(mods) = serde_yaml::from_str::<Vec<YmlMod>>(&content) {
        return Ok(mods);
    }

    if let Ok(r2mods) = serde_yaml::from_str::<Vec<R2ManifestV2>>(&content) {
        let converted: Vec<YmlMod> = r2mods
            .into_iter()
            .map(convert_r2modman_to_yml_mod)
            .collect();
        let _ = write_mods_yml(profile_path, &converted);
        return Ok(converted);
    }

    Err("Failed to parse mods.yml: unsupported format".to_string())
}

fn convert_r2modman_to_yml_mod(r2mod: super::models::R2ManifestV2) -> super::models::YmlMod {
    super::models::YmlMod {
        package_id: r2mod.name,
        version: format!(
            "{}.{}.{}",
            r2mod.version_number.major,
            r2mod.version_number.minor,
            r2mod.version_number.patch
        ),
        enabled: r2mod.enabled,
        is_local: false,
        icon_url: None,
        author: r2mod.author_name,
        display_name: r2mod.display_name,
        install_time: r2mod
            .installed_at_time
            .map(|t| t / 1000)
            .unwrap_or_else(|| chrono::Utc::now().timestamp()),
    }
}

pub fn write_mods_yml(profile_path: &std::path::Path, mods: &[super::models::YmlMod]) -> Result<(), String> {
    let path = get_mods_yml_path(profile_path);
    let content = serde_yaml::to_string(mods)
        .map_err(|e| format!("Failed to serialize mods.yml: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write mods.yml: {}", e))
}

pub fn find_mod_on_disk(plugins_path: &Path, package_id: &str) -> Option<(PathBuf, bool)> {
    let enabled_folder = plugins_path.join(package_id);
    let disabled_folder = plugins_path.join(format!("{}.disabled", package_id));
    let enabled_dll = plugins_path.join(format!("{}.dll", package_id));
    let disabled_dll = plugins_path.join(format!("{}.dll.disabled", package_id));

    if enabled_folder.exists() {
        Some((enabled_folder, true))
    } else if disabled_folder.exists() {
        Some((disabled_folder, false))
    } else if enabled_dll.exists() {
        Some((enabled_dll, true))
    } else if disabled_dll.exists() {
        Some((disabled_dll, false))
    } else {
        None
    }
}

pub fn set_mod_enabled_on_disk(plugins_path: &Path, package_id: &str, enabled: bool) -> Result<(), String> {
    let Some((current_path, is_enabled)) = find_mod_on_disk(plugins_path, package_id) else {
        return Ok(());
    };

    if is_enabled == enabled {
        return Ok(());
    }

    let target_path = if current_path.is_dir() {
        if enabled {
            plugins_path.join(package_id)
        } else {
            plugins_path.join(format!("{}.disabled", package_id))
        }
    } else {
        if enabled {
            plugins_path.join(format!("{}.dll", package_id))
        } else {
            plugins_path.join(format!("{}.dll.disabled", package_id))
        }
    };

    if target_path.exists() {
        return Err(format!(
            "Cannot rename '{}': target '{}' already exists",
            current_path.display(),
            target_path.display()
        ));
    }

    fs::rename(&current_path, &target_path)
        .map_err(|e| format!("Failed to rename mod on disk: {}", e))
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
