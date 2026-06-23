use base64::{Engine as _, engine::general_purpose};
use reqwest::Client;
use rfd::FileDialog;
use serde::Serialize;
use serde::Deserialize;
use dirs::data_dir;

use std::fs;
use std::io::Read;
use std::net::{IpAddr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;
use tiny_http::{Header, Response, Server};

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

// ── Capture Proxy ────────────────────────────────────────────────────────────

struct CaptureProxyState {
  shutdown_flag: Arc<AtomicBool>,
}

static CAPTURE_PROXY_STATE: OnceLock<Mutex<CaptureProxyState>> = OnceLock::new();

fn get_capture_proxy_state() -> Option<&'static Mutex<CaptureProxyState>> {
  CAPTURE_PROXY_STATE.get()
}

/// Check if a hostname resolves to a private IP (sync, no DNS lookup).
/// Returns true if the hostname is clearly private without DNS resolution.
fn hostname_is_private_sync(hostname: &str) -> bool {
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CapturedRequest {
  pub id: String,
  pub method: String,
  pub url: String,
  pub headers: Vec<(String, String)>,
  pub body: Option<String>,
  pub timestamp: u64,
  // Response fields (populated after forwarding)
  pub status: Option<u16>,
  pub response_headers: Option<Vec<(String, String)>>,
  pub response_body: Option<String>,
  pub duration_ms: Option<u128>,
  pub error: Option<String>,
}

impl CapturedRequest {
  fn from_http_request(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<String>,
  ) -> Self {
    CapturedRequest {
      id: format!("cap-{}-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis(),
        rand_id()),
      method: method.to_string(),
      url: url.to_string(),
      headers: headers.to_vec(),
      body,
      timestamp: std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64,
      status: None,
      response_headers: None,
      response_body: None,
      duration_ms: None,
      error: None,
    }
  }
}

fn rand_id() -> String {
  use std::time::SystemTime;
  let now = SystemTime::now()
    .duration_since(SystemTime::UNIX_EPOCH)
    .unwrap()
    .as_nanos();
  (now % 99999).to_string()
}

/// Forward an HTTP request using reqwest (sync helper via blocking task).
fn forward_request_sync(
  method: &str,
  url: &str,
  headers: &[(String, String)],
  body: Option<&str>,
) -> Result<(u16, Vec<(String, String)>, String), String> {
  let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
  rt.block_on(async {
    let parsed_url = reqwest::Url::parse(url).map_err(|e| e.to_string())?;

    // SSRF protection
    if let Some(host) = parsed_url.host_str() {
      if hostname_is_private_sync(host) {
        return Err("Cannot forward to private/internal host".to_string());
      }
    }

    let client = Client::builder()
      .timeout(std::time::Duration::from_secs(30))
      .gzip(true)
      .brotli(true)
      .deflate(true)
      .build()
      .map_err(|e| e.to_string())?;

    let mut request = client
      .request(method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, url);

    for (key, value) in headers {
      request = request.header(key, value);
    }

    if let Some(b) = body {
      request = request.body(reqwest::Body::from(b.to_string()));
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let resp_headers: Vec<(String, String)> = response
      .headers()
      .iter()
      .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
      .collect();
    let body_str = response.text().await.map_err(|e| e.to_string())?;

    Ok((status, resp_headers, body_str))
  })
}

fn start_proxy_server(app_handle: AppHandle, port: u16) -> Result<(), String> {
  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  let server = Server::http(&addr).map_err(|e| format!("Failed to bind port {}: {}", port, e))?;

  let shutdown_flag = Arc::new(AtomicBool::new(false));
  let flag_for_server = shutdown_flag.clone();

  // Spawn the blocking proxy loop in a tokio task
  let handle = app_handle.clone();
  std::thread::spawn(move || {
    for request in server.incoming_requests() {
      if flag_for_server.load(Ordering::Relaxed) {
        break;
      }

      let method = request.method().to_string();
      let url = request.url().to_string();

      // Reconstruct full URL — if the request URL is a path, prepend http://127.0.0.1:port
      let full_url = if url.starts_with("http://") || url.starts_with("https://") {
        url.clone()
      } else {
        // Use Host header to determine target
        let host_header = request
          .headers()
          .iter()
          .find(|h| h.field.equiv("Host"))
          .map(|h| h.value.as_str())
          .unwrap_or("");

        // Try to determine scheme from the request itself
        // Default to http for the proxy
        let scheme = "http";
        format!("{}://{}{}", scheme, host_header, url)
      };

      let req_headers: Vec<(String, String)> = request
        .headers()
        .iter()
        .map(|h| (h.field.to_string(), h.value.as_str().to_string()))
        .collect();

      let mut body_bytes: Option<Vec<u8>> = None;
      if method != "GET" && method != "HEAD" {
        let mut buf = Vec::new();
        let mut reader = request.as_reader();
        let _ = reader.read_to_end(&mut buf);
        if !buf.is_empty() {
          body_bytes = Some(buf);
        }
      }

      let body_str = body_bytes.as_ref().map(|b| String::from_utf8_lossy(b).to_string());

      // Emit "captured" event (before forwarding)
      let mut captured = CapturedRequest::from_http_request(&method, &full_url, &req_headers, body_str.clone());
      let captured_id = captured.id.clone();

      let emit_result = handle.emit("captured-request", &captured);
      if emit_result.is_err() {
        eprintln!("[capture-proxy] failed to emit event: {:?}", emit_result);
      }

      // Forward the request
      let start = Instant::now();
      let forward_result = forward_request_sync(
        &method,
        &full_url,
        &req_headers,
        body_str.as_deref(),
      );

      let (status, resp_headers, resp_body) = match forward_result {
        Ok((s, h, b)) => (s, Some(h), Some(b)),
        Err(e) => {
          captured.error = Some(e.clone());
          captured.duration_ms = Some(start.elapsed().as_millis());
          let _ = handle.emit("captured-request-updated", &captured);
          let _ = request.respond(
            Response::from_string(format!("Proxy error: {}", e))
              .with_status_code(502)
              .with_header(tiny_http::Header::from_bytes("Content-Type".as_bytes(), "text/plain".as_bytes()).unwrap()),
          );
          continue;
        }
      };

      captured.status = Some(status);
      captured.response_headers = resp_headers.clone();
      captured.response_body = resp_body.clone();
      captured.duration_ms = Some(start.elapsed().as_millis());

      let _ = handle.emit("captured-request-updated", &captured);

      // Build tiny_http response headers
      let http_resp_headers: Vec<Header> = resp_headers
        .unwrap_or_default()
        .iter()
        .filter(|(k, _)| !k.eq_ignore_ascii_case("transfer-encoding"))
        .filter(|(k, _)| !k.eq_ignore_ascii_case("content-encoding"))
        .map(|(k, v)| {
          Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap_or_else(|_| {
            Header::from_bytes(k.as_bytes(), b"").unwrap()
          })
        })
        .collect();

      let _ = request.respond(
        {
          let mut response = Response::from_string(resp_body.unwrap_or_default())
            .with_status_code(status);
          for header in http_resp_headers {
            response = response.with_header(header);
          }
          response
        },
      );
    }
  });

  let state = CaptureProxyState {
    shutdown_flag,
  };
  let _ = CAPTURE_PROXY_STATE.set(Mutex::new(state));

  Ok(())
}

#[tauri::command]
fn start_capture_proxy(app_handle: AppHandle, port: u16) -> Result<(), String> {
  if port < 1024 || port > 65535 {
    return Err("Port must be between 1024 and 65535".to_string());
  }

  if get_capture_proxy_state().is_some() {
    return Err("Capture proxy is already running".to_string());
  }

  start_proxy_server(app_handle, port)
}

#[tauri::command]
fn stop_capture_proxy() -> Result<(), String> {
  let state = get_capture_proxy_state()
    .ok_or_else(|| "Capture proxy is not running".to_string())?;

  let state = state.lock().map_err(|e| e.to_string())?;
  state.shutdown_flag.store(true, Ordering::Relaxed);

  drop(state);
  // Clear the state so start can be called again
  let _ = CAPTURE_PROXY_STATE.get().map(|m| m.lock().map(|_| ()));

  Ok(())
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
      start_capture_proxy,
      stop_capture_proxy,
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
      // Enregistrer le schéma de deep-link pour que le navigateur externe puisse rediriger vers reqly://
      app.deep_link().register("reqly").ok();
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
