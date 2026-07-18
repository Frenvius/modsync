use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;

use iroh::endpoint::presets;
use iroh::{Endpoint, EndpointAddr, PublicKey, RelayMap, RelayMode, RelayUrl, SecretKey};
use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{OnceCell, RwLock};
use tokio::task::JoinHandle;

pub const ALPN_SYNC: &[u8] = b"modsync/0";
pub const ALPN_MC: &[u8] = b"mc/0";

static ENDPOINT: OnceCell<Endpoint> = OnceCell::const_new();
static OWNER_ACCEPT: Lazy<RwLock<Option<JoinHandle<()>>>> = Lazy::new(|| RwLock::new(None));
static SYNC_FORWARDS: Lazy<RwLock<HashMap<String, u16>>> = Lazy::new(|| RwLock::new(HashMap::new()));
static MC_FORWARD: Lazy<RwLock<Option<(u16, JoinHandle<()>)>>> = Lazy::new(|| RwLock::new(None));

fn secret_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join("iroh_secret.key"))
}

fn load_or_create_secret(app: &AppHandle) -> Result<SecretKey, String> {
    let path = secret_path(app)?;
    if let Ok(bytes) = std::fs::read(&path) {
        if bytes.len() == 32 {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&bytes);
            return Ok(SecretKey::from_bytes(&arr));
        }
    }
    let secret = SecretKey::generate();
    std::fs::write(&path, secret.to_bytes()).map_err(|e| e.to_string())?;
    Ok(secret)
}

fn relay_mode(relay_url: Option<&str>) -> RelayMode {
    match relay_url {
        Some(url) if !url.trim().is_empty() => match RelayUrl::from_str(url.trim()) {
            Ok(parsed) => RelayMode::Custom(RelayMap::from(parsed)),
            Err(_) => RelayMode::Default,
        },
        _ => RelayMode::Default,
    }
}

async fn endpoint(app: &AppHandle) -> Result<Endpoint, String> {
    let ep = ENDPOINT
        .get_or_try_init(|| async {
            let secret = load_or_create_secret(app)?;
            let settings = crate::storage::load_settings(app).unwrap_or_default();
            Endpoint::builder(presets::N0)
                .secret_key(secret)
                .alpns(vec![ALPN_SYNC.to_vec(), ALPN_MC.to_vec()])
                .relay_mode(relay_mode(settings.relay_url.as_deref()))
                .bind()
                .await
                .map_err(|e| format!("Failed to bind iroh endpoint: {}", e))
        })
        .await?;
    Ok(ep.clone())
}

pub fn node_id(app: &AppHandle) -> Result<String, String> {
    Ok(load_or_create_secret(app)?.public().to_string())
}

async fn splice(
    tcp: TcpStream,
    mut send: iroh::endpoint::SendStream,
    mut recv: iroh::endpoint::RecvStream,
) {
    let (mut rd, mut wr) = tcp.into_split();
    tokio::select! {
        _ = tokio::io::copy(&mut rd, &mut send) => {}
        _ = tokio::io::copy(&mut recv, &mut wr) => {}
    }
    let _ = wr.shutdown().await;
}

pub async fn start_owner(app: AppHandle, sync_port: u16, mc_port: u16) -> Result<(), String> {
    let ep = endpoint(&app).await?;
    let mut guard = OWNER_ACCEPT.write().await;
    if guard.is_some() {
        return Ok(());
    }
    *guard = Some(tokio::spawn(owner_loop(ep, sync_port, mc_port)));
    Ok(())
}

pub async fn stop_owner() {
    if let Some(handle) = OWNER_ACCEPT.write().await.take() {
        handle.abort();
    }
}

async fn owner_loop(ep: Endpoint, sync_port: u16, mc_port: u16) {
    while let Some(incoming) = ep.accept().await {
        tokio::spawn(async move {
            let conn = match incoming.await {
                Ok(conn) => conn,
                Err(_) => return,
            };
            let alpn = conn.alpn();
            let target = if alpn == ALPN_SYNC {
                format!("127.0.0.1:{}", sync_port)
            } else if alpn == ALPN_MC {
                format!("127.0.0.1:{}", mc_port)
            } else {
                return;
            };
            loop {
                match conn.accept_bi().await {
                    Ok((send, recv)) => {
                        let target = target.clone();
                        tokio::spawn(async move {
                            if let Ok(tcp) = TcpStream::connect(&target).await {
                                splice(tcp, send, recv).await;
                            }
                        });
                    }
                    Err(_) => break,
                }
            }
        });
    }
}

async fn forward_loop(listener: TcpListener, ep: Endpoint, peer: PublicKey, alpn: &'static [u8]) {
    loop {
        let tcp = match listener.accept().await {
            Ok((tcp, _)) => tcp,
            Err(_) => break,
        };
        let ep = ep.clone();
        tokio::spawn(async move {
            let conn = match ep.connect(EndpointAddr::from(peer), alpn).await {
                Ok(conn) => conn,
                Err(_) => return,
            };
            if let Ok((send, recv)) = conn.open_bi().await {
                splice(tcp, send, recv).await;
            }
        });
    }
}

pub async fn ensure_sync_forward(app: &AppHandle, node_id: &str) -> Result<String, String> {
    if let Some(port) = SYNC_FORWARDS.read().await.get(node_id).copied() {
        return Ok(format!("127.0.0.1:{}", port));
    }
    let peer = PublicKey::from_str(node_id).map_err(|e| format!("Invalid node id: {}", e))?;
    let ep = endpoint(app).await?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    tokio::spawn(forward_loop(listener, ep, peer, ALPN_SYNC));
    SYNC_FORWARDS
        .write()
        .await
        .insert(node_id.to_string(), port);
    Ok(format!("127.0.0.1:{}", port))
}

pub async fn resolve_http_host(app: &AppHandle, owner_address: &str) -> Result<String, String> {
    if owner_address.contains(':') {
        Ok(owner_address.to_string())
    } else {
        ensure_sync_forward(app, owner_address).await
    }
}

pub async fn start_mc_forward(app: &AppHandle, node_id: &str) -> Result<u16, String> {
    if let Some((port, _)) = MC_FORWARD.read().await.as_ref() {
        return Ok(*port);
    }
    let peer = PublicKey::from_str(node_id).map_err(|e| format!("Invalid node id: {}", e))?;
    let ep = endpoint(app).await?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let handle = tokio::spawn(forward_loop(listener, ep, peer, ALPN_MC));
    *MC_FORWARD.write().await = Some((port, handle));
    Ok(port)
}

pub async fn stop_mc_forward() {
    if let Some((_, handle)) = MC_FORWARD.write().await.take() {
        handle.abort();
    }
}
