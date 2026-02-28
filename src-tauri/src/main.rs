// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use html_parser::Dom;
use std::fs::{self, File};
use std::io::Write;
use sysinfo::System;
use tauri::{AppHandle, Manager, Window};

mod config;
mod modpack;
mod profile;
mod server;
mod sync;
mod utilities;

use modpack::{scan_bepinex_directory, scan_bepinex_directory_with_progress, Modpack};
use server::ServerStatus;
use sync::{
    check_host_online, decode_share_code, generate_share_code, get_sync_status,
    sync_with_host, ShareCode, SyncResult, SyncStatus,
};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_initial_data,
            run_game_windows,
            parse,
            sys_user_name,
            config::get_config,
            config::set_config,
            config::config_folder,
            config::get_config_data,
            config::reset_config_file,
            utilities::set_log,
            utilities::uninstall,
            utilities::play_locked,
            utilities::play_text,
            utilities::sync_progress,
            utilities::is_installed,
            utilities::needs_update,
            utilities::progress_type,
            utilities::status_text,
            profile::discover_tmm_profiles,
            profile::get_tmm_bepinex_path,
            profile::create_tmm_profile,
            start_sharing,
            stop_sharing,
            get_share_code,
            decode_share_code_cmd,
            scan_local_mods,
            is_hosting,
            sync_mods,
            check_host_online_cmd,
            get_sync_status_cmd,
            get_mods_path,
            detect_valheim_path,
            is_valid_valheim_path,
            join_modpack,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    dirs::data_dir()
        .map(|d| d.join("Valheim Mod Updater"))
        .ok_or("Could not find AppData directory".to_string())
}

fn get_config_path() -> Result<std::path::PathBuf, String> {
    Ok(get_app_data_dir()?.join("mod_updater_data.json"))
}

fn read_config() -> Result<serde_json::Value, String> {
    let path = get_config_path()?;
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
}

fn get_active_tmm_profile_name() -> Result<String, String> {
    let config = read_config()?;
    config
        .get("activeTmmProfile")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or("No active TMM profile set".to_string())
}

fn get_active_bepinex_path() -> Result<String, String> {
    let profile_name = get_active_tmm_profile_name()?;
    profile::get_tmm_bepinex_path(profile_name)
}

fn find_bepinex_preloader(bepinex_path: &str) -> Result<String, String> {
    let core_path = std::path::Path::new(bepinex_path).join("core");

    let preloader_names = [
        "BepInEx.Unity.Mono.Preloader.dll",
        "BepInEx.Unity.IL2CPP.dll",
        "BepInEx.Preloader.dll",
        "BepInEx.IL2CPP.dll",
    ];

    for name in preloader_names {
        let preloader_path = core_path.join(name);
        if preloader_path.exists() {
            return Ok(preloader_path.to_string_lossy().to_string());
        }
    }

    Err(format!(
        "No BepInEx preloader found in {}",
        core_path.display()
    ))
}

#[tauri::command]
fn get_initial_data() -> Result<String, String> {
    let app_data_dir = dirs::data_dir().ok_or("Could not find AppData directory")?;
    let dir_path = app_data_dir.join("Valheim Mod Updater");
    let file_path = dir_path.join("mod_updater_data.json");

    match fs::create_dir_all(&dir_path) {
        Ok(_) => (),
        Err(e) => return Err(e.to_string()),
    }

    let config_exists = file_path.exists();

    if !config_exists {
        let default_config = serde_json::json!({
            "valheimPath": "",
            "hostPort": 7878,
            "activeTmmProfile": null
        });

        let default_data = serde_json::to_string(&default_config).unwrap();
        File::create(&file_path)
            .and_then(|mut file| file.write_all(default_data.as_bytes()))
            .map_err(|e| e.to_string())?;
    }

    let config_data = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_data).map_err(|e| e.to_string())?;

    let tmm_profiles = profile::discover_tmm_profiles().unwrap_or_default();
    config["tmmProfiles"] = serde_json::to_value(&tmm_profiles).unwrap_or(serde_json::Value::Array(vec![]));

    let active_profile_name = config.get("activeTmmProfile").and_then(|v| v.as_str());
    let has_valid_profile = active_profile_name
        .and_then(|name| tmm_profiles.iter().find(|p| p.name == name))
        .map(|p| p.has_mods)
        .unwrap_or(false);
    let valheim_path = config.get("valheimPath").and_then(|v| v.as_str()).unwrap_or("");
    config["installed"] = serde_json::Value::Bool(has_valid_profile && !valheim_path.is_empty());

    if config.get("activeTmmProfile").map(|v| v.is_null()).unwrap_or(true) && !tmm_profiles.is_empty() {
        config["activeTmmProfile"] = serde_json::Value::String(tmm_profiles[0].name.clone());

        let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        let mut file = File::create(&file_path).map_err(|e| e.to_string())?;
        file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    }

    Ok(serde_json::to_string(&config).unwrap())
}

fn get_steam_process_path() -> Option<String> {
    let mut system = System::new_all();
    system.refresh_all();

    for (_pid, process) in system.processes() {
        if process.name().to_lowercase() == "steam.exe" {
            return Some(process.exe()?.to_str().unwrap().to_string());
        }
    }

    None
}

#[cfg(target_os = "windows")]
#[tauri::command]
async fn run_game_windows() -> Result<(), String> {
    let steam_path = get_steam_process_path().ok_or("Steam is not running")?;

    let bepinex_path = get_active_bepinex_path()?;

    let preloader_path = find_bepinex_preloader(&bepinex_path)?;

    let child = std::process::Command::new(steam_path)
        .arg("-applaunch")
        .arg("892970")
        .arg("--doorstop-enabled")
        .arg("true")
        .arg("--doorstop-target-assembly")
        .arg(&preloader_path)
        .spawn();

    match child {
        Ok(child) => {
            let _output = child
                .wait_with_output()
                .map_err(|e| format!("Failed to wait on process: {}", e))?;
            Ok(())
        }
        Err(e) => Err(format!("Failed to start process: {}", e)),
    }
}

