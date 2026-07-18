use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VsInstalledMod {
    pub modid: String,
    pub modidstr: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub filename: String,
    pub icon_url: Option<String>,
    pub enabled: bool,
    pub installed_at: String,
}

pub type VsModsJson = Vec<VsInstalledMod>;

pub fn load_mods_json(instance_dir: &Path) -> Result<VsModsJson, String> {
    let path = instance_dir.join("vs_mods.json");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read vs_mods.json: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse vs_mods.json: {}", e))
}

pub fn save_mods_json(instance_dir: &Path, mods: &VsModsJson) -> Result<(), String> {
    let path = instance_dir.join("vs_mods.json");

    let json = serde_json::to_string_pretty(mods)
        .map_err(|e| format!("Failed to serialize vs_mods.json: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write vs_mods.json: {}", e))
}

pub fn add_mod(mods: &mut VsModsJson, entry: VsInstalledMod) {
    if let Some(existing) = mods.iter_mut().find(|m| m.modid == entry.modid) {
        *existing = entry;
    } else {
        mods.push(entry);
    }
}

pub fn remove_mod(mods: &mut VsModsJson, modid: &str) -> bool {
    let len_before = mods.len();
    mods.retain(|m| m.modid != modid);
    mods.len() != len_before
}

pub fn find_mod<'a>(mods: &'a VsModsJson, modid: &str) -> Option<&'a VsInstalledMod> {
    mods.iter().find(|m| m.modid == modid)
}

pub fn set_enabled(mods: &mut VsModsJson, modid: &str, enabled: bool) -> bool {
    if let Some(m) = mods.iter_mut().find(|m| m.modid == modid) {
        m.enabled = enabled;
        true
    } else {
        false
    }
}
