pub mod catalog;
pub mod contracts;
mod instances;
mod persistence;
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
            settings::get_settings,
            settings::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
