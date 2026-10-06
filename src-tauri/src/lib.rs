mod ffmpeg;
mod probe;

use ffmpeg::ExportState;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// Path of the current preview proxy, so it can be deleted.
#[derive(Default)]
struct ProxyState(Mutex<Option<PathBuf>>);

fn remove_proxy(app: &AppHandle) {
    if let Some(path) = app.state::<ProxyState>().0.lock().unwrap().take() {
        let _ = std::fs::remove_file(path);
    }
}

#[tauri::command]
async fn probe_media(path: String) -> Result<probe::MediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || probe::probe(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn export_video(
    app: AppHandle,
    args: Vec<String>,
    duration: f64,
    output: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ExportState>();
        ffmpeg::run_export(&app, &state, &args, duration, &output)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cancel_export(state: State<'_, ExportState>) {
    ffmpeg::cancel(&state);
}

#[tauri::command]
async fn make_proxy(app: AppHandle, input: String) -> Result<String, String> {
    remove_proxy(&app);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out = std::env::temp_dir().join(format!("videocut-proxy-{nanos}.mp4"));
    let target = out.clone();
    tauri::async_runtime::spawn_blocking(move || ffmpeg::make_proxy(&input, &target))
        .await
        .map_err(|e| e.to_string())??;
    *app.state::<ProxyState>().0.lock().unwrap() = Some(out.clone());
    Ok(out.to_string_lossy().into_owned())
}

#[tauri::command]
fn clear_proxy(app: AppHandle) {
    remove_proxy(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ExportState::default())
        .manage(ProxyState::default())
        .invoke_handler(tauri::generate_handler![
            probe_media,
            export_video,
            cancel_export,
            make_proxy,
            clear_proxy
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                remove_proxy(app);
            }
        });
}
