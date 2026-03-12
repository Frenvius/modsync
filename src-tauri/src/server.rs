use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, LazyLock};
use std::time::SystemTime;
use tauri::AppHandle;
use tokio::sync::RwLock;
use walkdir::WalkDir;

use crate::games;
use crate::instance;
use tauri::Manager;
use crate::modpack::{Modpack, ModpackMod};
use crate::sources::thunderstore;
use crate::storage;

static SERVER_HANDLE: RwLock<Option<tokio::task::JoinHandle<()>>> = RwLock::const_new(None);
static CURRENT_MODPACK_ID: RwLock<Option<String>> = RwLock::const_new(None);

#[derive(Clone)]
struct CachedFileHash {
    mtime: SystemTime,
    hash: String,
    size: u64,
}

static HASH_CACHE: LazyLock<RwLock<HashMap<String, CachedFileHash>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub path: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileManifest {
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceMod {
    pub identifier: String,
    pub version: String,
    pub enabled: bool,
    pub version_id: Option<String>,
    pub display_name: Option<String>,
    pub author: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct P2PFile {
    pub path: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncManifest {
    pub game_id: String,
    pub mod_source: String,
    pub community: Option<String>,
    pub source_mods: Vec<SourceMod>,
    pub p2p_files: Vec<P2PFile>,
}

const EXCLUDED_PATTERNS: &[&str] = &[
    "LogOutput.log",
    "BepInEx/LogOutput.log",
    ".log",
    "__MACOSX",
    ".DS_Store",
    "Thumbs.db",
];

fn should_exclude(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    for pattern in EXCLUDED_PATTERNS {
        if path_lower.contains(&pattern.to_lowercase()) {
            return true;
        }
    }
    if path
        .split('/')
        .any(|part| part.starts_with('.') && part != ".")
    {
        return true;
    }
    false
}

fn generate_manifest(instance_dir: &std::path::Path) -> Result<ProfileManifest, String> {
    let mut files = Vec::new();

    for entry in WalkDir::new(instance_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let relative_path = path
            .strip_prefix(instance_dir)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if should_exclude(&relative_path) {
            continue;
        }

        let mut file = std::fs::File::open(path)
            .map_err(|e| format!("Failed to open {}: {}", relative_path, e))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }
        let hash = format!("{:x}", hasher.finalize());

        let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;

        files.push(FileEntry {
            path: relative_path,
            hash,
            size: metadata.len(),
        });
    }

    Ok(ProfileManifest { files })
}

struct AppState {
    app_handle: AppHandle,
    modpack_id: String,
}

async fn health_check() -> StatusCode {
    StatusCode::OK
}

async fn get_profile(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let instance_dir = match instance::get_instance_dir(&state.app_handle, &state.modpack_id) {
        Ok(dir) => dir,
        Err(_) => return (StatusCode::NOT_FOUND, "Instance not found").into_response(),
    };

    if !instance_dir.exists() {
        return (StatusCode::NOT_FOUND, "Profile directory not found").into_response();
    }

    let mut zip_buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut zip_buffer));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for entry in WalkDir::new(&instance_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let relative_path = match path.strip_prefix(&instance_dir) {
                Ok(p) => p.to_string_lossy().replace('\\', "/"),
                Err(_) => continue,
            };

            if should_exclude(&relative_path) {
                continue;
            }

            if let Ok(mut file) = std::fs::File::open(path) {
                if zip.start_file(&relative_path, options).is_ok() {
                    let mut buffer = Vec::new();
                    if file.read_to_end(&mut buffer).is_ok() {
                        let _ = zip.write_all(&buffer);
                    }
                }
            }
        }

        if let Err(e) = zip.finish() {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to create ZIP: {}", e),
            )
                .into_response();
        }
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"profile.zip\"",
        )
        .body(Body::from(zip_buffer))
        .unwrap()
}

