use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{env, fs};

fn main() {
    const COMMANDS: &[&str] = &[
        "list_saved_tracks",
        "save_track",
        "delete_track",
        "capture_sources",
        "capture_start",
        "capture_read",
        "capture_stop",
        "youtube_search",
        "search_cancel",
        "search_status",
        "audio_acquire",
        "audio_read",
        "audio_cancel",
        "audio_reject",
        "audio_diagnostics",
    ];
    let output_directory = env::var_os("OUT_DIR").expect("Cargo did not set OUT_DIR");
    let icon_path = std::path::PathBuf::from(output_directory).join("harmonia.ico");
    let icon = STANDARD
        .decode(include_str!("icons/icon.ico.b64").trim())
        .expect("embedded icon must be valid base64");
    fs::write(&icon_path, &icon).expect("embedded icon must be writable");
    fs::write("icons/icon.ico", icon).expect("bundle icon must be writable");

    let png = STANDARD
        .decode(include_str!("icons/icon.png.b64").trim())
        .expect("embedded PNG must be valid base64");
    fs::write("icons/icon.png", png).expect("application icon must be writable");

    let windows = tauri_build::WindowsAttributes::new().window_icon_path(icon_path);
    let app_manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .app_manifest(app_manifest);
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
