use std::collections::HashSet;
use std::path::Path;

use super::api::{self, PackageVersionInfo};
use super::cache;
use super::installer::{install_mod_full, ModInstaller};
use super::manifest::ManifestV2;
use super::profile::{self, load_mods_yml, save_mods_yml};

pub async fn get_package_version(
    community: &str,
    full_name: &str,
    target_version: &str,
) -> Result<PackageVersionInfo, String> {
    let (owner, name) = parse_full_name(full_name)?;
    let versions = api::get_package_versions(community, &owner, &name).await?;

    versions
        .into_iter()
        .find(|v| v.version_number == target_version)
        .ok_or_else(|| format!("Version {} not found for {}", target_version, full_name))
}

pub async fn sync_install_mod(
    cache_base: &Path,
    instance_dir: &Path,
    community: &str,
    full_name: &str,
    version: &str,
    enabled: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    let version_info = get_package_version(community, full_name, version).await?;

    if !version_info.dependencies.is_empty() {
        let mut visited: HashSet<String> = HashSet::new();

        let existing_mods = load_mods_yml(instance_dir)?;
        for m in &existing_mods {
            visited.insert(m.name.clone());
        }

        let deps_to_install: Vec<String> = version_info
            .dependencies
            .iter()
            .filter(|d| {
                if let Some(parsed) = super::manifest::DependencyString::parse(d) {
                    !visited.contains(&parsed.full_name())
                } else {
                    false
                }
            })
            .cloned()
            .collect();

        if !deps_to_install.is_empty() {
            let resolved_deps =
                cache::resolve_dependencies_with_visited(community, &deps_to_install, &mut visited)
                    .await?;

            for dep in resolved_deps {
                if crate::games::is_loader_package(&dep.full_name) {
                    continue;
                }

                let is_loader = false;
                install_mod_full(
                    cache_base,
                    instance_dir,
                    &dep.full_name,
                    &dep.version,
                    &dep.download_url,
                    &dep.dependencies,
                    is_loader,
                    game_id,
                    loader,
                )
                .await?;
            }
        }
    }

    let is_loader = crate::games::is_loader_package(full_name);
    install_mod_full(
        cache_base,
        instance_dir,
        full_name,
        version,
        &version_info.download_url,
        &version_info.dependencies,
        is_loader,
        game_id,
        loader,
    )
    .await?;

    if !enabled {
        let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);
        installer.disable_mod(full_name)?;

        let mut mods = load_mods_yml(instance_dir)?;
        profile::set_enabled_in_list(&mut mods, full_name, false);
        save_mods_yml(instance_dir, &mods)?;
    }

    Ok(())
}

pub async fn sync_update_mod(
    cache_base: &Path,
    instance_dir: &Path,
    community: &str,
    full_name: &str,
    new_version: &str,
    preserve_enabled: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    let mods = load_mods_yml(instance_dir)?;
    let current_mod = profile::find_mod_in_list(&mods, full_name);
    let was_enabled = current_mod.map(|m| m.enabled).unwrap_or(true);
    let icon = current_mod.and_then(|m| m.icon.clone());
    let position = mods.iter().position(|m| m.name == full_name);

    let version_info = get_package_version(community, full_name, new_version).await?;

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);
    if let Err(e) = installer.uninstall_mod(full_name) {
        eprintln!(
            "Warning: Failed to uninstall old version of {}: {}",
            full_name, e
        );
    }

    let cache_dir = cache::download_and_extract(
        cache_base,
        full_name,
        new_version,
        &version_info.download_url,
    )
    .await?;

    let (author, display_name) = full_name
        .split_once('-')
        .map(|(a, n)| (a.to_string(), n.to_string()))
        .unwrap_or_else(|| ("unknown".to_string(), full_name.to_string()));

    let mut new_manifest = ManifestV2::new(
        full_name,
        &author,
        &display_name,
        new_version,
        None,
        None,
        version_info.dependencies.clone(),
        icon,
    );
    new_manifest.enabled = if preserve_enabled { was_enabled } else { true };

    installer.install_mod(&cache_dir, &new_manifest)?;

    let mut mods = load_mods_yml(instance_dir)?;
    mods.retain(|m| m.name != full_name);

    if let Some(pos) = position {
        if pos <= mods.len() {
            mods.insert(pos, new_manifest);
        } else {
            mods.push(new_manifest);
        }
    } else {
        mods.push(new_manifest);
    }

    save_mods_yml(instance_dir, &mods)?;

    let final_enabled = if preserve_enabled { was_enabled } else { true };
    if !final_enabled {
        installer.disable_mod(full_name)?;
    }

    Ok(())
}

fn parse_full_name(full_name: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = full_name.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid package name: {}", full_name));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_full_name() {
        let (owner, name) = parse_full_name("BepInEx-BepInExPack").unwrap();
        assert_eq!(owner, "BepInEx");
        assert_eq!(name, "BepInExPack");
    }

    #[test]
    fn test_parse_full_name_with_dashes() {
        let (owner, name) = parse_full_name("Author-Some-Mod-Name").unwrap();
        assert_eq!(owner, "Author");
        assert_eq!(name, "Some-Mod-Name");
    }
}
