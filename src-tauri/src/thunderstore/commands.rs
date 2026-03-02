use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use reqwest::Client;
use std::time::Duration;

use crate::cache;
use std::collections::HashMap;

use super::models::{PackageInfo, PackageSearchOptions, SearchResult, SortBy, ThunderstoreGame};
use super::fetch::{search_packages, get_package, get_packages_bulk, get_categories, clear_package_cache, fetch_package_readme, fetch_package_changelog};

#[tauri::command]
pub async fn thunderstore_search(
    game: String,
    query: Option<String>,
    category: Option<String>,
    sort_by: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
    include_deprecated: Option<bool>,
) -> Result<SearchResult, String> {
    let game = ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    let sort = match sort_by.as_deref() {
        Some("downloads") => SortBy::Downloads,
        Some("rating") => SortBy::Rating,
        Some("name") => SortBy::Name,
        _ => SortBy::LastUpdated,
    };

    let options = PackageSearchOptions {
        query,
        category,
        include_deprecated: include_deprecated.unwrap_or(false),
        include_nsfw: false,
        sort_by: sort,
        page: page.unwrap_or(0),
        page_size: page_size.unwrap_or(20),
    };

    search_packages(&game, &options).await
}

#[tauri::command]
pub async fn thunderstore_get_package(
    game: String,
    full_name: String,
) -> Result<Option<PackageInfo>, String> {
    let game = ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    let listing = get_package(&game, &full_name).await?;
    Ok(listing.map(|l| PackageInfo::from(&l)))
}

#[tauri::command]
pub async fn thunderstore_get_packages_bulk(
    game: String,
    full_names: Vec<String>,
) -> Result<HashMap<String, PackageInfo>, String> {
    let game = ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    get_packages_bulk(&game, &full_names).await
}

#[tauri::command]
pub async fn thunderstore_get_categories(game: String) -> Result<Vec<String>, String> {
    let game = ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    get_categories(&game).await
}

#[tauri::command]
pub fn thunderstore_refresh_cache() {
    clear_package_cache();
}

pub async fn install_mod_to_path(
    game: &ThunderstoreGame,
    full_name: &str,
    version: &str,
    target_path: &Path,
) -> Result<(), String> {
    let listing = get_package(game, full_name)
        .await?
        .ok_or_else(|| format!("Package not found: {}", full_name))?;

    let pkg_version = listing
        .versions
        .iter()
        .find(|v| v.version_number == version)
        .ok_or_else(|| format!("Version {} not found for {}", version, full_name))?;

    let zip_data = if cache::is_cached(full_name, version) {
        cache::read_cached_mod(full_name, version)?
    } else {
        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&pkg_version.download_url)
            .send()
            .await
            .map_err(|e| format!("Failed to download package: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Download failed: {}", response.status()));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download: {}", e))?;

        let data = bytes.to_vec();

        if let Err(e) = cache::cache_mod(full_name, version, &data) {
            eprintln!("Warning: Failed to cache package: {}", e);
        }

        data
    };

    fs::create_dir_all(target_path)
        .map_err(|e| format!("Failed to create target directory: {}", e))?;

    let zip_path = target_path.join(format!("{}.zip", listing.name));
    let mut file = File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;
    file.write_all(&zip_data)
        .map_err(|e| format!("Failed to write zip file: {}", e))?;

    let file = File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let outpath = match entry.enclosed_name() {
            Some(path) => target_path.join(path),
            None => continue,
        };

        if entry.name().ends_with('/') {
            fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).ok();
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    fs::remove_file(&zip_path).ok();

    Ok(())
}

#[tauri::command]
pub async fn thunderstore_install_package(
    game: String,
    full_name: String,
    version: String,
    target_path: String,
) -> Result<(), String> {
    let game = ThunderstoreGame::from_api_name(&game)
        .ok_or_else(|| format!("Unknown game: {}", game))?;

    install_mod_to_path(&game, &full_name, &version, &PathBuf::from(&target_path)).await
}

#[tauri::command]
pub async fn thunderstore_get_package_readme(
    namespace: String,
    name: String,
    version: String,
) -> Result<Option<String>, String> {
    fetch_package_readme(&namespace, &name, &version).await
}

#[tauri::command]
pub async fn thunderstore_get_package_changelog(
    namespace: String,
    name: String,
    version: String,
) -> Result<Option<String>, String> {
    fetch_package_changelog(&namespace, &name, &version).await
}

#[tauri::command]
pub fn thunderstore_get_games() -> Vec<GameInfo> {
    vec![
        GameInfo {
            id: "valheim".to_string(),
            name: "Valheim".to_string(),
        },
        GameInfo {
            id: "lethal-company".to_string(),
            name: "Lethal Company".to_string(),
        },
        GameInfo {
            id: "ror2".to_string(),
            name: "Risk of Rain 2".to_string(),
        },
    ]
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GameInfo {
    pub id: String,
    pub name: String,
}
