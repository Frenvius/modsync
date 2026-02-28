use tauri::Window;
use tauri::Manager;

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

