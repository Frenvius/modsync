use std::fs;
use tauri::Window;
use tauri::Manager;

#[tauri::command]
pub async fn set_log(message: String, window: Window) {
    window.emit("set_log", message).unwrap();
}

#[tauri::command]
pub async fn play_locked(message: bool, window: Window) {
    window.emit("play_locked", message).unwrap();
}

#[tauri::command]
pub async fn play_text(message: String, window: Window) {
    window.emit("play_text", message).unwrap();
}

#[tauri::command]
pub async fn sync_progress(message: u32, window: Window) {
    window.emit("sync_progress", message).unwrap();
}

#[tauri::command]
pub async fn is_installed(message: bool, window: Window) {
    window.emit("is_installed", message).unwrap();
}

#[tauri::command]
pub async fn needs_update(message: bool, window: Window) {
    window.emit("needs_update", message).unwrap();
}

#[tauri::command]
pub async fn progress_type(message: String, window: Window) {
    window.emit("progress_type", message).unwrap();
}

#[tauri::command]
pub async fn status_text(message: String, window: Window) {
    window.emit("status_text", message).unwrap();
}

#[tauri::command]
pub async fn uninstall() -> Result<String, String> {
    let path = dirs::data_dir().unwrap().join("Valheim Mod Updater").join("updater");
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove directory: {}", e.to_string()))?;
        Ok("Directory removed successfully".to_string())
    } else {
        Ok(format!("Directory does not exist: {:?}", path))
    }
}