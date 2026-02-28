use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::get,
    Router,
};
use once_cell::sync::Lazy;
use serde::Serialize;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

use crate::modpack::Modpack;

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Preparing,
    Ready,
    Error(String),
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct StatusResponse {
    pub status: ServerStatus,
    pub modpack: Option<Modpack>,
}

pub struct ServerState {
    pub modpack: Option<Modpack>,
    pub mods_path: PathBuf,
    pub shutdown_signal: Option<tokio::sync::oneshot::Sender<()>>,
    pub status: ServerStatus,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            modpack: None,
            mods_path: PathBuf::new(),
            shutdown_signal: None,
            status: ServerStatus::Preparing,
        }
    }
}

pub static SERVER_STATE: Lazy<Arc<RwLock<ServerState>>> =
    Lazy::new(|| Arc::new(RwLock::new(ServerState::new())));

pub static IS_HOSTING: Lazy<Arc<RwLock<bool>>> = Lazy::new(|| Arc::new(RwLock::new(false)));

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

async fn get_modpack(State(state): State<Arc<RwLock<ServerState>>>) -> impl IntoResponse {
    let state = state.read().await;
    let response = StatusResponse {
        status: state.status.clone(),
        modpack: state.modpack.clone(),
    };
    Json(response).into_response()
}

async fn get_file(
    State(state): State<Arc<RwLock<ServerState>>>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let state = state.read().await;
    let file_path = state.mods_path.join(&path);

    let canonical_mods = match state.mods_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Server error").into_response(),
    };

    let canonical_file = match file_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    if !canonical_file.starts_with(&canonical_mods) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    let mut file = match File::open(&canonical_file).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let mut contents = Vec::new();
    if let Err(_) = file.read_to_end(&mut contents).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read file").into_response();
    }

    let content_type = match canonical_file.extension().and_then(|e| e.to_str()) {
        Some("dll") => "application/octet-stream",
        Some("cfg") => "text/plain",
        Some("json") => "application/json",
        Some("txt") => "text/plain",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    };

    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, content_type)],
        contents,
    )
        .into_response()
}

fn create_router(state: Arc<RwLock<ServerState>>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health))
        .route("/modpack", get(get_modpack))
        .route("/files/*path", get(get_file))
        .layer(cors)
        .with_state(state)
}

pub async fn start_server(port: u16) -> Result<(), String> {
    {
        let is_hosting = IS_HOSTING.read().await;
        if *is_hosting {
            return Err("Server is already running".to_string());
        }
    }

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let state = SERVER_STATE.clone();
    let router = create_router(state.clone());

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut state = state.write().await;
        state.shutdown_signal = Some(shutdown_tx);
    }

    {
        let mut is_hosting = IS_HOSTING.write().await;
        *is_hosting = true;
    }

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind to port {}: {}", port, e))?;

    println!("Server listening on http://{}", addr);

    tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                shutdown_rx.await.ok();
            })
            .await
            .ok();

        let mut is_hosting = IS_HOSTING.write().await;
        *is_hosting = false;
    });

    Ok(())
}

pub async fn stop_server() -> Result<(), String> {
    let mut state = SERVER_STATE.write().await;

    if let Some(shutdown_signal) = state.shutdown_signal.take() {
        shutdown_signal
            .send(())
            .map_err(|_| "Failed to send shutdown signal".to_string())?;
    }

    {
        let mut is_hosting = IS_HOSTING.write().await;
        *is_hosting = false;
    }

    Ok(())
}

pub async fn is_server_running() -> bool {
    let is_hosting = IS_HOSTING.read().await;
    *is_hosting
}

pub async fn set_modpack(modpack: Modpack, mods_path: PathBuf) {
    let mut state = SERVER_STATE.write().await;
    state.modpack = Some(modpack);
    state.mods_path = mods_path;
    state.status = ServerStatus::Ready;
}

pub async fn set_server_status(status: ServerStatus) {
    let mut state = SERVER_STATE.write().await;
    state.status = status;
}

pub async fn get_server_status() -> ServerStatus {
    let state = SERVER_STATE.read().await;
    state.status.clone()
}

pub async fn set_mods_path(mods_path: PathBuf) {
    let mut state = SERVER_STATE.write().await;
    state.mods_path = mods_path;
}
