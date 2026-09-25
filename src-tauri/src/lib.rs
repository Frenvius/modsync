pub mod catalog;
mod configuration;
mod content;
pub mod contracts;
mod downloads;
mod instances;
mod launch;
mod persistence;
mod providers;
mod settings;
mod sharing;

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
            instances::open_instance_folder,
            launch::launch_instance,
            launch::list_java_runtimes,
            launch::list_process_logs,
            launch::logs_directory,
            configuration::list_config_files,
            configuration::read_config_file,
            configuration::write_config_file,
            configuration::config_directory,
            content::preview_install,
            content::preview_update,
            content::install_content,
            content::update_content,
            content::update_all_content,
            content::check_content_updates,
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
            settings::save_settings,
            sharing::start_sharing,
            sharing::stop_sharing,
            sharing::get_sharing_status,
            sharing::join_shared_instance,
            sharing::sync_joined_instance,
            sharing::check_owner_online
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
