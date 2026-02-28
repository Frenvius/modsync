use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tauri::{Manager, Window};

use crate::modpack::{compare_modpacks, scan_bepinex_directory, ModEntry, Modpack};
use crate::server::{ServerStatus, StatusResponse};

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareCode {
    pub host: String,
    pub port: u16,
    pub modpack_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncProgress {
    pub current: u32,
    pub total: u32,
    pub current_file: String,
    pub phase: String,
}

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub mods_downloaded: u32,
    pub mods_removed: u32,
    pub configs_downloaded: u32,
    pub configs_removed: u32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SyncStatus {
    Host,
    Synced,
    OutOfSync,
    HostOffline,
    NotConnected,
}

pub fn generate_share_code(host: &str, port: u16, modpack_id: &str) -> String {
    let share_code = ShareCode {
        host: host.to_string(),
        port,
        modpack_id: modpack_id.to_string(),
    };

    let json = serde_json::to_string(&share_code).unwrap();
    BASE64.encode(json.as_bytes())
}

pub fn decode_share_code(code: &str) -> Result<ShareCode, String> {
    let decoded = BASE64
        .decode(code.trim())
        .map_err(|e| format!("Invalid share code: {}", e))?;

    let json = String::from_utf8(decoded).map_err(|e| format!("Invalid share code encoding: {}", e))?;

    serde_json::from_str(&json).map_err(|e| format!("Invalid share code format: {}", e))
}

pub async fn check_host_online(host: &str, port: u16) -> bool {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let url = format!("http://{}:{}/health", host, port);

    match client.get(&url).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

pub async fn fetch_modpack(host: &str, port: u16) -> Result<Modpack, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("http://{}:{}/modpack", host, port);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to host: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Host returned error: {}", response.status()));
    }

    let status_response: StatusResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    match status_response.status {
        ServerStatus::Ready => status_response
            .modpack
            .ok_or_else(|| "Host has no modpack loaded".to_string()),
        ServerStatus::Preparing => Err("Host is still preparing modpack, try again in a moment".to_string()),
        ServerStatus::Error(e) => Err(format!("Host error: {}", e)),
    }
}

pub async fn download_file_from_host(
    client: &Client,
    host: &str,
    port: u16,
    remote_path: &str,
    local_path: &Path,
) -> Result<(), String> {
    let url = format!("http://{}:{}/files/{}", host, port, remote_path);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", remote_path, e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to download {}: HTTP {}", remote_path, response.status()));
    }

    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let mut file = File::create(local_path).map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

pub async fn download_from_thunderstore(
    client: &Client,
    thunderstore_id: &str,
    version: &str,
    target_dir: &Path,
    _mod_entry: &ModEntry,
) -> Result<(), String> {
    let parts: Vec<&str> = thunderstore_id.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid Thunderstore ID format: {}", thunderstore_id));
    }

    let author = parts[0];
    let mod_name = parts[1];

    let url = format!(
        "https://thunderstore.io/package/download/{}/{}/{}/",
        author, mod_name, version
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download from Thunderstore: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Thunderstore returned error for {}: {}",
            thunderstore_id,
            response.status()
        ));
    }

    let zip_path = target_dir.join(format!("{}.zip", mod_name));
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read Thunderstore response: {}", e))?;

    fs::write(&zip_path, &bytes).map_err(|e| format!("Failed to save zip file: {}", e))?;

    let file = File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;

    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => target_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).ok();
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p).ok();
            }
            let mut outfile =
                File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    fs::remove_file(&zip_path).ok();

    Ok(())
}

