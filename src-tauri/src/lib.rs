use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

use crate::error::AppError;

mod error;
pub mod websocket;
mod mcp;
mod capture;
mod open;
mod fetch;
mod store;

use crate::capture::{
  clear_captured_sessions, get_captured_session, list_captured_sessions, set_bandwidth_limit,
  start_capture_proxy, stop_capture_proxy, ManagedCaptureProxyState,
};
use crate::fetch::{fetch_proxy, SharedClient};
use crate::open::{export_json, open_external};

/// Writes arbitrary bytes to a user-chosen path.
///
/// Used by the SDK "Save As" flow. We write directly with `std::fs` (instead
/// of the `fs` plugin) so the user can save anywhere they pick via the native
/// dialog, without being constrained by the plugin's filesystem scope.
#[tauri::command]
fn save_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Failed to save file to {path}: {e}"))
}

// ── Offline request queue (store-and-forward prereq, Task 12a) ──────────────
//
// These thin commands expose the persistent `QueueStore` (see `store.rs`) to
// the frontend. Task 12b (replay on reconnect) will call them from TypeScript.

#[tauri::command]
fn enqueue_request(req: crate::store::QueuedRequest) -> Result<(), AppError> {
    crate::store::enqueue_request(req)
}

#[tauri::command]
fn list_pending() -> Vec<crate::store::QueuedRequest> {
    crate::store::list_pending()
}

#[tauri::command]
fn dequeue_ready() -> Option<crate::store::QueuedRequest> {
    crate::store::dequeue_ready()
}

#[tauri::command]
fn mark_sent(id: String) -> Result<(), AppError> {
    crate::store::mark_sent(&id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Install Rustls crypto provider before any TLS operation.
  // tokio-tungstenite (rustls 0.23) needs an explicit provider;
  // reqwest uses an older rustls 0.21 with auto-selected ring.
  rustls::crypto::ring::default_provider()
    .install_default()
    .expect("Failed to install Rustls crypto provider");

  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
      // Le plugin deep-link gère la redirection avec single-instance
    }));
  }

  let http_client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .gzip(true)
    .brotli(true)
    .deflate(true)
    .build()
    .expect("failed to create HTTP client");

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(websocket::manager::ConnectionManager::new())
    .manage(SharedClient(http_client))
    .manage::<ManagedCaptureProxyState>(Arc::new(Mutex::new(capture::CaptureProxyState::default())))
    .manage::<mcp::ManagedMcpState>(Arc::new(Mutex::new(mcp::McpProcessState::default())))
    .invoke_handler(tauri::generate_handler![
      fetch_proxy,
      export_json,
      open_external,
      start_capture_proxy,
      stop_capture_proxy,
      list_captured_sessions,
      get_captured_session,
      clear_captured_sessions,
      set_bandwidth_limit,
      websocket::commands::ws_connect,
      websocket::commands::ws_send,
      websocket::commands::ws_disconnect,
      websocket::commands::ws_get_status,
      mcp::start_mcp_server,
      mcp::stop_mcp_server,
      mcp::get_mcp_server_status,
      mcp::read_mcp_bundle,
      mcp::sync_mcp_collections,
      save_file,
      enqueue_request,
      list_pending,
      dequeue_ready,
      mark_sent,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Enregistrer le schéma de deep-link pour que le navigateur externe puisse rediriger vers reqly://
      app.deep_link().register("reqly").ok();
      // Point the offline queue store at the app's data directory (falls back
      // to a temp dir if it cannot be resolved).
      if let Ok(app_data_dir) = app.path().app_data_dir() {
        crate::store::init_queue_store(app_data_dir.clone());
        crate::capture::init_capture_store(app_data_dir);
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
