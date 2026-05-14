use std::path::Path;

use crate::modpack::ModpackMod;

pub type ModsJson = Vec<ModpackMod>;

pub fn mods_json_path(instance_dir: &Path) -> std::path::PathBuf {
    instance_dir.join("mods.json")
}

pub fn load_mods_json(instance_dir: &Path) -> Result<ModsJson, String> {
    let path = mods_json_path(instance_dir);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read mods.json: {}", e))?;

    if content.trim().is_empty() || content.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse mods.json: {}", e))
}

pub fn save_mods_json(instance_dir: &Path, mods: &ModsJson) -> Result<(), String> {
    std::fs::create_dir_all(instance_dir)
        .map_err(|e| format!("Failed to create instance directory: {}", e))?;

    let path = mods_json_path(instance_dir);
    let json = serde_json::to_string_pretty(mods)
        .map_err(|e| format!("Failed to serialize mods.json: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write mods.json: {}", e))?;

    Ok(())
}
