use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

use super::models::{R2Mod, R2ModPreview, R2xManifest, R2zPreview};

pub fn parse_r2z_file(r2z_path: &Path) -> Result<R2xManifest, String> {
    let file = fs::File::open(r2z_path)
        .map_err(|e| format!("Failed to open r2z file: {}", e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read r2z archive: {}", e))?;

    let mut manifest_content = String::new();

    let mut found = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        if entry.name() == "export.r2x" {
            entry.read_to_string(&mut manifest_content)
                .map_err(|e| format!("Failed to read export.r2x: {}", e))?;
            found = true;
            break;
        }
    }

    if !found {
        return Err("No export.r2x found in r2z file".to_string());
    }

    serde_yaml::from_str::<R2xManifest>(&manifest_content)
        .map_err(|e| format!("Failed to parse export.r2x YAML: {}", e))
}

pub fn preview_r2z(r2z_path: &Path) -> Result<R2zPreview, String> {
    let manifest = parse_r2z_file(r2z_path)?;

    let mods = manifest
        .mods
        .iter()
        .map(|m| R2ModPreview {
            name: m.name.clone(),
            version: m.version_number.as_ref().map(|v| v.to_string()).unwrap_or_default(),
            enabled: m.enabled,
        })
        .collect::<Vec<_>>();

    Ok(R2zPreview {
        mod_count: mods.len(),
        profile_name: manifest.profile_name,
        community: manifest.community,
        mods,
    })
}

pub fn extract_r2z_configs(r2z_path: &Path, profile_path: &Path) -> Result<Vec<PathBuf>, String> {
    let file = fs::File::open(r2z_path)
        .map_err(|e| format!("Failed to open r2z file: {}", e))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read r2z archive: {}", e))?;

    let mut extracted = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let entry_name = entry.name().to_string();

        if !entry_name.starts_with("BepInEx/config/") && !entry_name.starts_with("BepInEx\\config\\") {
            continue;
        }

        if entry.is_dir() {
            continue;
        }

        let relative = entry_name
            .replace("BepInEx\\config\\", "BepInEx/config/")
            .trim_start_matches('/')
            .to_string();

        let target_path = profile_path.join(&relative);

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let mut content = Vec::new();
        entry.read_to_end(&mut content)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        fs::write(&target_path, &content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;

        extracted.push(target_path);
    }

    Ok(extracted)
}

pub fn mods_from_manifest(mods: &[R2Mod]) -> Vec<(String, String, bool)> {
    mods.iter()
        .map(|m| (m.name.clone(), m.version_number.as_ref().map(|v| v.to_string()).unwrap_or_default(), m.enabled))
        .collect()
}
