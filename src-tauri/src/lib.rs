mod export;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Default)]
struct ExportJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[tauri::command]
async fn export_document(
    request: export::ExportRequest,
    jobs: State<'_, ExportJobs>,
) -> Result<(), String> {
    let export_id = request.export_id.clone();
    let cancellation = Arc::new(AtomicBool::new(false));
    jobs.0
        .lock()
        .map_err(|_| "Could not access the active export registry.".to_string())?
        .insert(export_id.clone(), Arc::clone(&cancellation));

    let result =
        tauri::async_runtime::spawn_blocking(move || export::export(request, &cancellation))
            .await
            .map_err(|error| error.to_string());

    jobs.0
        .lock()
        .map_err(|_| "Could not access the active export registry.".to_string())?
        .remove(&export_id);

    result?
}

#[tauri::command]
fn cancel_export(export_id: String, jobs: State<'_, ExportJobs>) -> Result<bool, String> {
    if let Some(cancellation) = jobs
        .0
        .lock()
        .map_err(|_| "Could not access the active export registry.".to_string())?
        .get(&export_id)
    {
        cancellation.store(true, Ordering::Relaxed);
        return Ok(true);
    }
    Ok(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExportJobs::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![export_document, cancel_export])
        .run(tauri::generate_context!())
        .expect("failed to run MED");
}