async fn get_manifest(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let instance_dir = match instance::get_instance_dir(&state.app_handle, &state.modpack_id) {
        Ok(dir) => dir,
        Err(_) => return (StatusCode::NOT_FOUND, "Instance not found").into_response(),
    };

    if !instance_dir.exists() {
        return (StatusCode::NOT_FOUND, "Profile directory not found").into_response();
    }

    match generate_manifest(&instance_dir) {
        Ok(manifest) => Json(manifest).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to generate manifest: {}", e),
        )
            .into_response(),
    }
}

async fn get_file(
    State(state): State<Arc<AppState>>,
    Path(file_path): Path<String>,
) -> impl IntoResponse {
    let instance_dir = match instance::get_instance_dir(&state.app_handle, &state.modpack_id) {
        Ok(dir) => dir,
        Err(_) => return (StatusCode::NOT_FOUND, "Instance not found").into_response(),
    };

    let normalized_path = file_path.replace('\\', "/");
    if normalized_path.contains("..") {
        return (StatusCode::BAD_REQUEST, "Invalid path").into_response();
    }

    let full_path = instance_dir.join(&normalized_path);

    let canonical_instance = match instance_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Instance not found").into_response(),
    };
    let canonical_file = match full_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    if !canonical_file.starts_with(&canonical_instance) {
        return (StatusCode::BAD_REQUEST, "Invalid path").into_response();
    }

    if !full_path.is_file() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    match std::fs::read(&full_path) {
        Ok(contents) => {
            let filename = full_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header(
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}\"", filename),
                )
                .body(Body::from(contents))
                .unwrap()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response(),
    }
}

