use serde::Serialize;
use std::path::Path;

use super::api;
use super::profile;

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub available_updates: Vec<ModUpdateInfo>,
    pub mods_checked: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModUpdateInfo {
    pub modid: String,
    pub display_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub filename: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateResult {
    pub modid: String,
    pub from_version: String,
    pub to_version: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BatchUpdateResult {
    pub results: Vec<UpdateResult>,
    pub success_count: usize,
    pub failure_count: usize,
}

pub async fn check_for_updates(
    instance_dir: &Path,
) -> Result<UpdateCheckResult, String> {
    let mods = profile::load_mods_json(instance_dir)?;

    let mod_pairs: Vec<(String, String)> = mods
        .iter()
        .filter(|m| m.enabled)
        .map(|m| {
            let id = if !m.modidstr.is_empty() {
                m.modidstr.clone()
            } else {
                m.modid.clone()
            };
            (id, m.version.clone())
        })
        .collect();

    let mods_checked = mod_pairs.len();

    if mod_pairs.is_empty() {
        return Ok(UpdateCheckResult {
            available_updates: vec![],
            mods_checked: 0,
        });
    }

    let updates = api::check_updates(&mod_pairs).await?;

    let available_updates: Vec<ModUpdateInfo> = updates
        .into_iter()
        .filter_map(|(modidstr, entry)| {
            let installed = mods.iter().find(|m| {
                m.modidstr == modidstr || m.modid == modidstr
            })?;

            if entry.modversion == installed.version {
                return None;
            }

            let download_url = if entry.mainfile.starts_with("http") {
                entry.mainfile
            } else {
                format!("https://mods.vintagestory.at{}", entry.mainfile)
            };

            Some(ModUpdateInfo {
                modid: installed.modid.clone(),
                display_name: installed.name.clone(),
                current_version: installed.version.clone(),
                latest_version: entry.modversion,
                download_url,
                filename: entry.filename,
            })
        })
        .collect();

    Ok(UpdateCheckResult {
        available_updates,
        mods_checked,
    })
}

pub async fn update_mod(
    downloads_dir: &Path,
    instance_dir: &Path,
    modid: &str,
    game_version: &str,
) -> Result<UpdateResult, String> {
    let mut mods = profile::load_mods_json(instance_dir)?;
    let mod_entry = profile::find_mod(&mods, modid)
        .ok_or_else(|| format!("Mod '{}' not found in profile", modid))?;

    let from_version = mod_entry.version.clone();
    let old_filename = mod_entry.filename.clone();
    let was_enabled = mod_entry.enabled;

    let modidstr = if !mod_entry.modidstr.is_empty() {
        mod_entry.modidstr.clone()
    } else {
        modid.to_string()
    };

    let update_info = api::check_updates(&[(modidstr.clone(), from_version.clone())]).await?;

    let entry = update_info.get(&modidstr).ok_or_else(|| {
        format!("No update available for {}", modid)
    })?;

    if entry.modversion == from_version {
        return Ok(UpdateResult {
            modid: modid.to_string(),
            from_version: from_version.clone(),
            to_version: from_version,
            success: true,
            error: None,
        });
    }

    let download_url = if entry.mainfile.starts_with("http") {
        entry.mainfile.clone()
    } else {
        format!("https://mods.vintagestory.at{}", entry.mainfile)
    };

    let latest_version = entry.modversion.clone();
    let latest_filename = entry.filename.clone();
    let _ = game_version;

    let cache_path = downloads_dir
        .join("vintagestory")
        .join(modid)
        .join(&latest_version)
        .join(&latest_filename);

    if let Err(e) = api::download_mod(&download_url, &cache_path).await {
        return Ok(UpdateResult {
            modid: modid.to_string(),
            from_version,
            to_version: latest_version.clone(),
            success: false,
            error: Some(e),
        });
    }

    let mods_dir = instance_dir.join("Mods");
    let old_path = mods_dir.join(&old_filename);
    let old_disabled = mods_dir.join(format!("{}.disabled", old_filename));
    let _ = std::fs::remove_file(&old_path);
    let _ = std::fs::remove_file(&old_disabled);

    let dest = if was_enabled {
        mods_dir.join(&latest_filename)
    } else {
        mods_dir.join(format!("{}.disabled", latest_filename))
    };

    std::fs::copy(&cache_path, &dest)
        .map_err(|e| format!("Failed to install updated mod: {}", e))?;

    if let Some(m) = mods.iter_mut().find(|m| m.modid == modid) {
        m.version = latest_version.clone();
        m.filename = latest_filename.clone();
    }
    profile::save_mods_json(instance_dir, &mods)?;

    Ok(UpdateResult {
        modid: modid.to_string(),
        from_version,
        to_version: latest_version,
        success: true,
        error: None,
    })
}

pub async fn update_all_mods(
    downloads_dir: &Path,
    instance_dir: &Path,
    game_version: &str,
) -> Result<BatchUpdateResult, String> {
    let check = check_for_updates(instance_dir).await?;

    let mut results = Vec::new();
    let mut success_count = 0;
    let mut failure_count = 0;

    for update_info in &check.available_updates {
        let result = update_mod(downloads_dir, instance_dir, &update_info.modid, game_version).await?;
        if result.success {
            success_count += 1;
        } else {
            failure_count += 1;
        }
        results.push(result);
    }

    Ok(BatchUpdateResult {
        results,
        success_count,
        failure_count,
    })
}
