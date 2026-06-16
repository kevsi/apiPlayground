use base64::{Engine as _, engine::general_purpose};
use reqwest::Client;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use dirs::data_dir;

mod mock_matcher;
mod mock_store;
mod mock_types;

use mock_store::MockStore;
use mock_types::MockRoute;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriFetchResponse {
  status: u16,
  body: String,
  headers: Vec<(String, String)>,
  duration_ms: u128,
  encoding: String,
  mocked: bool,
}

static MOCK_STORE: OnceLock<Mutex<MockStore>> = OnceLock::new();

fn get_mock_store() -> &'static Mutex<MockStore> {
  MOCK_STORE.get().expect("MockStore not initialized")
}

fn parse_mock_store_path() -> PathBuf {
  let dir = data_dir().unwrap_or_else(|| PathBuf::from("."));
  let dir = dir.join("reqly");
  let path = dir.join("mock-routes.json");
  let _ = fs::create_dir_all(&dir);
  path
}

#[tauri::command]
fn export_json(content: String, default_name: String) -> Result<String, String> {
  let path = FileDialog::new()
    .set_file_name(&default_name)
    .add_filter("JSON", &["json"])
    .save_file();

  match path {
    Some(p) => {
      fs::write(&p, content).map_err(|e| e.to_string())?;
      Ok(p.to_string_lossy().to_string())
    }
    None => Err("cancelled".to_string()),
  }
}

// ── Mock Tauri commands ──

#[tauri::command]
fn get_mock_routes() -> Vec<MockRoute> {
  get_mock_store().lock().unwrap().get_routes()
}

#[tauri::command]
fn set_mock_routes(routes: Vec<MockRoute>) {
  get_mock_store().lock().unwrap().set_routes(routes);
}

#[tauri::command]
fn add_mock_route(route: MockRoute) {
  get_mock_store().lock().unwrap().add_route(route);
}

#[tauri::command]
fn update_mock_route(id: String, route: MockRoute) -> Result<(), String> {
  get_mock_store().lock().unwrap().update_route(&id, route)
}

#[tauri::command]
fn delete_mock_route(id: String) {
  get_mock_store().lock().unwrap().delete_route(&id);
}

#[tauri::command]
fn toggle_mock_enabled(id: String) -> Result<(), String> {
  get_mock_store().lock().unwrap().toggle_enabled(&id)
}

#[tauri::command]
fn is_mock_enabled_globally() -> bool {
  get_mock_store().lock().unwrap().is_mock_enabled_globally()
}

#[tauri::command]
fn set_mock_enabled_globally(enabled: bool) {
  get_mock_store().lock().unwrap().set_mock_enabled_globally(enabled);
}

// ── SSRF protection ──

fn is_private_host(hostname: &str) -> bool {
  // Try parsing as IP address
  if let Ok(ip) = hostname.parse::<IpAddr>() {
    match ip {
      IpAddr::V4(v4) => {
        return v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified();
      }
      IpAddr::V6(v6) => {
        return v6.is_loopback() || v6.is_unspecified();
      }
    }
  }

  // Check for private hostname patterns
  let lower = hostname.to_lowercase();
  lower == "localhost"
    || lower == "localhost.localdomain"
    || lower == "0.0.0.0"
    || lower.starts_with("10.")
    || lower.starts_with("172.16.")
    || lower.starts_with("172.17.")
    || lower.starts_with("172.18.")
    || lower.starts_with("172.19.")
    || lower.starts_with("172.20.")
    || lower.starts_with("172.21.")
    || lower.starts_with("172.22.")
    || lower.starts_with("172.23.")
    || lower.starts_with("172.24.")
    || lower.starts_with("172.25.")
    || lower.starts_with("172.26.")
    || lower.starts_with("172.27.")
    || lower.starts_with("172.28.")
    || lower.starts_with("172.29.")
    || lower.starts_with("172.30.")
    || lower.starts_with("172.31.")
    || lower.starts_with("192.168.")
    || lower.starts_with("169.254.")
    || lower.ends_with(".local")
    || lower.ends_with(".internal")
}

#[tauri::command]
async fn fetch_proxy(
  method: String,
  url: String,
  headers: Vec<(String, String)>,
  body: Option<String>,
) -> Result<TauriFetchResponse, String> {
  // Check mock store first — intercept before SSRF checks or network calls
  if let Some(mock_resp) = get_mock_store().lock().unwrap().handle_mock_request(&method, &url) {
    return Ok(TauriFetchResponse {
      status: mock_resp.status,
      body: mock_resp.body,
      headers: mock_resp.headers,
      duration_ms: mock_resp.duration_ms,
      encoding: mock_resp.encoding,
      mocked: true,
    });
  }

  // Parse and validate URL
  let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

  // SSRF protection: block requests to private/internal hosts
  if let Some(host) = parsed_url.host_str() {
    if is_private_host(host) {
      return Err("Requests to private/internal hosts are not allowed".to_string());
    }
  } else {
    return Err("Invalid URL: missing host".to_string());
  }
  let start = Instant::now();
  let client = Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|e| e.to_string())?;

  let mut request = client
    .request(method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, &url);

  // Ajouter les headers
  let mut has_content_type = false;
  for (key, value) in headers {
    if key.eq_ignore_ascii_case("Content-Type") {
      has_content_type = true;
    }
    request = request.header(key, value);
  }

  // Forcer Content-Type si body et pas déjà défini
  if body.is_some() && !has_content_type {
    request = request.header("Content-Type", "application/json");
  }

  if let Some(body) = body {
    request = request.body(body);
  }

  let response = request.send().await.map_err(|e| e.to_string())?;
  let status = response.status().as_u16();
  let header_pairs: Vec<(String, String)> = response
    .headers()
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
    .collect();

  // Detect binary content types to encode as base64
  let content_type = header_pairs
    .iter()
    .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
    .map(|(_, v)| v.split(';').next().unwrap_or_default().trim().to_lowercase())
    .unwrap_or_default();

  let is_binary = content_type.starts_with("image/")
    || content_type.starts_with("audio/")
    || content_type.starts_with("video/")
    || content_type.starts_with("font/")
    || content_type == "application/pdf"
    || content_type == "application/octet-stream"
    || content_type == "application/zip"
    || content_type == "application/gzip";

  let (body_str, encoding) = if is_binary {
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    (general_purpose::STANDARD.encode(&bytes), "base64".to_string())
  } else {
    (response.text().await.map_err(|e| e.to_string())?, "utf8".to_string())
  };

  let duration_ms = start.elapsed().as_millis();

  Ok(TauriFetchResponse {
    status,
    body: body_str,
    headers: header_pairs,
    duration_ms,
    encoding,
    mocked: false,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      fetch_proxy,
      export_json,
      get_mock_routes,
      set_mock_routes,
      add_mock_route,
      update_mock_route,
      delete_mock_route,
      toggle_mock_enabled,
      is_mock_enabled_globally,
      set_mock_enabled_globally,
    ])
    .setup(|app| {
      // Initialize mock store (file-persisted, survives restarts)
      let store_path = parse_mock_store_path();
      let store = MockStore::new(store_path);
      let _ = MOCK_STORE.set(Mutex::new(store));

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.handle().plugin(tauri_plugin_dialog::init())?;
      app.handle().plugin(tauri_plugin_fs::init())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
