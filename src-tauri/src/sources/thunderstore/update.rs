use std::path::Path;

use serde::Serialize;

use super::api::{self};
use super::installer::ModInstaller;
use super::manifest::{self, VersionNumber};
use super::profile::{self};

#[derive(Debug, Serialize, Clone)]
pub struct ModUpdateInfo {
    pub full_name: String,
    pub display_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub dependencies: Vec<String>,
    pub icon_url: Option<String>,
    pub enabled: bool,
    pub position: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckResult {
    pub available_updates: Vec<ModUpdateInfo>,
    pub mods_checked: usize,
    pub check_errors: Vec<(String, String)>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateResult {
    pub full_name: String,
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

fn is_loader_package(name: &str) -> bool {
    crate::games::is_loader_package(name)
}

pub async fn check_for_updates(
    community: &str,
    instance_dir: &std::path::Path,
    skip_loaders: bool,
    cache_dir: Option<&std::path::Path>,
) -> Result<UpdateCheckResult, String> {
    if let Some(cache_path) = cache_dir {
        let _ = api::fetch_all_packages(community, cache_path).await;
    }

    let mods = profile::load_mods_yml(instance_dir)?;
    let mut available_updates = Vec::new();
    let mut check_errors = Vec::new();
    let mods_checked = mods.len();

    for (position, manifest) in mods.iter().enumerate() {
        if skip_loaders && is_loader_package(&manifest.name) {
            continue;
        }

        let (owner, name) = match manifest::parse_full_name(&manifest.name) {
            Ok(parsed) => parsed,
            Err(e) => {
                check_errors.push((manifest.name.clone(), e));
                continue;
            }
        };

        match api::get_package_versions(community, &owner, &name, cache_dir).await {
            Ok(versions) => {
                if let Some(latest) = versions.first() {
                    let installed_version = manifest.version_number.clone();
                    let latest_version = VersionNumber::parse(&latest.version_number);

                    if latest_version > installed_version {
                        available_updates.push(ModUpdateInfo {
                            full_name: manifest.name.clone(),
                            display_name: manifest.display_name.clone(),
                            current_version: installed_version.to_string(),
                            latest_version: latest.version_number.clone(),
                            download_url: latest.download_url.clone(),
                            dependencies: latest.dependencies.clone(),
                            icon_url: manifest.icon.clone(),
                            enabled: manifest.enabled,
                            position,
                        });
                    }
                }
            }
            Err(e) => {
                check_errors.push((manifest.name.clone(), e));
            }
        }
    }

    Ok(UpdateCheckResult {
        available_updates,
        mods_checked,
        check_errors,
    })
}

///
pub async fn update_mod(
    downloads_dir: &Path,
    api_cache_dir: &Path,
    instance_dir: &Path,
    community: &str,
    full_name: &str,
    game_id: &str,
    loader: Option<&str>,
) -> Result<UpdateResult, String> {
    let mods = profile::load_mods_yml(instance_dir)?;

    let (position, mod_entry) = mods
        .iter()
        .enumerate()
        .find(|(_, m)| m.name == full_name)
        .ok_or_else(|| format!("Mod '{}' not found in profile", full_name))?;

    let from_version = mod_entry.version_number.to_string();
    let was_enabled = mod_entry.enabled;
    let icon = mod_entry.icon.clone();

    let (owner, name) = manifest::parse_full_name(full_name)?;

    let versions =
        api::get_package_versions(community, &owner, &name, Some(api_cache_dir)).await?;
    let latest = versions
        .first()
        .ok_or_else(|| "No versions available".to_string())?;

    let installed_version = mod_entry.version_number.clone();
    let latest_version = VersionNumber::parse(&latest.version_number);

    if latest_version <= installed_version {
        return Ok(UpdateResult {
            full_name: full_name.to_string(),
            from_version: from_version.clone(),
            to_version: from_version,
            success: true,
            error: Some("Already at latest version".to_string()),
        });
    }

    let to_version = latest.version_number.clone();

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);
    if let Err(e) = installer.uninstall_mod(full_name) {
        eprintln!("Warning: Failed to uninstall old version: {}", e);
    }

    let cache_dir = super::cache::download_and_extract(
        downloads_dir,
        full_name,
        &to_version,
        &latest.download_url,
    )
    .await?;

    let new_manifest = super::manifest::ManifestV2::new(
        full_name,
        &owner,
        &name,
        &to_version,
        None,
        None,
        latest.dependencies.clone(),
        icon,
    );

    installer.install_mod(&cache_dir, &new_manifest)?;

    let mut mods = profile::load_mods_yml(instance_dir)?;

    mods.retain(|m| m.name != full_name);

    let mut updated_manifest = new_manifest;
    updated_manifest.enabled = was_enabled;

    if position < mods.len() {
        mods.insert(position, updated_manifest);
    } else {
        mods.push(updated_manifest);
    }

    profile::save_mods_yml(instance_dir, &mods)?;

    if !was_enabled {
        installer.disable_mod(full_name)?;
    }

    Ok(UpdateResult {
        full_name: full_name.to_string(),
        from_version,
        to_version,
        success: true,
        error: None,
    })
}

pub async fn update_all_mods(
    downloads_dir: &Path,
    api_cache_dir: &Path,
    instance_dir: &Path,
    community: &str,
    game_id: &str,
    loader: Option<&str>,
    skip_loaders: bool,
) -> Result<BatchUpdateResult, String> {
    let check_result =
        check_for_updates(community, instance_dir, skip_loaders, Some(api_cache_dir)).await?;

    let mut results = Vec::new();
    let mut success_count = 0;
    let mut failure_count = 0;

    for update_info in check_result.available_updates {
        match update_mod(
            downloads_dir,
            api_cache_dir,
            instance_dir,
            community,
            &update_info.full_name,
            game_id,
            loader,
        )
        .await
        {
            Ok(result) => {
                if result.success && result.error.is_none() {
                    success_count += 1;
                }
                results.push(result);
            }
            Err(e) => {
                failure_count += 1;
                results.push(UpdateResult {
                    full_name: update_info.full_name,
                    from_version: update_info.current_version,
                    to_version: update_info.latest_version,
                    success: false,
                    error: Some(e),
                });
            }
        }
    }

    Ok(BatchUpdateResult {
        results,
        success_count,
        failure_count,
    })
}