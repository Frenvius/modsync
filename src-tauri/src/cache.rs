use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub thunderstore_id: String,
    pub version: String,
    pub filename: String,
    pub hash: String,
    pub size: u64,
    pub cached_at: u64,
    pub last_accessed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheIndex {
    pub entries: Vec<CacheEntry>,
}

impl Default for CacheIndex {
    fn default() -> Self {
        Self { entries: vec![] }
    }
}

pub fn cache_dir() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir()
        .ok_or("Could not find AppData directory")?;
    Ok(app_data.join("Mod Updater").join("cache"))
}

fn cache_index_path() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("cache_index.json"))
}

pub fn ensure_cache_dir() -> Result<PathBuf, String> {
    let dir = cache_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    Ok(dir)
}

fn load_cache_index() -> Result<CacheIndex, String> {
    let index_path = cache_index_path()?;
    if !index_path.exists() {
        return Ok(CacheIndex::default());
    }

    let content = fs::read_to_string(&index_path)
        .map_err(|e| format!("Failed to read cache index: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cache index: {}", e))
}

fn save_cache_index(index: &CacheIndex) -> Result<(), String> {
    ensure_cache_dir()?;
    let index_path = cache_index_path()?;

    let content = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize cache index: {}", e))?;

    fs::write(&index_path, content)
        .map_err(|e| format!("Failed to write cache index: {}", e))?;

    Ok(())
}

fn cache_key(thunderstore_id: &str, version: &str) -> String {
    format!("{}_{}", thunderstore_id.replace('-', "_"), version.replace('.', "_"))
}

fn compute_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn is_cached(thunderstore_id: &str, version: &str) -> bool {
    let index = match load_cache_index() {
        Ok(i) => i,
        Err(_) => return false,
    };

    let key = cache_key(thunderstore_id, version);
    let cache_path = match cache_dir() {
        Ok(d) => d.join(format!("{}.zip", key)),
        Err(_) => return false,
    };

    index.entries.iter().any(|e|
        e.thunderstore_id == thunderstore_id && e.version == version
    ) && cache_path.exists()
}

pub fn get_cached_mod(thunderstore_id: &str, version: &str) -> Option<PathBuf> {
    let mut index = load_cache_index().ok()?;

    let key = cache_key(thunderstore_id, version);
    let cache_path = cache_dir().ok()?.join(format!("{}.zip", key));

    if !cache_path.exists() {
        return None;
    }

    if let Some(entry) = index.entries.iter_mut().find(|e|
        e.thunderstore_id == thunderstore_id && e.version == version
    ) {
        entry.last_accessed = current_timestamp();
        let _ = save_cache_index(&index);
    }

    Some(cache_path)
}

pub fn cache_mod(thunderstore_id: &str, version: &str, data: &[u8]) -> Result<PathBuf, String> {
    let cache_path = ensure_cache_dir()?;
    let key = cache_key(thunderstore_id, version);
    let file_path = cache_path.join(format!("{}.zip", key));

    let mut file = File::create(&file_path)
        .map_err(|e| format!("Failed to create cache file: {}", e))?;

    file.write_all(data)
        .map_err(|e| format!("Failed to write cache file: {}", e))?;

    let hash = compute_hash(data);
    let now = current_timestamp();

    let mut index = load_cache_index().unwrap_or_default();

    index.entries.retain(|e|
        !(e.thunderstore_id == thunderstore_id && e.version == version)
    );

    index.entries.push(CacheEntry {
        thunderstore_id: thunderstore_id.to_string(),
        version: version.to_string(),
        filename: format!("{}.zip", key),
        hash,
        size: data.len() as u64,
        cached_at: now,
        last_accessed: now,
    });

    save_cache_index(&index)?;

    Ok(file_path)
}

pub fn read_cached_mod(thunderstore_id: &str, version: &str) -> Result<Vec<u8>, String> {
    let cache_path = get_cached_mod(thunderstore_id, version)
        .ok_or("Mod not found in cache")?;

    let mut file = File::open(&cache_path)
        .map_err(|e| format!("Failed to open cached file: {}", e))?;

    let mut data = Vec::new();
    file.read_to_end(&mut data)
        .map_err(|e| format!("Failed to read cached file: {}", e))?;

    Ok(data)
}

pub fn get_cache_size() -> Result<u64, String> {
    let index = load_cache_index()?;
    Ok(index.entries.iter().map(|e| e.size).sum())
}

pub fn get_cache_count() -> Result<usize, String> {
    let index = load_cache_index()?;
    Ok(index.entries.len())
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_size: u64,
    pub entry_count: usize,
    pub oldest_entry: Option<u64>,
    pub newest_entry: Option<u64>,
}

pub fn get_cache_stats() -> Result<CacheStats, String> {
    let index = load_cache_index()?;

    let oldest = index.entries.iter().map(|e| e.cached_at).min();
    let newest = index.entries.iter().map(|e| e.cached_at).max();

    Ok(CacheStats {
        total_size: index.entries.iter().map(|e| e.size).sum(),
        entry_count: index.entries.len(),
        oldest_entry: oldest,
        newest_entry: newest,
    })
}

pub fn clear_cache() -> Result<u64, String> {
    let cache_path = cache_dir()?;
    let index = load_cache_index().unwrap_or_default();
    let cleared_size: u64 = index.entries.iter().map(|e| e.size).sum();

    if cache_path.exists() {
        for entry in fs::read_dir(&cache_path)
            .map_err(|e| format!("Failed to read cache directory: {}", e))?
        {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    fs::remove_file(&path).ok();
                }
            }
        }
    }

    save_cache_index(&CacheIndex::default())?;

    Ok(cleared_size)
}

pub fn clear_unused_cache(days: u32) -> Result<(usize, u64), String> {
    let mut index = load_cache_index()?;
    let cache_path = cache_dir()?;

    let cutoff = current_timestamp().saturating_sub((days as u64) * 24 * 60 * 60);

    let mut removed_count = 0usize;
    let mut removed_size = 0u64;

    index.entries.retain(|entry| {
        if entry.last_accessed < cutoff {
            let file_path = cache_path.join(&entry.filename);
            if fs::remove_file(&file_path).is_ok() {
                removed_count += 1;
                removed_size += entry.size;
            }
            false
        } else {
            true
        }
    });

    save_cache_index(&index)?;

    Ok((removed_count, removed_size))
}

pub fn remove_cached_mod(thunderstore_id: &str, version: &str) -> Result<bool, String> {
    let mut index = load_cache_index()?;
    let cache_path = cache_dir()?;
    let key = cache_key(thunderstore_id, version);
    let file_path = cache_path.join(format!("{}.zip", key));

    let initial_len = index.entries.len();
    index.entries.retain(|e|
        !(e.thunderstore_id == thunderstore_id && e.version == version)
    );

    let removed = index.entries.len() < initial_len;

    if removed {
        fs::remove_file(&file_path).ok();
        save_cache_index(&index)?;
    }

    Ok(removed)
}

#[tauri::command]
pub fn get_cache_stats_cmd() -> Result<CacheStats, String> {
    get_cache_stats()
}

#[tauri::command]
pub fn clear_cache_cmd() -> Result<u64, String> {
    clear_cache()
}

#[tauri::command]
pub fn clear_unused_cache_cmd(days: u32) -> Result<(usize, u64), String> {
    clear_unused_cache(days)
}
