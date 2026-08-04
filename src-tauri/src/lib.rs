mod export;

#[tauri::command]
async fn export_document(request: export::ExportRequest) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export::export(request))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![export_document])
        .run(tauri::generate_context!())
        .expect("failed to run MED");
}
