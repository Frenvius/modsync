pub mod api;
pub mod clientsettings;
pub mod profile;
pub mod update;

use std::path::Path;

use crate::modrinth::{ModrinthMod, SearchResult};

pub use api::{FetchProgress, VsModPackage, VsRelease};
pub use update::{
    check_for_updates, update_all_mods, update_mod, BatchUpdateResult, UpdateCheckResult,
    UpdateResult,
};

pub fn get_fetch_progress() -> Option<FetchProgress> {
    api::get_fetch_progress()
}

pub async fn search_mods(
    query: Option<&str>,
    tag_filter: Option<&[String]>,
    excluded_tags: Option<&[String]>,
    game_version: Option<&str>,
    sort: Option<&str>,
    page: Option<i32>,
    page_size: Option<i32>,
    cache_dir: &Path,
) -> Result<SearchResult, String> {
    let all_mods = api::fetch_all_mods(cache_dir).await?;

    let mut filtered: Vec<&VsModPackage> = all_mods.iter().collect();

    if let Some(q) = query {
        if !q.is_empty() {
            let keywords: Vec<String> = q.split_whitespace().map(|k| k.to_lowercase()).collect();
            filtered.retain(|m| {
                let name_lower = m.name.to_lowercase();
                let author_lower = m.author.to_lowercase();
                let summary_lower = m.summary.to_lowercase();

                keywords.iter().all(|kw| {
                    name_lower.contains(kw)
                        || author_lower.contains(kw)
                        || summary_lower.contains(kw)
                })
            });
        }
    }

    if let Some(tags) = tag_filter {
        if !tags.is_empty() {
            filtered.retain(|m| {
                let mod_tags_lower: Vec<String> =
                    m.tags.iter().map(|t| t.to_lowercase()).collect();
                tags.iter()
                    .all(|t| mod_tags_lower.contains(&t.to_lowercase()))
            });
        }
    }

    if let Some(excluded) = excluded_tags {
        if !excluded.is_empty() {
            filtered.retain(|m| {
                let mod_tags_lower: Vec<String> =
                    m.tags.iter().map(|t| t.to_lowercase()).collect();
                !excluded
                    .iter()
                    .any(|t| mod_tags_lower.contains(&t.to_lowercase()))
            });
        }
    }

    if let Some(gv) = game_version {
        if !gv.is_empty() {
            let gv_lower = gv.to_lowercase();
            filtered.retain(|m| {
                m.tags.iter().any(|t| t.to_lowercase() == gv_lower)
            });
        }
    }

    let sort_key = sort.unwrap_or("downloads");
    match sort_key {
        "trendingPoints" | "trending" => {
            filtered.sort_by(|a, b| b.trendingpoints.cmp(&a.trendingpoints))
        }
        "downloads" => filtered.sort_by(|a, b| b.downloads.cmp(&a.downloads)),
        "name" => filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        "lastReleased" | "updated" => filtered.sort_by(|a, b| {
            let a_date = a.lastreleased.as_deref().unwrap_or("");
            let b_date = b.lastreleased.as_deref().unwrap_or("");
            b_date.cmp(a_date)
        }),
        "created" | "newest" => filtered.sort_by(|a, b| {
            let a_date = a.lastreleased.as_deref().unwrap_or("");
            let b_date = b.lastreleased.as_deref().unwrap_or("");
            b_date.cmp(a_date)
        }),
        "follows" => filtered.sort_by(|a, b| b.follows.cmp(&a.follows)),
        "comments" => filtered.sort_by(|a, b| b.comments.cmp(&a.comments)),
        _ => filtered.sort_by(|a, b| b.downloads.cmp(&a.downloads)),
    }

    let total_hits = filtered.len() as i32;

    let page_num = page.unwrap_or(1).max(1);
    let size = page_size.unwrap_or(20).max(1);
    let offset = (page_num - 1) * size;

    let paginated: Vec<ModrinthMod> = filtered
        .into_iter()
        .skip(offset as usize)
        .take(size as usize)
        .map(vs_to_modrinth)
        .collect();

    Ok(SearchResult {
        mods: paginated,
        total_hits,
        offset,
        limit: size,
    })
}

pub async fn get_categories(cache_dir: &Path) -> Result<Vec<String>, String> {
    let tags = api::fetch_tags().await?;

    let all_mods = api::fetch_all_mods(cache_dir).await?;
    let mut used_tags: std::collections::HashSet<String> = std::collections::HashSet::new();
    for m in &all_mods {
        for t in &m.tags {
            used_tags.insert(t.clone());
        }
    }

    let game_version_names: std::collections::HashSet<String> = api::fetch_game_versions()
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|v| v.name)
        .collect();

    let mut categories: Vec<String> = tags
        .into_iter()
        .filter(|t| t.tagid > 0)
        .filter(|t| !game_version_names.contains(&t.name))
        .filter(|t| used_tags.contains(&t.name))
        .map(|t| t.name)
        .collect();

    categories.sort_by_key(|a| a.to_lowercase());
    Ok(categories)
}