async fn get_modpack(State(state): State<Arc<AppState>>) -> Result<Json<Modpack>, StatusCode> {
    match storage::load_modpack(&state.app_handle, &state.modpack_id) {
        Ok(mut modpack) => {
            let game = games::get_game(&modpack.game_id);
            let is_thunderstore = game
                .as_ref()
                .map(|g| g.mod_source == "thunderstore")
                .unwrap_or(false);

            if is_thunderstore {
                if let Ok(instance_dir) =
                    instance::get_instance_dir(&state.app_handle, &state.modpack_id)
                {
                    if instance_dir.exists() {
                        if let Ok(mods) = thunderstore::profile::load_mods_yml(&instance_dir) {
                            let deprecated_set: std::collections::HashSet<String> =
                                if let Some(community) =
                                    game.as_ref().and_then(|g| g.thunderstore_community.as_deref())
                                {
                                    if let Ok(cache_dir) =
                                        state.app_handle.path().app_data_dir()
                                    {
                                        thunderstore::api::fetch_all_packages(
                                            community,
                                            &cache_dir,
                                        )
                                        .await
                                        .unwrap_or_default()
                                        .into_iter()
                                        .filter(|p| p.is_deprecated)
                                        .map(|p| p.full_name)
                                        .collect()
                                    } else {
                                        std::collections::HashSet::new()
                                    }
                                } else {
                                    std::collections::HashSet::new()
                                };

                            modpack.mods = mods
                                .into_iter()
                                .map(|m| ModpackMod {
                                    slug: m.name.clone(),
                                    title: m.display_name.clone(),
                                    version: m.version_number.to_string(),
                                    author: m.author_name.clone(),
                                    icon_url: m.icon.clone(),
                                    project_id: None,
                                    version_id: None,
                                    enabled: m.enabled,
                                    filename: None,
                                    is_loader: games::is_loader_package(&m.name),
                                    is_deprecated: deprecated_set.contains(&m.name),
                                })
                                .collect();
                        }
                    }
                }
            }

            Ok(Json(modpack))
        }
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

async fn get_sync_manifest(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let modpack = match storage::load_modpack(&state.app_handle, &state.modpack_id) {
        Ok(m) => m,
        Err(_) => return (StatusCode::NOT_FOUND, "Modpack not found").into_response(),
    };

    let instance_dir = match instance::get_instance_dir(&state.app_handle, &state.modpack_id) {
        Ok(dir) => dir,
        Err(_) => return (StatusCode::NOT_FOUND, "Instance not found").into_response(),
    };

    if !instance_dir.exists() {
        return (StatusCode::NOT_FOUND, "Profile directory not found").into_response();
    }

    let game = games::get_game(&modpack.game_id);
    let mod_source = game
        .as_ref()
        .map(|g| g.mod_source.clone())
        .unwrap_or_else(|| "unknown".to_string());
    let community = game.as_ref().and_then(|g| g.thunderstore_community.clone());

    let mut source_mods = Vec::new();
    if mod_source == "thunderstore" {
        if let Ok(mods) = thunderstore::profile::load_mods_yml(&instance_dir) {
            for m in mods {
                if games::is_loader_package(&m.name) {
                    continue;
                }
                source_mods.push(SourceMod {
                    identifier: m.name.clone(),
                    version: m.version_number.to_string(),
                    enabled: m.enabled,
                    version_id: None,
                    display_name: Some(m.display_name.clone()),
                    author: Some(m.author_name.clone()),
                    icon_url: m.icon.clone(),
                });
            }
        }
    }
    // TODO: Add Modrinth support - read from modpack.mods

    let mut p2p_files = Vec::new();
    let sync_patterns = vec!["BepInEx/config/", "BepInEx/plugins/", "config/", "mods.yml"];

    let mut cache = HASH_CACHE.write().await;

    for entry in WalkDir::new(&instance_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let relative_path = match path.strip_prefix(&instance_dir) {
            Ok(p) => p.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        if should_exclude(&relative_path) {
            continue;
        }

        let is_syncable = sync_patterns
            .iter()
            .any(|pattern| relative_path.starts_with(pattern) || relative_path == *pattern);

        if !is_syncable {
            continue;
        }

        let metadata = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);

        if let Some(cached) = cache.get(&relative_path) {
            if cached.mtime == mtime {
                p2p_files.push(P2PFile {
                    path: relative_path,
                    hash: cached.hash.clone(),
                    size: cached.size,
                });
                continue;
            }
        }

        let mut file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            hasher.update(&buffer[..bytes_read]);
        }
        let hash = format!("{:x}", hasher.finalize());

        cache.insert(
            relative_path.clone(),
            CachedFileHash {
                mtime,
                hash: hash.clone(),
                size: metadata.len(),
            },
        );

        p2p_files.push(P2PFile {
            path: relative_path,
            hash,
            size: metadata.len(),
        });
    }

    let manifest = SyncManifest {
        game_id: modpack.game_id,
        mod_source,
        community,
        source_mods,
        p2p_files,
    };

    Json(manifest).into_response()
}

pub async fn start_server(
    app_handle: AppHandle,
    modpack_id: String,
    port: u16,
) -> Result<(), String> {
    {
        let handle = SERVER_HANDLE.read().await;
        if handle.is_some() {
            return Err("Server is already running. Stop it first.".to_string());
        }
    }

    storage::load_modpack(&app_handle, &modpack_id)?;

    {
        let mut current_id = CURRENT_MODPACK_ID.write().await;
        *current_id = Some(modpack_id.clone());
    }

    let state = Arc::new(AppState {
        app_handle,
        modpack_id,
    });

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/modpack", get(get_modpack))
        .route("/profile", get(get_profile))
        .route("/manifest", get(get_manifest))
        .route("/sync-manifest", get(get_sync_manifest))
        .route("/files/*path", get(get_file))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind to port {}: {}", port, e))?;

    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("Server error: {}", e);
        }
    });

    {
        let mut server_handle = SERVER_HANDLE.write().await;
        *server_handle = Some(handle);
    }

    Ok(())
}

pub async fn stop_server() -> Result<(), String> {
    let mut handle = SERVER_HANDLE.write().await;

    if let Some(h) = handle.take() {
        h.abort();
        let mut current_id = CURRENT_MODPACK_ID.write().await;
        *current_id = None;
        Ok(())
    } else {
        Err("Server is not running".to_string())
    }
}

pub async fn is_server_running() -> bool {
    let handle = SERVER_HANDLE.read().await;
    handle.is_some()
}

pub async fn get_current_modpack_id() -> Option<String> {
    let current_id = CURRENT_MODPACK_ID.read().await;
    current_id.clone()
}
