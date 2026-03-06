use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::AppHandle;

use crate::storage;
use crate::modpack::Modpack;

static SERVER_HANDLE: RwLock<Option<tokio::task::JoinHandle<()>>> = RwLock::const_new(None);
static CURRENT_MODPACK_ID: RwLock<Option<String>> = RwLock::const_new(None);

struct AppState {
    app_handle: AppHandle,
    modpack_id: String,
}

async fn health_check() -> StatusCode {
    StatusCode::OK
}

async fn get_modpack(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Modpack>, StatusCode> {
    match storage::load_modpack(&state.app_handle, &state.modpack_id) {
        Ok(modpack) => Ok(Json(modpack)),
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn start_server(app_handle: AppHandle, modpack_id: String, port: u16) -> Result<(), String> {
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
