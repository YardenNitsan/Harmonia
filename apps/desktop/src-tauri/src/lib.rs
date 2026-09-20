pub mod capture;
pub mod database;
pub mod search;
pub mod validation;

use database::{Database, LibraryReadResult};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

#[tauri::command]
async fn youtube_search(
    query: String,
    request_id: String,
    state: tauri::State<'_, Arc<search::SearchService>>,
) -> Result<Vec<search::CatalogRecording>, search::SearchError> {
    state.search(&query, &request_id).await
}

#[tauri::command]
fn search_cancel(request_id: String, state: tauri::State<'_, Arc<search::SearchService>>) {
    state.cancel(&request_id);
}

#[tauri::command]
fn search_status(state: tauri::State<'_, Arc<search::SearchService>>) -> search::SearchStatus {
    state.status()
}

#[tauri::command]
async fn capture_sources(
    state: tauri::State<'_, Arc<capture::CaptureService>>,
) -> Result<Vec<capture::CaptureSource>, String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.sources())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_start(
    source_id: String,
    state: tauri::State<'_, Arc<capture::CaptureService>>,
) -> Result<capture::CaptureSession, String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.start(&source_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_read(
    capture_id: String,
    state: tauri::State<'_, Arc<capture::CaptureService>>,
) -> Result<capture::CaptureBatch, String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.read(&capture_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_stop(
    capture_id: String,
    state: tauri::State<'_, Arc<capture::CaptureService>>,
) -> Result<(), String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.stop(&capture_id))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Clone)]
struct DatabaseState {
    path: Arc<PathBuf>,
}

#[tauri::command]
async fn list_saved_tracks(
    state: tauri::State<'_, DatabaseState>,
) -> Result<LibraryReadResult, String> {
    let path = Arc::clone(&state.path);
    tauri::async_runtime::spawn_blocking(move || Database::open(path.as_ref())?.list())
        .await
        .map_err(|error| format!("database task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_track(record: Value, state: tauri::State<'_, DatabaseState>) -> Result<(), String> {
    let path = Arc::clone(&state.path);
    tauri::async_runtime::spawn_blocking(move || Database::open(path.as_ref())?.save(&record))
        .await
        .map_err(|error| format!("database task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn delete_track(id: String, state: tauri::State<'_, DatabaseState>) -> Result<(), String> {
    let path = Arc::clone(&state.path);
    tauri::async_runtime::spawn_blocking(move || Database::open(path.as_ref())?.delete(&id))
        .await
        .map_err(|error| format!("database task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let validation = match validation::ValidationOptions::parse(&arguments, &std::env::temp_dir()) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };
    let mut context = tauri::generate_context!();
    if let Some(options) = &validation {
        // Tauri constructs configured windows before setup, so this must happen first.
        options.configure(context.config_mut());
        std::env::set_var(
            "WEBVIEW2_USER_DATA_FOLDER",
            options.data_dir.join("webview"),
        );
    }
    tauri::Builder::default()
        .setup(move |app| {
            app.manage(Arc::new(capture::CaptureService::default()));
            app.manage(Arc::new(
                search::SearchService::new().map_err(|_| "search initialization failed")?,
            ));
            let path = if let Some(options) = &validation {
                options.data_dir.join("harmonia.db")
            } else {
                app.path().app_data_dir()?.join("harmonia.db")
            };
            app.manage(DatabaseState {
                path: Arc::new(path.clone()),
            });
            if let Some(options) = &validation {
                for window in app.webview_windows().values() {
                    if window.is_visible()? {
                        return Err("validation window must remain hidden".into());
                    }
                }
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(
                        validation::VALIDATION_TIMEOUT_SECONDS,
                    ));
                    handle.exit(0);
                });
                let ready = serde_json::json!({
                    "protocol": validation::VALIDATION_PROTOCOL,
                    "hidden": true,
                    "pid": std::process::id(),
                    "database": path,
                    "timeoutSeconds": validation::VALIDATION_TIMEOUT_SECONDS,
                });
                std::fs::write(
                    options.data_dir.join("validation-ready.json"),
                    serde_json::to_vec(&ready)?,
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_saved_tracks,
            save_track,
            delete_track,
            capture_sources,
            capture_start,
            capture_read,
            capture_stop,
            youtube_search,
            search_cancel,
            search_status
        ])
        .build(context)
        .expect("failed to build Harmonia")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                app.state::<Arc<capture::CaptureService>>().shutdown();
                app.state::<Arc<search::SearchService>>().shutdown();
            }
        });
}
