use flate2::read::GzDecoder;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read as IoRead;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::http::HTTP_CLIENT;

use super::manifest;

const THUNDERSTORE_API_BASE: &str = "https://thunderstore.io";
const MEMORY_CACHE_DURATION: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ThunderstorePackage {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    #[serde(default)]
    pub is_deprecated: bool,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub has_nsfw_content: bool,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub rating_score: i64,
    pub date_created: String,
    pub date_updated: String,
    pub versions: Vec<ThunderstoreVersion>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ThunderstoreVersion {
    pub name: String,
    pub full_name: String,
    pub description: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub version_number: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub downloads: i64,
    pub download_url: String,
    #[serde(default)]
    pub website_url: Option<String>,
    #[serde(default)]
    pub is_active: bool,
    pub date_created: String,
    #[serde(default)]
    pub file_size: Option<i64>,
}

impl ThunderstorePackage {
    pub fn total_downloads(&self) -> i64 {
        self.versions.iter().map(|v| v.downloads).sum()
    }

    pub fn latest(&self) -> Option<&ThunderstoreVersion> {
        self.versions.first()
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PackageVersionInfo {
    pub id: String,
    pub version_number: String,
    pub name: String,
    pub date_published: String,
    pub download_url: String,
    pub dependencies: Vec<String>,
    pub icon: Option<String>,
}

struct PackageCache {
    packages: Vec<ThunderstorePackage>,
    fetched_at: Instant,
}

static CACHE: Lazy<Mutex<HashMap<String, PackageCache>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchProgress {
    pub chunks_downloaded: usize,
    pub total_chunks: usize,
    pub is_loading: bool,
}

static FETCH_PROGRESS: Lazy<Mutex<HashMap<String, FetchProgress>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize)]
struct IndexMeta {
    chunk_urls: Vec<String>,
}

pub fn get_fetch_progress(community: &str) -> Option<FetchProgress> {
    FETCH_PROGRESS
        .lock()
        .ok()
        .and_then(|map| map.get(community).cloned())
}

fn set_fetch_progress(community: &str, progress: FetchProgress) {
    if let Ok(mut map) = FETCH_PROGRESS.lock() {
        map.insert(community.to_string(), progress);
    }
}

fn clear_fetch_progress(community: &str) {
    if let Ok(mut map) = FETCH_PROGRESS.lock() {
        map.remove(community);
    }
}

pub async fn fetch_all_packages(
    community: &str,
    cache_dir: &Path,
) -> Result<Vec<ThunderstorePackage>, String> {
    {
        let cache = CACHE
            .lock()
            .map_err(|e| format!("Cache lock error: {}", e))?;
        if let Some(cached) = cache.get(community) {
            if cached.fetched_at.elapsed() < MEMORY_CACHE_DURATION {
                return Ok(cached.packages.clone());
            }
        }
    }

    let community_cache_dir = cache_dir.join(community);
    std::fs::create_dir_all(&community_cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let meta_path = community_cache_dir.join("index_meta.json");
    let packages_path = community_cache_dir.join("packages.json");

    if packages_path.exists() {
        if let Ok(packages) = load_packages_from_disk(&packages_path) {
            update_memory_cache(community, packages.clone());

            let community_owned = community.to_string();
            let meta_path_owned = meta_path.clone();
            let packages_path_owned = packages_path.clone();
            tokio::spawn(async move {
                let _ = validate_and_refresh_cache(
                    &community_owned,
                    &meta_path_owned,
                    &packages_path_owned,
                )
                .await;
            });

            return Ok(packages);
        }
    }

    let client = HTTP_CLIENT.clone();

    let index_url = format!(
        "{}/c/{}/api/v1/package-listing-index/",
        THUNDERSTORE_API_BASE, community
    );

    set_fetch_progress(
        community,
        FetchProgress {
            chunks_downloaded: 0,
            total_chunks: 0,
            is_loading: true,
        },
    );

    let chunk_urls = fetch_index_chunk_urls(&client, &index_url, community).await?;

    let total_chunks = chunk_urls.len();
    set_fetch_progress(
        community,
        FetchProgress {
            chunks_downloaded: 0,
            total_chunks,
            is_loading: true,
        },
    );

    let community_for_progress = community.to_string();
    let mut handles = Vec::new();

    for (idx, url) in chunk_urls.iter().enumerate() {
        let client = client.clone();
        let url = url.clone();
        let community_clone = community_for_progress.clone();

        let handle = tokio::spawn(async move {
            let resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Failed to fetch chunk {}: {}", idx, e))?;

            if !resp.status().is_success() {
                return Err(format!("Chunk {} returned HTTP {}", idx, resp.status()));
            }

            let bytes = resp
                .bytes()
                .await
                .map_err(|e| format!("Failed to read chunk {}: {}", idx, e))?;

            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut json_str = String::new();
            decoder
                .read_to_string(&mut json_str)
                .map_err(|e| format!("Failed to decompress chunk {}: {}", idx, e))?;

            let packages: Vec<ThunderstorePackage> = serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse chunk {}: {}", idx, e))?;

            if let Ok(mut map) = FETCH_PROGRESS.lock() {
                if let Some(progress) = map.get_mut(&community_clone) {
                    progress.chunks_downloaded += 1;
                }
            }

            Ok::<Vec<ThunderstorePackage>, String>(packages)
        });

        handles.push(handle);
    }

    let mut all_packages = Vec::new();
    for handle in handles {
        let chunk_packages = handle
            .await
            .map_err(|e| format!("Task join error: {}", e))??;
        all_packages.extend(chunk_packages);
    }

    let packages_json =
        serde_json::to_string(&all_packages).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&packages_path, &packages_json)
        .map_err(|e| format!("Failed to write cache: {}", e))?;

    let meta = IndexMeta { chunk_urls };
    let meta_json =
        serde_json::to_string(&meta).map_err(|e| format!("Failed to serialize meta: {}", e))?;
    std::fs::write(&meta_path, &meta_json).map_err(|e| format!("Failed to write meta: {}", e))?;

    update_memory_cache(community, all_packages.clone());
    clear_fetch_progress(community);

    Ok(all_packages)
}

fn load_packages_from_disk(path: &Path) -> Result<Vec<ThunderstorePackage>, String> {
    let json = std::fs::read_to_string(path).map_err(|e| format!("Failed to read cache: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse cache: {}", e))
}

fn update_memory_cache(community: &str, packages: Vec<ThunderstorePackage>) {
    if let Ok(mut cache) = CACHE.lock() {
        cache.insert(
            community.to_string(),
            PackageCache {
                packages,
                fetched_at: Instant::now(),
            },
        );
    }
}

async fn fetch_index_chunk_urls(
    client: &reqwest::Client,
    index_url: &str,
    community: &str,
) -> Result<Vec<String>, String> {
    let index_response = client.get(index_url).send().await.map_err(|e| {
        clear_fetch_progress(community);
        format!("Failed to fetch package index: {}", e)
    })?;

    if !index_response.status().is_success() {
        clear_fetch_progress(community);
        return Err(format!(
            "Thunderstore index API error: {}",
            index_response.status()
        ));
    }

    let index_bytes = index_response.bytes().await.map_err(|e| {
        clear_fetch_progress(community);
        format!("Failed to read index response: {}", e)
    })?;

    let mut decoder = GzDecoder::new(&index_bytes[..]);
    let mut json_str = String::new();
    decoder.read_to_string(&mut json_str).map_err(|e| {
        clear_fetch_progress(community);
        format!("Failed to decompress index: {}", e)
    })?;

    serde_json::from_str(&json_str).map_err(|e| {
        clear_fetch_progress(community);
        format!("Failed to parse index JSON: {}", e)
    })
}

async fn validate_and_refresh_cache(
    community: &str,
    meta_path: &Path,
    packages_path: &Path,
) -> Result<(), String> {
    let client = HTTP_CLIENT.clone();

    let index_url = format!(
        "{}/c/{}/api/v1/package-listing-index/",
        THUNDERSTORE_API_BASE, community
    );

    let index_response = client
        .get(&index_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !index_response.status().is_success() {
        return Err(format!("API returned {}", index_response.status()));
    }

    let index_bytes = index_response.bytes().await.map_err(|e| e.to_string())?;
    let chunk_urls: Vec<String> = {
        let mut decoder = GzDecoder::new(&index_bytes[..]);
        let mut json_str = String::new();
        decoder
            .read_to_string(&mut json_str)
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&json_str).map_err(|e| e.to_string())?
    };

    if meta_path.exists() {
        if let Ok(meta_json) = std::fs::read_to_string(meta_path) {
            if let Ok(cached_meta) = serde_json::from_str::<IndexMeta>(&meta_json) {
                if cached_meta.chunk_urls == chunk_urls {
                    return Ok(());
                }
            }
        }
    }

    let mut handles = Vec::new();

    for (idx, url) in chunk_urls.iter().enumerate() {
        let client = client.clone();
        let url = url.clone();

        let handle = tokio::spawn(async move {
            let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("Chunk {} HTTP {}", idx, resp.status()));
            }
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut json_str = String::new();
            decoder
                .read_to_string(&mut json_str)
                .map_err(|e| e.to_string())?;
            let packages: Vec<ThunderstorePackage> =
                serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
            Ok::<Vec<ThunderstorePackage>, String>(packages)
        });
        handles.push(handle);
    }

    let mut all_packages = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(chunk)) => all_packages.extend(chunk),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(e.to_string()),
        }
    }

    let packages_json = serde_json::to_string(&all_packages).map_err(|e| e.to_string())?;
    std::fs::write(packages_path, &packages_json).map_err(|e| e.to_string())?;

    let meta = IndexMeta { chunk_urls };
    let meta_json = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
    std::fs::write(meta_path, &meta_json).map_err(|e| e.to_string())?;

    update_memory_cache(community, all_packages);

    Ok(())
}

