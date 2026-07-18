use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::http::HTTP_CLIENT;

const VS_API_BASE: &str = "https://mods.vintagestory.at/api";
const MEMORY_CACHE_DURATION: Duration = Duration::from_secs(300);

fn deserialize_nullable_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer).map(|v| v.unwrap_or(0))
}

fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(|v| v.unwrap_or_default())
}

pub fn sanitize_nulls(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            let keys: Vec<String> = map.keys().cloned().collect();
            for key in keys {
                if let Some(v) = map.get_mut(&key) {
                    if v.is_null() {
                        map.remove(&key);
                    } else {
                        sanitize_nulls(v);
                    }
                }
            }
        }
        serde_json::Value::Array(arr) => {
            arr.retain(|item| !item.is_null());
            for item in arr.iter_mut() {
                sanitize_nulls(item);
            }
        }
        _ => {}
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VsModPackage {
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub modid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub assetid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub downloads: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub follows: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub trendingpoints: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub comments: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub name: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub summary: String,
    #[serde(default)]
    pub modidstrs: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub author: String,
    #[serde(default)]
    pub urlalias: Option<String>,
    #[serde(default)]
    pub side: Option<String>,
    #[serde(default, rename = "type")]
    pub mod_type: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub lastreleased: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VsRelease {
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub releaseid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub mainfile: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub filename: String,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub fileid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub downloads: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub modidstr: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub modversion: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub created: String,
    #[serde(default)]
    pub changelog: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VsScreenshot {
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub fileid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub filename: String,
    #[serde(default)]
    pub thumbnailfilename: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct VsModDetailInner {
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub modid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub assetid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub name: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub author: String,
    #[serde(default)]
    pub urlalias: Option<String>,
    #[serde(default)]
    pub homepageurl: Option<String>,
    #[serde(default)]
    pub sourcecodeurl: Option<String>,
    #[serde(default)]
    pub issuetrackerurl: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub downloads: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub follows: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub trendingpoints: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub comments: i64,
    #[serde(default)]
    pub side: Option<String>,
    #[serde(default, rename = "type")]
    pub mod_type: Option<String>,
    #[serde(default)]
    pub created: Option<String>,
    #[serde(default)]
    pub lastreleased: Option<String>,
    #[serde(default)]
    pub lastmodified: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub releases: Vec<VsRelease>,
    #[serde(default)]
    pub screenshots: Vec<VsScreenshot>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub logofilename: Option<String>,
    #[serde(default)]
    pub modidstrs: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct VsModDetailResponse {
    #[serde(default)]
    pub statuscode: Option<String>,
    #[serde(rename = "mod")]
    pub mod_data: VsModDetailInner,
}

fn deserialize_i64_or_string<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: serde_json::Value = serde::Deserialize::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => n.as_i64().ok_or_else(|| serde::de::Error::custom("not i64")),
        serde_json::Value::String(s) => s.parse::<i64>().map_err(serde::de::Error::custom),
        _ => Err(serde::de::Error::custom("expected number or string")),
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VsTag {
    #[serde(deserialize_with = "deserialize_i64_or_string")]
    pub tagid: i64,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchProgress {
    pub is_loading: bool,
    pub stage: String,
}

#[derive(Debug, Deserialize, Clone)]
struct VsSearchResponse {
    #[allow(dead_code)]
    pub statuscode: String,
    pub mods: Vec<VsModPackage>,
}

#[derive(Debug, Deserialize, Clone)]
struct VsTagsResponse {
    #[allow(dead_code)]
    pub statuscode: String,
    pub tags: Vec<VsTag>,
}

#[derive(Debug, Deserialize, Clone)]
struct VsGameVersionsResponse {
    #[allow(dead_code)]
    pub statuscode: String,
    pub gameversions: Vec<VsTag>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct VsUpdateEntry {
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub releaseid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub mainfile: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub filename: String,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub fileid: i64,
    #[serde(default, deserialize_with = "deserialize_nullable_i64")]
    pub downloads: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub modidstr: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub modversion: String,
    #[serde(default)]
    pub created: String,
}

#[derive(Debug, Deserialize, Clone)]
struct VsUpdateResponse {
    #[allow(dead_code)]
    pub statuscode: String,
    #[serde(default)]
    pub updates: std::collections::HashMap<String, VsUpdateEntry>,
}

struct ModCache {
    mods: Vec<VsModPackage>,
    fetched_at: Instant,
}

struct TagCache {
    tags: Vec<VsTag>,
    fetched_at: Instant,
}

struct GameVersionCache {
    versions: Vec<VsTag>,
    fetched_at: Instant,
}

static MOD_CACHE: Lazy<Mutex<Option<ModCache>>> = Lazy::new(|| Mutex::new(None));
static TAG_CACHE: Lazy<Mutex<Option<TagCache>>> = Lazy::new(|| Mutex::new(None));
static VERSION_CACHE: Lazy<Mutex<Option<GameVersionCache>>> = Lazy::new(|| Mutex::new(None));
static FETCH_PROGRESS: Lazy<Mutex<Option<FetchProgress>>> = Lazy::new(|| Mutex::new(None));

pub fn get_fetch_progress() -> Option<FetchProgress> {
    FETCH_PROGRESS.lock().ok().and_then(|p| p.clone())
}

fn set_fetch_progress(progress: FetchProgress) {
    if let Ok(mut p) = FETCH_PROGRESS.lock() {
        *p = Some(progress);
    }
}

fn clear_fetch_progress() {
    if let Ok(mut p) = FETCH_PROGRESS.lock() {
        *p = None;
    }
}

pub async fn fetch_all_mods(cache_dir: &Path) -> Result<Vec<VsModPackage>, String> {
    {
        let cache = MOD_CACHE.lock().map_err(|e| format!("Cache lock error: {}", e))?;
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < MEMORY_CACHE_DURATION {
                return Ok(cached.mods.clone());
            }
        }
    }

    let vs_cache_dir = cache_dir.join("vintagestory");
    std::fs::create_dir_all(&vs_cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let packages_path = vs_cache_dir.join("mods.json");

    if packages_path.exists() {
        if let Ok(mods) = load_mods_from_disk(&packages_path) {
            update_memory_cache(mods.clone());

            let packages_path_owned = packages_path.clone();
            tokio::spawn(async move {
                let _ = refresh_cache(&packages_path_owned).await;
            });

            return Ok(mods);
        }
    }

    set_fetch_progress(FetchProgress {
        is_loading: true,
        stage: "fetching_mods".to_string(),
    });

    let url = format!("{}/mods", VS_API_BASE);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| {
            clear_fetch_progress();
            format!("Failed to fetch VS mods: {}", e)
        })?;

    if !response.status().is_success() {
        clear_fetch_progress();
        return Err(format!("VS API error: {}", response.status()));
    }

    let body: VsSearchResponse = response.json().await.map_err(|e| {
        clear_fetch_progress();
        format!("Failed to parse VS mods response: {}", e)
    })?;

    let mods = body.mods;

    let json = serde_json::to_string(&mods)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&packages_path, &json)
        .map_err(|e| format!("Failed to write cache: {}", e))?;

    update_memory_cache(mods.clone());
    clear_fetch_progress();

    Ok(mods)
}

fn load_mods_from_disk(path: &Path) -> Result<Vec<VsModPackage>, String> {
    let json = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read cache: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse cache: {}", e))
}

fn update_memory_cache(mods: Vec<VsModPackage>) {
    if let Ok(mut cache) = MOD_CACHE.lock() {
        *cache = Some(ModCache {
            mods,
            fetched_at: Instant::now(),
        });
    }
}

async fn refresh_cache(packages_path: &Path) -> Result<(), String> {
    let url = format!("{}/mods", VS_API_BASE);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API returned {}", response.status()));
    }

    let body: VsSearchResponse = response.json().await.map_err(|e| e.to_string())?;
    let mods = body.mods;

    let json = serde_json::to_string(&mods).map_err(|e| e.to_string())?;
    std::fs::write(packages_path, &json).map_err(|e| e.to_string())?;

    update_memory_cache(mods);
    Ok(())
}

pub fn load_cache_from_disk(cache_dir: &Path) -> Result<bool, String> {
    let packages_path = cache_dir.join("vintagestory").join("mods.json");

    if !packages_path.exists() {
        return Ok(false);
    }

    let mods = load_mods_from_disk(&packages_path)?;
    update_memory_cache(mods);
    Ok(true)
}

pub async fn fetch_mod_detail(modid: &str) -> Result<VsModDetailInner, String> {
    if let Ok(detail) = fetch_mod_detail_by_id(modid).await {
        return Ok(detail);
    }

    let numeric_id = {
        let cache = MOD_CACHE.lock().ok();
        cache.and_then(|c| {
            c.as_ref().and_then(|cached| {
                cached.mods.iter().find(|m| {
                    m.urlalias.as_deref() == Some(modid)
                        || m.modidstrs.iter().any(|s| s == modid)
                }).map(|m| m.modid.to_string())
            })
        })
    };

    if let Some(nid) = numeric_id {
        if nid != modid {
            return fetch_mod_detail_by_id(&nid).await;
        }
    }

    Err(format!("Mod '{}' not found in VS mod database", modid))
}

async fn fetch_mod_detail_by_id(modid: &str) -> Result<VsModDetailInner, String> {
    let url = format!("{}/mod/{}", VS_API_BASE, modid);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch mod detail: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("VS API error: {}", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let raw: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse mod detail JSON: {}", e))?;

    let mut mod_obj = raw
        .get("mod")
        .ok_or_else(|| "Response missing 'mod' field".to_string())?
        .clone();

    sanitize_nulls(&mut mod_obj);

    let detail: VsModDetailInner = serde_json::from_value(mod_obj)
        .map_err(|e| format!("Failed to deserialize mod detail for '{}': {} (line {} col {})", modid, e, e.line(), e.column()))?;

    Ok(detail)
}

pub async fn fetch_tags() -> Result<Vec<VsTag>, String> {
    {
        let cache = TAG_CACHE.lock().map_err(|e| format!("Cache lock error: {}", e))?;
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < MEMORY_CACHE_DURATION {
                return Ok(cached.tags.clone());
            }
        }
    }

    let url = format!("{}/tags", VS_API_BASE);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tags: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("VS API error: {}", response.status()));
    }

    let body: VsTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse tags: {}", e))?;

    let tags = body.tags;

    if let Ok(mut cache) = TAG_CACHE.lock() {
        *cache = Some(TagCache {
            tags: tags.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(tags)
}

pub async fn fetch_game_versions() -> Result<Vec<VsTag>, String> {
    {
        let cache = VERSION_CACHE
            .lock()
            .map_err(|e| format!("Cache lock error: {}", e))?;
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < MEMORY_CACHE_DURATION {
                return Ok(cached.versions.clone());
            }
        }
    }

    let url = format!("{}/gameversions", VS_API_BASE);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch game versions: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("VS API error: {}", response.status()));
    }

    let body: VsGameVersionsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse game versions: {}", e))?;

    let versions = body.gameversions;

    if let Ok(mut cache) = VERSION_CACHE.lock() {
        *cache = Some(GameVersionCache {
            versions: versions.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(versions)
}

pub async fn check_updates(
    mods: &[(String, String)],
) -> Result<std::collections::HashMap<String, VsUpdateEntry>, String> {
    if mods.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let mods_param: String = mods
        .iter()
        .map(|(id, ver)| format!("{}@{}", id, ver))
        .collect::<Vec<_>>()
        .join(",");

    let url = format!("{}/updates?mods={}", VS_API_BASE, mods_param);
    let response = HTTP_CLIENT
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to check updates: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("VS API error: {}", response.status()));
    }

    let body: VsUpdateResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse update response: {}", e))?;

    Ok(body.updates)
}

pub async fn download_mod(url: &str, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create download dir: {}", e))?;
    }

    let full_url = if url.starts_with("http") {
        url.to_string()
    } else {
        format!("https://mods.vintagestory.at{}", url)
    };

    let response = HTTP_CLIENT
        .get(&full_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download mod: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    std::fs::write(dest, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
