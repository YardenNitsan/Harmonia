pub mod acquisition;
pub mod capture;
pub mod database;
pub mod recognition;
pub mod search;
pub mod validation;

use database::{Database, LibraryReadResult};
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

#[tauri::command]
async fn recognition_run(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, Arc<recognition::RecognitionService>>,
) -> Result<Value, String> {
    let id = request
        .headers()
        .get("x-harmonia-request-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing recognition ID")?
        .to_owned();
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary PCM".into());
    };
    if bytes.len() > 22050 * 1200 * 4 {
        return Err("Recording exceeds recognition bounds".into());
    }
    state.recognize(&id, bytes.clone()).await
}
#[tauri::command]
fn recognition_cancel(
    request_id: String,
    state: tauri::State<'_, Arc<recognition::RecognitionService>>,
) {
    state.cancel(&request_id);
}

#[tauri::command]
async fn audio_acquire(
    video_id: String,
    request_id: String,
    exclude_providers: Option<Vec<String>>,
    state: tauri::State<'_, Arc<acquisition::AcquisitionService>>,
) -> Result<acquisition::Audio, acquisition::AcquisitionError> {
    state
        .acquire(
            &video_id,
            &request_id,
            exclude_providers.unwrap_or_default(),
        )
        .await
}
#[tauri::command]
async fn audio_read(
    cache_token: String,
    offset: u64,
    length: usize,
    state: tauri::State<'_, Arc<acquisition::AcquisitionService>>,
) -> Result<tauri::ipc::Response, acquisition::AcquisitionError> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        service
            .read(&cache_token, offset, length)
            .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|_| acquisition::AcquisitionError {
        code: "unavailable",
        message: "Audio is unavailable.",
    })?
}
#[tauri::command]
fn audio_cancel(request_id: String, state: tauri::State<'_, Arc<acquisition::AcquisitionService>>) {
    state.cancel(&request_id)
}
#[tauri::command]
fn audio_reject(
    cache_token: String,
    state: tauri::State<'_, Arc<acquisition::AcquisitionService>>,
) -> Result<(), acquisition::AcquisitionError> {
    state.reject(&cache_token)
}
#[tauri::command]
fn audio_diagnostics(
    state: tauri::State<'_, Arc<acquisition::AcquisitionService>>,
) -> Vec<acquisition::Diagnostic> {
    state.diagnostics()
}

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
            app.manage(Arc::new(recognition::RecognitionService::default()));
            app.manage(Arc::new(
                acquisition::AcquisitionService::new(
                    path.parent()
                        .ok_or("invalid database directory")?
                        .join("acquired-audio"),
                )
                .map_err(|_| "audio cache initialization failed")?,
            ));
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
            search_status,
            audio_acquire,
            audio_read,
            audio_cancel,
            audio_reject,
            audio_diagnostics,
            recognition_run,
            recognition_cancel
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
                app.state::<Arc<acquisition::AcquisitionService>>()
                    .shutdown();
            }
        });
}
