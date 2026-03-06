//! Thunderstore mod source - r2modman compatible implementation
//!
//! This module provides full Thunderstore integration with r2modman-compatible
//! profile handling, mods.yml format, and installation rules.

pub mod api;
pub mod cache;
pub mod installer;
pub mod manifest;
pub mod profile;
pub mod rules;
pub mod sync;
pub mod update;

use std::collections::HashSet;
use std::path::Path;

use crate::games::LoaderConfig;
use crate::modrinth::{ModrinthMod, SearchResult};

pub use api::{FetchProgress, PackageVersionInfo, ThunderstorePackage};
pub use cache::{resolve_dependencies_with_visited, ResolvedDep};
pub use manifest::DependencyString;
pub use update::{
    check_for_updates, update_all_mods, update_mod, BatchUpdateResult, UpdateCheckResult,
    UpdateResult,
};

pub fn get_fetch_progress(community: &str) -> Option<FetchProgress> {
    api::get_fetch_progress(community)
}

pub async fn search_mods(
    community: &str,
    query: Option<&str>,
    categories_filter: Option<&[String]>,
    sort: Option<&str>,
    page: Option<i32>,
    page_size: Option<i32>,
    cache_dir: &Path,
) -> Result<SearchResult, String> {
    let all_packages = api::fetch_all_packages(community, cache_dir).await?;

    let mut filtered: Vec<&ThunderstorePackage> = all_packages
        .iter()
        .filter(|p| !p.is_deprecated && !p.has_nsfw_content && !p.versions.is_empty())
        .collect();

    if let Some(q) = query {
        if !q.is_empty() {
            let keywords: Vec<String> = q.split_whitespace().map(|k| k.to_lowercase()).collect();
            filtered.retain(|p| {
                let name_lower = p.name.to_lowercase();
                let owner_lower = p.owner.to_lowercase();
                let desc_lower = p
                    .latest()
                    .map(|v| v.description.to_lowercase())
                    .unwrap_or_default();

                keywords.iter().all(|kw| {
                    name_lower.contains(kw) || owner_lower.contains(kw) || desc_lower.contains(kw)
                })
            });
        }
    }

    if let Some(cats) = categories_filter {
        if !cats.is_empty() {
            filtered.retain(|p| {
                let pkg_cats_lower: Vec<String> =
                    p.categories.iter().map(|c| c.to_lowercase()).collect();
                cats.iter()
                    .all(|c| pkg_cats_lower.contains(&c.to_lowercase()))
            });
        }
    }

    let sort_key = sort.unwrap_or("downloads");
    match sort_key {
        "downloads" => filtered.sort_by(|a, b| b.total_downloads().cmp(&a.total_downloads())),
        "updated" => filtered.sort_by(|a, b| b.date_updated.cmp(&a.date_updated)),
        "newest" => filtered.sort_by(|a, b| b.date_created.cmp(&a.date_created)),
        "follows" => filtered.sort_by(|a, b| b.rating_score.cmp(&a.rating_score)),
        "name" => filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        _ => filtered.sort_by(|a, b| b.total_downloads().cmp(&a.total_downloads())),
    }

    let total_hits = filtered.len() as i32;

    let page_num = page.unwrap_or(1).max(1);
    let size = page_size.unwrap_or(20).max(1);
    let offset = (page_num - 1) * size;

    let paginated: Vec<ModrinthMod> = filtered
        .into_iter()
        .skip(offset as usize)
        .take(size as usize)
        .map(|pkg| thunderstore_to_modrinth(pkg, community))
        .collect();

    Ok(SearchResult {
        mods: paginated,
        total_hits,
        offset,
        limit: size,
    })
}

pub async fn get_categories(community: &str, cache_dir: &Path) -> Result<Vec<String>, String> {
    let all_packages = api::fetch_all_packages(community, cache_dir).await?;

    let mut category_set: HashSet<String> = HashSet::new();
    for pkg in &all_packages {
        if !pkg.is_deprecated && !pkg.has_nsfw_content {
            for cat in &pkg.categories {
                category_set.insert(cat.clone());
            }
        }
    }

    let mut categories: Vec<String> = category_set.into_iter().collect();
    categories.sort_by_key(|a| a.to_lowercase());
    Ok(categories)
}

