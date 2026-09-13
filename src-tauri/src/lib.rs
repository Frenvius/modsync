pub mod catalog;
pub mod contracts;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    let builder = builder.plugin(
        tauri_plugin_mcp_bridge::Builder::new()
            .bind_address("127.0.0.1")
            .base_port(9823)
            .build(),
    );

    builder
        .invoke_handler(tauri::generate_handler![catalog::get_catalog])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
