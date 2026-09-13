pub mod catalog;
mod content;
pub mod contracts;
mod downloads;
mod instances;
mod persistence;
mod providers;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
            .bind_address("127.0.0.1")
            .base_port(9823)
            .build(),
    );

    builder
        .invoke_handler(tauri::generate_handler![
            catalog::get_catalog,
            instances::list_instances,
            instances::create_instance,
            instances::import_instance,
            instances::update_instance,
            instances::duplicate_instance,
            instances::delete_instance,
            content::preview_install,
            content::install_content,
            content::repair_content,
            content::refresh_content,
            content::remove_content,
            content::set_content_enabled,
            content::list_unmanaged_content,
            content::import_local_content,
            downloads::cancel_operation,
            providers::search_provider,
            providers::get_provider_project,
            providers::get_provider_versions,
            providers::get_provider_categories,
            settings::get_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
