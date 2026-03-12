use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn default_profile_type() -> String {
    "minecraft".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Instance {
    pub modpack_id: String,
    #[serde(default)]
    pub game_id: String,
    #[serde(default = "default_profile_type")]
    pub profile_type: String,
    #[serde(alias = "minecraft_version")]
    pub game_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub installed: bool,
    pub last_played: Option<String>,
    pub java_path: Option<String>,
}

impl Instance {
    pub fn new(modpack_id: String, game_version: String, loader: String) -> Self {
        Self {
            modpack_id,
            game_id: String::new(),
            profile_type: "minecraft".to_string(),
            game_version,
            loader,
            loader_version: None,
            installed: false,
            last_played: None,
            java_path: None,
        }
    }

    pub fn new_thunderstore(
        modpack_id: String,
        game_id: String,
        game_version: String,
        loader_name: &str,
    ) -> Self {
        Self {
            modpack_id,
            game_id,
            profile_type: "thunderstore".to_string(),
            game_version,
            loader: loader_name.to_string(),
            loader_version: None,
            installed: false,
            last_played: None,
            java_path: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct FolderMapping {
    mappings: HashMap<String, String>,
}

pub fn get_instances_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data.join("instances"))
}

fn get_mapping_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let instances_dir = get_instances_dir(app_handle)?;
    Ok(instances_dir.join("_mapping.json"))
}

fn load_mapping(app_handle: &AppHandle) -> Result<FolderMapping, String> {
    let path = get_mapping_file_path(app_handle)?;

    if !path.exists() {
        return Ok(FolderMapping::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read mapping file: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse mapping file: {}", e))
}

fn save_mapping(app_handle: &AppHandle, mapping: &FolderMapping) -> Result<(), String> {
    let path = get_mapping_file_path(app_handle)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create instances directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(mapping)
        .map_err(|e| format!("Failed to serialize mapping: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write mapping file: {}", e))?;

    Ok(())
}

fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn get_or_create_folder_name(
    app_handle: &AppHandle,
    modpack_id: &str,
    modpack_name: &str,
) -> Result<String, String> {
    let mut mapping = load_mapping(app_handle)?;

    if let Some(folder_name) = mapping.mappings.get(modpack_id) {
        return Ok(folder_name.clone());
    }

    let base_name = sanitize_folder_name(modpack_name);
    let instances_dir = get_instances_dir(app_handle)?;

    let mut folder_name = base_name.clone();
    let mut counter = 1;

    while instances_dir.join(&folder_name).exists() {
        folder_name = format!("{} ({})", base_name, counter);
        counter += 1;
    }

    mapping
        .mappings
        .insert(modpack_id.to_string(), folder_name.clone());
    save_mapping(app_handle, &mapping)?;

    Ok(folder_name)
}

pub fn get_folder_name(app_handle: &AppHandle, modpack_id: &str) -> Result<Option<String>, String> {
    let mapping = load_mapping(app_handle)?;
    Ok(mapping.mappings.get(modpack_id).cloned())
}

pub fn get_instance_dir(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instances_dir = get_instances_dir(app_handle)?;

    if let Some(folder_name) = get_folder_name(app_handle, modpack_id)? {
        return Ok(instances_dir.join(folder_name));
    }

    Ok(instances_dir.join(modpack_id))
}

pub fn get_mods_dir(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;
    Ok(instance_dir.join("mods"))
}

pub fn get_versions_dir(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;
    Ok(instance_dir.join("versions"))
}

pub fn get_libraries_dir(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;
    Ok(instance_dir.join("libraries"))
}

pub fn get_assets_dir(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;
    Ok(instance_dir.join("assets"))
}

fn get_instance_json_path(app_handle: &AppHandle, modpack_id: &str) -> Result<PathBuf, String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;
    Ok(instance_dir.join("instance.json"))
}

pub fn create_instance_dirs(
    app_handle: &AppHandle,
    modpack_id: &str,
    modpack_name: &str,
) -> Result<(), String> {
    create_instance_dirs_for_game(app_handle, modpack_id, modpack_name, None)
}

pub fn create_instance_dirs_for_game(
    app_handle: &AppHandle,
    modpack_id: &str,
    modpack_name: &str,
    profile_type: Option<&str>,
) -> Result<(), String> {
    let _folder_name = get_or_create_folder_name(app_handle, modpack_id, modpack_name)?;
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;

    let dirs: Vec<PathBuf> = match profile_type {
        Some("thunderstore") | Some("bepinex") => {
            vec![instance_dir.clone(), instance_dir.join("_state")]
        }
        _ => vec![
            instance_dir.clone(),
            instance_dir.join("mods"),
            instance_dir.join("config"),
            instance_dir.join("saves"),
            instance_dir.join("versions"),
            instance_dir.join("libraries"),
            instance_dir.join("assets"),
            instance_dir.join("assets/indexes"),
            instance_dir.join("assets/objects"),
            instance_dir.join("natives"),
            instance_dir.join("logs"),
        ],
    };

    for dir in &dirs {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
    }

    Ok(())
}

pub fn save_instance(app_handle: &AppHandle, instance: &Instance) -> Result<(), String> {
    let path = get_instance_json_path(app_handle, &instance.modpack_id)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create instance directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(instance)
        .map_err(|e| format!("Failed to serialize instance: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write instance.json: {}", e))?;

    Ok(())
}

pub fn load_instance(app_handle: &AppHandle, modpack_id: &str) -> Result<Option<Instance>, String> {
    let path = get_instance_json_path(app_handle, modpack_id)?;

    if !path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read instance.json: {}", e))?;

    let instance: Instance = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse instance.json: {}", e))?;

    Ok(Some(instance))
}

pub fn delete_instance(app_handle: &AppHandle, modpack_id: &str) -> Result<(), String> {
    let instance_dir = get_instance_dir(app_handle, modpack_id)?;

    if instance_dir.exists() {
        std::fs::remove_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to delete instance directory: {}", e))?;
    }

    let mut mapping = load_mapping(app_handle)?;
    mapping.mappings.remove(modpack_id);
    save_mapping(app_handle, &mapping)?;

    Ok(())
}

pub fn update_last_played(app_handle: &AppHandle, modpack_id: &str) -> Result<(), String> {
    if let Some(mut instance) = load_instance(app_handle, modpack_id)? {
        instance.last_played = Some(chrono::Utc::now().to_rfc3339());
        save_instance(app_handle, &instance)?;
    }
    Ok(())
}

pub fn get_cache_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_data.join("cache").join("thunderstore"))
}
