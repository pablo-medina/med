use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentFile {
    path: String,
    content: String,
}

fn markdown_path(args: impl IntoIterator<Item = String>) -> Option<PathBuf> {
    args.into_iter().skip(1).map(PathBuf::from).find(|path| {
        path.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| {
                    matches!(value.to_ascii_lowercase().as_str(), "md" | "markdown")
                })
    })
}

#[tauri::command]
fn startup_document() -> Result<Option<DocumentFile>, String> {
    markdown_path(std::env::args())
        .map(read_document_path)
        .transpose()
}

fn read_document_path(path: PathBuf) -> Result<DocumentFile, String> {
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    let content = fs::read_to_string(&canonical).map_err(|error| error.to_string())?;
    Ok(DocumentFile {
        path: canonical.to_string_lossy().into_owned(),
        content: content.trim_start_matches('\u{feff}').to_owned(),
    })
}

#[tauri::command]
fn read_document(path: String) -> Result<DocumentFile, String> {
    read_document_path(PathBuf::from(path))
}

#[tauri::command]
fn read_linked_document(base_path: String, link_path: String) -> Result<DocumentFile, String> {
    let link = PathBuf::from(link_path);
    let path = if link.is_absolute() {
        link
    } else {
        PathBuf::from(base_path)
            .parent()
            .ok_or("The current document has no parent directory")?
            .join(link)
    };
    let is_markdown = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "md" | "markdown"));
    if !is_markdown {
        return Err("Only Markdown document links can be opened in MED".into());
    }
    read_document_path(path)
}

#[tauri::command]
fn write_document(path: String, content: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("med.tmp");
    fs::write(&temporary, content.as_bytes()).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
    path.canonicalize()
        .or(Ok(path))
        .map(|value| value.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_binary(path: String, data: Vec<u8>) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, data).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("config.json"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_config(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn write_config(app: tauri::AppHandle, content: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&content).map_err(|error| error.to_string())?;
    let path = config_path(&app)?;
    let parent = path.parent().ok_or("Invalid configuration path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join("config.med.tmp");
    fs::write(&temporary, content.as_bytes()).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window is unavailable")?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = markdown_path(args) {
                if let Ok(document) = read_document_path(path) {
                    let _ = app.emit("open-document", document);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            startup_document,
            read_document,
            read_linked_document,
            write_document,
            write_binary,
            read_config,
            write_config,
            reveal_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running MED");
}