fn thunderstore_to_modrinth(pkg: &ThunderstorePackage, community: &str) -> ModrinthMod {
    let slug = format!("{}-{}", pkg.owner, pkg.name);
    let latest = pkg.latest();

    ModrinthMod {
        slug: slug.clone(),
        title: latest
            .map(|v| v.name.clone())
            .unwrap_or_else(|| pkg.name.clone()),
        description: latest.map(|v| v.description.clone()).unwrap_or_default(),
        categories: pkg.categories.clone(),
        client_side: "unknown".to_string(),
        server_side: "unknown".to_string(),
        project_type: "mod".to_string(),
        downloads: pkg.total_downloads(),
        icon_url: latest.and_then(|v| v.icon.clone()),
        author: pkg.owner.clone(),
        versions: pkg
            .latest()
            .map(|v| vec![v.version_number.clone()])
            .unwrap_or_default(),
        follows: pkg.rating_score,
        date_created: pkg.date_created.clone(),
        date_modified: pkg.date_updated.clone(),
        source: Some("thunderstore".to_string()),
        thunderstore_community: Some(community.to_string()),
        thunderstore_full_name: Some(pkg.full_name.clone()),
    }
}

pub async fn get_package_versions(
    community: &str,
    owner: &str,
    name: &str,
) -> Result<Vec<PackageVersionInfo>, String> {
    api::get_package_versions(community, owner, name).await
}

pub async fn get_latest_package_version(
    community: &str,
    full_name: &str,
) -> Result<PackageVersionInfo, String> {
    api::get_latest_version(community, full_name).await
}

pub async fn resolve_dependencies(
    community: &str,
    dep_strings: &[String],
) -> Result<Vec<ResolvedDep>, String> {
    cache::resolve_dependencies(community, dep_strings).await
}

pub async fn download_and_cache(
    cache_base: &Path,
    full_name: &str,
    version: &str,
    download_url: &str,
) -> Result<std::path::PathBuf, String> {
    cache::download_and_extract(cache_base, full_name, version, download_url).await
}

pub async fn install_mod_full(
    cache_base: &Path,
    instance_dir: &Path,
    full_name: &str,
    version: &str,
    download_url: &str,
    dependencies: &[String],
    is_loader: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    installer::install_mod_full(
        cache_base,
        instance_dir,
        full_name,
        version,
        download_url,
        dependencies,
        is_loader,
        game_id,
        loader,
    )
    .await
}

pub fn toggle_mod_enabled(
    instance_dir: &Path,
    full_name: &str,
    enable: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    installer::toggle_mod_enabled(instance_dir, full_name, enable, game_id, loader)
}

pub fn remove_mod_from_profile(
    instance_dir: &Path,
    full_name: &str,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    installer::remove_mod_from_profile(instance_dir, full_name, game_id, loader)
}

pub async fn ensure_loader_installed(
    cache_base: &Path,
    instance_dir: &Path,
    community: &str,
    loader_config: &LoaderConfig,
    game_id: &str,
) -> Result<String, String> {
    if loader_config.loader_type.is_installed(instance_dir) {
        let mods = profile::load_mods_yml(instance_dir)?;
        let version = profile::find_mod_in_list(&mods, &loader_config.package_name)
            .map(|m| m.version_number.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        return Ok(version);
    }

    let ver = get_latest_package_version(community, &loader_config.package_name).await?;
    install_mod_full(
        cache_base,
        instance_dir,
        &loader_config.package_name,
        &ver.version_number,
        &ver.download_url,
        &ver.dependencies,
        true,
        game_id,
        Some(loader_config.loader_type.name()),
    )
    .await?;

    Ok(ver.version_number)
}

pub fn clear_cache(community: Option<&str>, cache_base: Option<&Path>) {
    api::clear_cache(community, cache_base);
}

pub fn parse_dependency_string(dep: &str) -> Option<(String, String, String)> {
    DependencyString::parse(dep).map(|d| (d.owner, d.name, d.version))
}
