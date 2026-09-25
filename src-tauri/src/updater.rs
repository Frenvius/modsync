use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub fn check_on_startup(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = check_and_install(&app).await {
            eprintln!("update check failed: {error}");
        }
    });
}

async fn check_and_install(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };

    let accepted = app
        .dialog()
        .message(format!(
            "ModSync {} is available. You are running {}.",
            update.version, update.current_version
        ))
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Update now".into(),
            "Later".into(),
        ))
        .blocking_show();
    if !accepted {
        return Ok(());
    }

    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}