#[tauri::command]
async fn parse(value: &str) -> Result<String, Error> {
    let result = Dom::parse(value)?.to_json_pretty()?;
    Ok(result)
}

#[tauri::command]
async fn sys_user_name() -> Result<String, Error> {
    let user_name = whoami::username();
    Ok(user_name)
}

#[tauri::command]
async fn get_mods_path() -> Result<String, String> {
    let bepinex_path = get_active_bepinex_path()?;
    let path = std::path::Path::new(&bepinex_path);
    let parent = path
        .parent()
        .ok_or("Could not get profile directory")?
        .to_string_lossy()
        .to_string();
    Ok(parent)
}

#[tauri::command]
fn is_valid_valheim_path(path: String) -> bool {
    let valheim_dir = std::path::Path::new(&path);
    valheim_dir.join("valheim.exe").exists()
}

#[tauri::command]
fn detect_valheim_path() -> Option<String> {
    let steam_exe_path = get_steam_process_path()?;

    let steam_dir = std::path::Path::new(&steam_exe_path).parent()?;

    let valheim_path = steam_dir.join("steamapps").join("common").join("Valheim");

    if is_valid_valheim_path(valheim_path.to_string_lossy().to_string()) {
        Some(valheim_path.to_string_lossy().to_string())
    } else {
        None
    }
}

#[tauri::command]
async fn start_sharing(
    port: u16,
    modpack_name: String,
    modpack_id: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    let bepinex_path_str = get_active_bepinex_path()?;
    let bepinex_path = std::path::PathBuf::from(&bepinex_path_str);
    let mods_path = bepinex_path.clone();

    if !bepinex_path.exists() {
        return Err(format!(
            "BepInEx directory not found at: {}. Please ensure the TMM profile has mods deployed.",
            bepinex_path.display()
        ));
    }

    server::set_server_status(ServerStatus::Preparing).await;
    server::set_mods_path(mods_path.clone()).await;

    server::start_server(port).await?;

    tokio::spawn(async move {
        match scan_bepinex_directory_with_progress(&bepinex_path, &modpack_name, &modpack_id, &app_handle) {
            Ok(modpack) => {
                server::set_modpack(modpack, mods_path).await;
                let _ = app_handle.emit("server-ready", ());
            }
            Err(e) => {
                server::set_server_status(ServerStatus::Error(e.clone())).await;
                let _ = app_handle.emit("server-error", e);
            }
        }
    });

    Ok(format!("Server started on port {}", port))
}

#[tauri::command]
async fn stop_sharing() -> Result<(), String> {
    server::stop_server().await
}

#[tauri::command]
fn get_share_code(host: String, port: u16, modpack_id: String) -> String {
    generate_share_code(&host, port, &modpack_id)
}

#[tauri::command]
fn decode_share_code_cmd(code: String) -> Result<ShareCode, String> {
    decode_share_code(&code)
}

#[tauri::command]
async fn scan_local_mods(modpack_name: String, modpack_id: String) -> Result<Modpack, String> {
    let bepinex_path_str = get_active_bepinex_path()?;
    let bepinex_path = std::path::PathBuf::from(&bepinex_path_str);

    if !bepinex_path.exists() {
        return Err("BepInEx directory not found".to_string());
    }

    scan_bepinex_directory(&bepinex_path, &modpack_name, &modpack_id)
}

#[tauri::command]
async fn is_hosting() -> bool {
    server::is_server_running().await
}

#[tauri::command]
async fn sync_mods(
    host: String,
    port: u16,
    modpack_name: String,
    modpack_id: String,
    window: Window,
) -> Result<SyncResult, String> {
    let bepinex_path_str = get_active_bepinex_path()?;
    let bepinex_path = std::path::PathBuf::from(&bepinex_path_str);

    fs::create_dir_all(&bepinex_path).map_err(|e| format!("Failed to create BepInEx directory: {}", e))?;

    sync_with_host(
        &host,
        port,
        &bepinex_path,
        &modpack_name,
        &modpack_id,
        Some(&window),
    )
    .await
}

#[tauri::command]
async fn check_host_online_cmd(host: String, port: u16) -> bool {
    check_host_online(&host, port).await
}

#[tauri::command]
async fn join_modpack(share_code: String) -> Result<Modpack, String> {
    let code_info = decode_share_code(&share_code)?;
    sync::fetch_modpack(&code_info.host, code_info.port).await
}

#[tauri::command]
async fn get_sync_status_cmd(
    host: String,
    port: u16,
    modpack_name: String,
    modpack_id: String,
) -> SyncStatus {
    let bepinex_path_str = match get_active_bepinex_path() {
        Ok(path) => path,
        Err(_) => return SyncStatus::NotConnected,
    };
    let bepinex_path = std::path::PathBuf::from(&bepinex_path_str);

    get_sync_status(&host, port, &bepinex_path, &modpack_name, &modpack_id).await
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error("IO error")]
    Io(#[from] std::io::Error),
    #[error("JSON error")]
    Json(#[from] serde_json::Error),
    #[error("HTML error")]
    Html(#[from] html_parser::Error),
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        Ok(match self {
            Error::Io(e) => serializer.serialize_str(&format!("IO error: {}", e)),
            Error::Json(e) => serializer.serialize_str(&format!("JSON error: {}", e)),
            Error::Html(..) => serializer.serialize_str(&format!("HTML error: {}", self.to_string())),
        }
        .expect("Serialization failed"))
    }
}