pub fn load_cache_from_disk(community: &str, cache_dir: &Path) -> Result<bool, String> {
    let packages_path = cache_dir.join(community).join("packages.json");

    if !packages_path.exists() {
        return Ok(false);
    }

    let packages = load_packages_from_disk(&packages_path)?;
    update_memory_cache(community, packages);
    Ok(true)
}

pub async fn get_package_versions(
    community: &str,
    owner: &str,
    name: &str,
    cache_dir: Option<&Path>,
) -> Result<Vec<PackageVersionInfo>, String> {
    let full_name = format!("{}-{}", owner, name);

    {
        let cache = CACHE
            .lock()
            .map_err(|e| format!("Cache lock error: {}", e))?;
        if let Some(cached) = cache.get(community) {
            if let Some(pkg) = cached.packages.iter().find(|p| p.full_name == full_name) {
                return Ok(package_to_versions(pkg));
            }
        }
    }

    if let Some(dir) = cache_dir {
        if load_cache_from_disk(community, dir)? {
            let cache = CACHE
                .lock()
                .map_err(|e| format!("Cache lock error: {}", e))?;
            if let Some(cached) = cache.get(community) {
                if let Some(pkg) = cached.packages.iter().find(|p| p.full_name == full_name) {
                    return Ok(package_to_versions(pkg));
                }
            }
        }
    }

    let url = format!(
        "{}/api/v1/package/{}/{}/",
        THUNDERSTORE_API_BASE, owner, name
    );

    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let pkg: ThunderstorePackage = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse package: {}", e))?;

    Ok(package_to_versions(&pkg))
}