pub async fn get_game_versions(_cache_dir: &Path) -> Result<Vec<String>, String> {
    let versions = api::fetch_game_versions().await?;

    let mut names: Vec<String> = versions.into_iter().map(|v| v.name).collect();
    names.reverse();
    Ok(names)
}

pub async fn get_mod_versions(modid: &str) -> Result<Vec<VsRelease>, String> {
    let detail = api::fetch_mod_detail(modid).await?;
    Ok(detail.releases)
}

pub async fn install_mod(
    downloads_dir: &Path,
    instance_dir: &Path,
    modid: &str,
    modidstr: &str,
    name: &str,
    author: &str,
    version: &str,
    download_url: &str,
    filename: &str,
    icon_url: Option<&str>,
) -> Result<(), String> {
    let cache_path = downloads_dir
        .join("vintagestory")
        .join(modid)
        .join(version)
        .join(filename);

    if !cache_path.exists() {
        api::download_mod(download_url, &cache_path).await?;
    }

    let mods_dir = instance_dir.join("Mods");
    std::fs::create_dir_all(&mods_dir)
        .map_err(|e| format!("Failed to create Mods dir: {}", e))?;

    let dest = mods_dir.join(filename);
    std::fs::copy(&cache_path, &dest)
        .map_err(|e| format!("Failed to copy mod to Mods dir: {}", e))?;

    let mut mods = profile::load_mods_json(instance_dir)?;
    profile::add_mod(
        &mut mods,
        profile::VsInstalledMod {
            modid: modid.to_string(),
            modidstr: modidstr.to_string(),
            name: name.to_string(),
            author: author.to_string(),
            version: version.to_string(),
            filename: filename.to_string(),
            icon_url: icon_url.map(|s| s.to_string()),
            enabled: true,
            installed_at: chrono::Utc::now().to_rfc3339(),
        },
    );
    profile::save_mods_json(instance_dir, &mods)?;

    Ok(())
}

pub fn remove_mod(instance_dir: &Path, modid: &str) -> Result<(), String> {
    let mut mods = profile::load_mods_json(instance_dir)?;

    if let Some(m) = profile::find_mod(&mods, modid) {
        let mods_dir = instance_dir.join("Mods");
        let file_path = mods_dir.join(&m.filename);
        let disabled_path = mods_dir.join(format!("{}.disabled", m.filename));
        let _ = std::fs::remove_file(&file_path);
        let _ = std::fs::remove_file(&disabled_path);
    }

    profile::remove_mod(&mut mods, modid);
    profile::save_mods_json(instance_dir, &mods)?;

    Ok(())
}

pub fn toggle_mod_enabled(
    instance_dir: &Path,
    modid: &str,
    enable: bool,
) -> Result<(), String> {
    if enable {
        clientsettings::enable_mod(instance_dir, modid)?;
    } else {
        clientsettings::disable_mod(instance_dir, modid)?;
    }

    let mut mods = profile::load_mods_json(instance_dir)?;
    profile::set_enabled(&mut mods, modid, enable);
    profile::save_mods_json(instance_dir, &mods)?;

    Ok(())
}

fn vs_to_modrinth(m: &VsModPackage) -> ModrinthMod {
    let slug = m
        .urlalias
        .clone()
        .unwrap_or_else(|| m.modid.to_string());

    let icon_url = m.logo.as_ref().map(|logo| {
        if logo.starts_with("http") {
            logo.clone()
        } else {
            format!("https://mods.vintagestory.at{}", logo)
        }
    });

    ModrinthMod {
        slug,
        title: m.name.clone(),
        description: m.summary.clone(),
        categories: m.tags.clone(),
        client_side: m
            .side
            .as_deref()
            .unwrap_or("universal")
            .to_string(),
        server_side: m
            .side
            .as_deref()
            .unwrap_or("universal")
            .to_string(),
        project_type: "mod".to_string(),
        downloads: m.downloads,
        icon_url,
        author: m.author.clone(),
        versions: vec![],
        follows: m.follows,
        date_created: m.lastreleased.clone().unwrap_or_default(),
        date_modified: m.lastreleased.clone().unwrap_or_default(),
        source: Some("vintagestory".to_string()),
        thunderstore_community: None,
        thunderstore_full_name: None,
        is_deprecated: false,
    }
}