pub async fn sync_with_host(
    host: &str,
    port: u16,
    local_bepinex_path: &Path,
    modpack_name: &str,
    modpack_id: &str,
    window: Option<&Window>,
) -> Result<SyncResult, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let emit_progress = |current: u32, total: u32, file: &str, phase: &str| {
        if let Some(w) = window {
            let progress = SyncProgress {
                current,
                total,
                current_file: file.to_string(),
                phase: phase.to_string(),
            };
            w.emit("sync_progress", progress).ok();
        }
    };

    emit_progress(0, 1, "", "Fetching modpack info");
    let remote_modpack = fetch_modpack(host, port).await?;

    emit_progress(0, 1, "", "Scanning local mods");
    let local_modpack = scan_bepinex_directory(local_bepinex_path, modpack_name, modpack_id)
        .unwrap_or_else(|_| Modpack {
            id: modpack_id.to_string(),
            name: modpack_name.to_string(),
            mods: vec![],
            configs: vec![],
            updated_at: String::new(),
        });

    let diff = compare_modpacks(&local_modpack, &remote_modpack);

    let total_operations = diff.mods_to_download.len()
        + diff.mods_to_remove.len()
        + diff.configs_to_download.len()
        + diff.configs_to_remove.len();

    let mut current_op = 0u32;
    let mut mods_downloaded = 0u32;
    let mut mods_removed = 0u32;
    let mut configs_downloaded = 0u32;
    let mut configs_removed = 0u32;

    let plugins_path = local_bepinex_path.join("plugins");
    let config_path = local_bepinex_path.join("config");

    fs::create_dir_all(&plugins_path).ok();
    fs::create_dir_all(&config_path).ok();

    for mod_path in &diff.mods_to_remove {
        current_op += 1;
        emit_progress(current_op, total_operations as u32, mod_path, "Removing old mods");

        let full_path = plugins_path.join(mod_path);
        if full_path.exists() {
            fs::remove_file(&full_path).ok();
            mods_removed += 1;
        }
    }

    for mod_entry in &diff.mods_to_download {
        current_op += 1;
        emit_progress(
            current_op,
            total_operations as u32,
            &mod_entry.filename,
            "Downloading mods",
        );

        let local_path = plugins_path.join(&mod_entry.path);

        if mod_entry.is_custom || mod_entry.thunderstore_id.is_none() {
            let remote_path = format!("plugins/{}", mod_entry.path);
            download_file_from_host(&client, host, port, &remote_path, &local_path).await?;
        } else {
            let thunderstore_result = if let (Some(ts_id), Some(ts_version)) =
                (&mod_entry.thunderstore_id, &mod_entry.thunderstore_version)
            {
                let parent = local_path.parent().unwrap_or(&plugins_path);
                download_from_thunderstore(&client, ts_id, ts_version, parent, mod_entry).await
            } else {
                Err("No Thunderstore info".to_string())
            };

            if thunderstore_result.is_err() {
                let remote_path = format!("plugins/{}", mod_entry.path);
                download_file_from_host(&client, host, port, &remote_path, &local_path).await?;
            }
        }

        mods_downloaded += 1;
    }

    for config_path_str in &diff.configs_to_remove {
        current_op += 1;
        emit_progress(
            current_op,
            total_operations as u32,
            config_path_str,
            "Removing old configs",
        );

        let full_path = config_path.join(config_path_str);
        if full_path.exists() {
            fs::remove_file(&full_path).ok();
            configs_removed += 1;
        }
    }

    for config_entry in &diff.configs_to_download {
        current_op += 1;
        emit_progress(
            current_op,
            total_operations as u32,
            &config_entry.path,
            "Downloading configs",
        );

        let local_path = config_path.join(&config_entry.path);
        let remote_path = format!("config/{}", config_entry.path);

        download_file_from_host(&client, host, port, &remote_path, &local_path).await?;
        configs_downloaded += 1;
    }

    emit_progress(total_operations as u32, total_operations as u32, "", "Complete");

    Ok(SyncResult {
        success: true,
        mods_downloaded,
        mods_removed,
        configs_downloaded,
        configs_removed,
        message: format!(
            "Sync complete: {} mods downloaded, {} removed, {} configs downloaded, {} removed",
            mods_downloaded, mods_removed, configs_downloaded, configs_removed
        ),
    })
}

pub async fn get_sync_status(
    host: &str,
    port: u16,
    local_bepinex_path: &Path,
    modpack_name: &str,
    modpack_id: &str,
) -> SyncStatus {
    if !check_host_online(host, port).await {
        return SyncStatus::HostOffline;
    }

    let remote_modpack = match fetch_modpack(host, port).await {
        Ok(m) => m,
        Err(_) => return SyncStatus::HostOffline,
    };

    let local_modpack = match scan_bepinex_directory(local_bepinex_path, modpack_name, modpack_id) {
        Ok(m) => m,
        Err(_) => return SyncStatus::OutOfSync,
    };

    let diff = compare_modpacks(&local_modpack, &remote_modpack);

    if diff.mods_to_download.is_empty()
        && diff.mods_to_remove.is_empty()
        && diff.configs_to_download.is_empty()
        && diff.configs_to_remove.is_empty()
    {
        SyncStatus::Synced
    } else {
        SyncStatus::OutOfSync
    }
}