fn package_to_versions(pkg: &ThunderstorePackage) -> Vec<PackageVersionInfo> {
    pkg.versions
        .iter()
        .filter(|v| v.is_active)
        .map(|v| PackageVersionInfo {
            id: v.full_name.clone(),
            version_number: v.version_number.clone(),
            name: v.full_name.clone(),
            date_published: v.date_created.clone(),
            download_url: v.download_url.clone(),
            dependencies: v.dependencies.clone(),
            icon: v.icon.clone(),
        })
        .collect()
}

pub async fn get_latest_version(
    community: &str,
    full_name: &str,
) -> Result<PackageVersionInfo, String> {
    let (owner, name) = manifest::parse_full_name(full_name)?;
    let versions = get_package_versions(community, &owner, &name, None).await?;
    versions
        .into_iter()
        .next()
        .ok_or_else(|| format!("No versions found for {}", full_name))
}


pub async fn get_package_readme(
    owner: &str,
    name: &str,
    version: &str,
) -> Result<Option<String>, String> {
    let url = format!(
        "{}/api/experimental/package/{}/{}/{}/readme/",
        THUNDERSTORE_API_BASE, owner, name, version
    );

    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch README: {}", e))?;

    if response.status() == 404 {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Ok(None);
    }

    #[derive(serde::Deserialize)]
    struct MarkdownResponse {
        markdown: Option<String>,
    }

    let result: MarkdownResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse README response: {}", e))?;

    Ok(result.markdown)
}

pub async fn get_package_changelog(
    owner: &str,
    name: &str,
    version: &str,
) -> Result<Option<String>, String> {
    let url = format!(
        "{}/api/experimental/package/{}/{}/{}/changelog/",
        THUNDERSTORE_API_BASE, owner, name, version
    );

    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch changelog: {}", e))?;

    if response.status() == 404 {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Ok(None);
    }

    #[derive(serde::Deserialize)]
    struct MarkdownResponse {
        markdown: Option<String>,
    }

    let result: MarkdownResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse changelog response: {}", e))?;

    Ok(result.markdown)
}

