use base64::{Engine as _, engine::general_purpose};
use reqwest::Client;
use rfd::FileDialog;
use serde::Serialize;
use dirs::data_dir;
use std::fs;
use std::net::{IpAddr, Ipv6Addr, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Instant;

/// Decode common HTML entities in response bodies.
/// Some upstream servers/frameworks encode characters like ' → &#x27; in JSON.
fn decode_html_entities(text: &str) -> String {
  if !text.contains("&#") && !text.contains("&amp;") && !text.contains("&lt;")
    && !text.contains("&gt;") && !text.contains("&quot;") && !text.contains("&apos;")
  {
    return text.to_string();
  }
  text
    .replace("&#x27;", "'")
    .replace("&#39;", "'")
    .replace("&apos;", "'")
    .replace("&quot;", "\"")
    .replace("&#x22;", "\"")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&amp;", "&")
}

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

static MOCK_STORE: OnceLock<MockStore> = OnceLock::new();

fn get_mock_store() -> &'static MockStore {
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

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  open::that(&url).map_err(|e| e.to_string())
}

// ── Mock Tauri commands ──

#[tauri::command]
fn get_mock_routes() -> Vec<MockRoute> {
  get_mock_store().get_routes()
}

#[tauri::command]
fn set_mock_routes(routes: Vec<MockRoute>) {
  get_mock_store().set_routes(routes);
}

#[tauri::command]
fn add_mock_route(route: MockRoute) {
  get_mock_store().add_route(route);
}

#[tauri::command]
fn update_mock_route(id: String, route: MockRoute) -> Result<(), String> {
  get_mock_store().update_route(&id, route)
}

#[tauri::command]
fn delete_mock_route(id: String) {
  get_mock_store().delete_route(&id);
}

#[tauri::command]
fn toggle_mock_enabled(id: String) -> Result<(), String> {
  get_mock_store().toggle_enabled(&id)
}

#[tauri::command]
fn is_mock_enabled_globally() -> bool {
  get_mock_store().is_mock_enabled_globally()
}

#[tauri::command]
fn set_mock_enabled_globally(enabled: bool) {
  get_mock_store().set_mock_enabled_globally(enabled);
}

// ── SSRF protection ──

fn is_private_ipv6(v6: Ipv6Addr) -> bool {
  if v6.is_loopback() || v6.is_unspecified() {
    return true;
  }
  let segments = v6.segments();
  // Unique local (fc00::/7)
  if (segments[0] & 0xfe00) == 0xfc00 {
    return true;
  }
  // Link-local (fe80::/10)
  if (segments[0] & 0xffc0) == 0xfe80 {
    return true;
  }
  false
}

fn is_private_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(v4) => {
      v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified()
    }
    IpAddr::V6(v6) => is_private_ipv6(v6),
  }
}

fn is_private_host(hostname: &str) -> bool {
  let lower = hostname.to_lowercase();

  // IPv6-mapped IPv4 (::ffff:x.x.x.x)
  if lower.starts_with("::ffff:") {
    let mapped = &lower[7..];
    if let Ok(ip) = mapped.parse::<IpAddr>() {
      return is_private_ip(ip);
    }
  }

  if let Ok(ip) = hostname.parse::<IpAddr>() {
    return is_private_ip(ip);
  }

  lower == "localhost"
    || lower == "localhost.localdomain"
    || lower == "0.0.0.0"
    || lower.ends_with(".local")
    || lower.ends_with(".internal")
}

async fn host_resolves_to_private(hostname: &str) -> Result<bool, String> {
  let host = hostname.to_string();
  let addrs = tokio::task::spawn_blocking(move || {
    (host.as_str(), 0)
      .to_socket_addrs()
      .map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())??;

  for addr in addrs {
    if is_private_ip(addr.ip()) {
      return Ok(true);
    }
  }
  Ok(false)
}

#[tauri::command]
async fn fetch_proxy(
  method: String,
  url: String,
  headers: Vec<(String, String)>,
  body: Option<String>,
) -> Result<TauriFetchResponse, String> {
  // Check mock store first — intercept before SSRF checks or network calls
  if let Some(mock) = get_mock_store().find_mock_match(&method, &url, &headers) {
    if mock.delay > 0 {
      tokio::time::sleep(std::time::Duration::from_millis(mock.delay)).await;
    }
    return Ok(TauriFetchResponse {
      status: mock.status,
      body: mock.body,
      headers: mock.headers,
      duration_ms: mock.duration_ms + mock.delay as u128,
      encoding: mock.encoding,
      mocked: true,
    });
  }

  // Parse and validate URL
  let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

  // SSRF protection: block requests to private/internal hosts
  #[cfg(not(debug_assertions))]
  let is_dev = false;
  #[cfg(debug_assertions)]
  let is_dev = true;

  if let Some(host) = parsed_url.host_str() {
    if !is_dev {
      if is_private_host(host) {
        return Err("Requests to private/internal hosts are not allowed".to_string());
      }
      if host_resolves_to_private(host).await? {
        return Err(
          "Requests to private/internal hosts are not allowed (DNS rebinding prevention)"
            .to_string(),
        );
      }
    }
  } else {
    return Err("Invalid URL: missing host".to_string());
  }
  let start = Instant::now();
  let client = Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .gzip(true)
    .brotli(true)
    .deflate(true)
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
    let text = response.text().await.map_err(|e| e.to_string())?;
    (decode_html_entities(&text), "utf8".to_string())
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
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {
      // Le plugin deep-link gère la redirection avec single-instance
    }));
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .invoke_handler(tauri::generate_handler![
      fetch_proxy,
      export_json,
      open_external,
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
      let _ = MOCK_STORE.set(store);

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
