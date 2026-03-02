// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use html_parser::Dom;
use std::fs::{self, File};
use std::io::Write;
use sysinfo::System;
use tauri::{AppHandle, Manager, Window};

mod cache;
mod config;
mod config_editor;
mod game;
mod modpack;
mod profile;
mod server;
mod sync;
mod thunderstore;
mod util;
mod utilities;

#[allow(unused_imports)]
use util::{AppError, AppResult, IoResultExt, OptionExt};

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
            utilities::play_locked,
            utilities::play_text,
            utilities::sync_progress,
            utilities::is_installed,
            utilities::needs_update,
            utilities::progress_type,
            utilities::status_text,
            profile::create_profile,
            profile::get_profiles,
            profile::get_profile,
            profile::delete_profile,
            profile::rename_profile,
            profile::duplicate_profile,
            profile::set_active_profile,
            profile::get_active_profile,
            profile::get_active_bepinex_path,
            profile::get_profile_mods_fast,
            profile::update_profile_mods_yml,
            profile::set_mod_enabled,
            profile::preview_r2z,
            profile::import_r2z,
            profile::check_profile_updates,
            profile::update_mod,
            profile::update_all_mods,
            profile::discover_tmm_profiles_for_import,
            profile::import_from_tmm,
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
            detect_game_path,
            is_valid_game_path,
            join_modpack,
            cache::get_cache_stats_cmd,
            cache::clear_cache_cmd,
            cache::clear_unused_cache_cmd,
            thunderstore::thunderstore_search,
            thunderstore::thunderstore_get_package,
            thunderstore::thunderstore_get_packages_bulk,
            thunderstore::thunderstore_get_categories,
            thunderstore::thunderstore_refresh_cache,
            thunderstore::thunderstore_install_package,
            thunderstore::thunderstore_get_games,
            thunderstore::thunderstore_get_package_readme,
            thunderstore::thunderstore_get_package_changelog,
            config_editor::get_config_files,
            config_editor::get_profile_config_files,
            config_editor::parse_config_file,
            config_editor::set_config_entry,
            config_editor::reset_config_entry,
            config_editor::get_config_summaries,
            game::get_games,
            game::get_game,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_app_data_dir() -> Result<std::path::PathBuf, String> {
    dirs::data_dir()
        .map(|d| d.join("Mod Updater"))
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

fn get_default_game_id() -> String {
    game::get_supported_games()
        .into_iter()
        .next()
        .map(|g| g.id)
        .unwrap_or_default()
}

fn get_active_game_id() -> Result<String, String> {
    let default = get_default_game_id();
    let config = read_config()?;
    Ok(config
        .get("activeGame")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or(default))
}

fn get_active_bepinex_path_internal() -> Result<String, String> {
    let game_id = get_active_game_id().unwrap_or_else(|_| get_default_game_id());

    if let Ok(manager) = profile::ProfileManager::new() {
        if let Ok(Some(profile)) = manager.get_active_profile(&game_id) {
            let bepinex_path = profile.path.join("BepInEx");
            return Ok(bepinex_path.to_string_lossy().to_string());
        }
    }

    Err("No active profile set".to_string())
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
    let dir_path = app_data_dir.join("Mod Updater");
    let file_path = dir_path.join("mod_updater_data.json");

    match fs::create_dir_all(&dir_path) {
        Ok(_) => (),
        Err(e) => return Err(e.to_string()),
    }

    let config_exists = file_path.exists();

    if !config_exists {
        let default_config = serde_json::json!({
            "gamePath": "",
            "hostPort": 7878,
            "activeProfileId": null
        });

        let default_data = serde_json::to_string(&default_config).unwrap();
        File::create(&file_path)
            .and_then(|mut file| file.write_all(default_data.as_bytes()))
            .map_err(|e| e.to_string())?;
    }

    let config_data = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let mut config: serde_json::Value =
        serde_json::from_str(&config_data).map_err(|e| e.to_string())?;

    let default_game = game::get_supported_games().into_iter().next().map(|g| g.id).unwrap_or_default();
    let active_game_id = config.get("activeGame")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or(default_game);
    let has_active_native_profile = if let Ok(manager) = profile::ProfileManager::new() {
        manager.get_active_profile(&active_game_id)
            .ok()
            .flatten()
            .map(|p| !p.mods.is_empty())
            .unwrap_or(false)
    } else {
        false
    };
    let game_path = config.get("gamePath").and_then(|v| v.as_str()).unwrap_or("");
    config["installed"] = serde_json::Value::Bool(has_active_native_profile && !game_path.is_empty());

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

    let bepinex_path = get_active_bepinex_path_internal()?;

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
    let bepinex_path = get_active_bepinex_path_internal()?;
    let path = std::path::Path::new(&bepinex_path);
    let parent = path
        .parent()
        .ok_or("Could not get profile directory")?
        .to_string_lossy()
        .to_string();
    Ok(parent)
}

#[tauri::command]
fn is_valid_game_path(path: String, game_id: String) -> bool {
    game::get_game_by_id(&game_id)
        .map(|g| std::path::Path::new(&path).join(&g.exe_name).exists())
        .unwrap_or(false)
}

#[tauri::command]
fn detect_game_path(game_id: String) -> Option<String> {
    let game = game::get_game_by_id(&game_id)?;
    let steam_exe_path = get_steam_process_path()?;
    let steam_dir = std::path::Path::new(&steam_exe_path).parent()?;
    let game_path = steam_dir.join("steamapps").join("common").join(&game.name);
    let path_str = game_path.to_string_lossy().to_string();
    if is_valid_game_path(path_str.clone(), game_id) {
        Some(path_str)
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
    let bepinex_path_str = get_active_bepinex_path_internal()?;
    let bepinex_path = std::path::PathBuf::from(&bepinex_path_str);
    let mods_path = bepinex_path.clone();

    if !bepinex_path.exists() {
        return Err(format!(
            "BepInEx directory not found at: {}. Please ensure the active profile has mods deployed.",
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
    let bepinex_path_str = get_active_bepinex_path_internal()?;
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
    let bepinex_path_str = get_active_bepinex_path_internal()?;
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
    let bepinex_path_str = match get_active_bepinex_path_internal() {
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
