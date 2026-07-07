use base64::{Engine as _, engine::general_purpose};
use serde::Serialize;
use serde::Deserialize;

use std::io::Write;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};
use tiny_http::{Header, Response, Server};
use uuid::Uuid;

/// Decode common HTML entities in response bodies.
/// Some upstream servers/frameworks encode characters like ' → &#x27; in JSON.
fn decode_html_entities(text: &str) -> String {
  if !text.contains('&') {
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

mod websocket;
mod mcp;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriFetchResponse {
  status: u16,
  body: String,
  headers: Vec<(String, String)>,
  duration_ms: u64,
  encoding: String,
}

#[derive(Clone)]
struct SharedClient(reqwest::Client);

#[tauri::command]
fn export_json(
  app: AppHandle,
  content: String,
  default_name: String,
) -> Result<String, String> {
  let file_path: Option<FilePath> = app
    .dialog()
    .file()
    .add_filter("JSON", &["json"])
    .set_file_name(&default_name)
    .blocking_save_file();

  match file_path {
    Some(fp) => {
      let path = fp
        .into_path()
        .map_err(|e| format!("Invalid file path: {}", e))?;
      let mut opts = OpenOptions::new();
      opts.write(true).create(true).truncate(true);
      let mut file = app
        .fs()
        .open(&path, opts)
        .map_err(|e| e.to_string())?;
      file
        .write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
      Ok(path.to_string_lossy().to_string())
    }
    None => Err("cancelled".to_string()),
  }
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  // SECURITY FIX H4: Whitelist allowed URL schemes to prevent RCE via file://, ms-settings:, etc.
  let scheme = url
    .split("://")
    .next()
    .unwrap_or("")
    .to_lowercase();
  
  let allowed_schemes = ["http", "https", "mailto"];
  
  if !allowed_schemes.contains(&scheme.as_str()) {
    return Err(format!("Blocked dangerous scheme: {}. Only http, https, mailto are allowed.", scheme));
  }
  
  open::that(&url).map_err(|e| e.to_string())
}

// Note: SSRF protection is intentionally absent from the desktop Tauri binary.
// Reqly is an API client (like Postman/Insomnia) that runs entirely on the
// user's own machine. Blocking localhost or LAN addresses would prevent the
// primary use-case: testing APIs that run locally or on a private network.
// The SSRF guard remains in place on the web-only Next.js proxy route
// (reqy-web/app/api/proxy/route.ts), which can be exposed publicly on Vercel.

#[tauri::command]
async fn fetch_proxy(
  method: String,
  url: String,
  headers: Vec<(String, String)>,
  body: Option<String>,
  client: tauri::State<'_, SharedClient>,
) -> Result<TauriFetchResponse, String> {
  // Parse and validate URL
  let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

  // Validate that a host is present — no SSRF blocking here (see comment above
  // the fetch_proxy function for the rationale).
  if parsed_url.host_str().is_none() {
    return Err("Invalid URL: missing host".to_string());
  }
  let start = Instant::now();
  let mut request = client.0
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

  let duration_ms = start.elapsed().as_millis() as u64;

  Ok(TauriFetchResponse {
    status,
    body: body_str,
    headers: header_pairs,
    duration_ms,
    encoding,
  })
}

// ── Capture Proxy ────────────────────────────────────────────────────────────

#[derive(Default)]
struct CaptureProxyState {
  shutdown_flag: Option<Arc<AtomicBool>>,
  server_thread: Option<std::thread::JoinHandle<()>>,
}

type ManagedCaptureProxyState = Arc<Mutex<CaptureProxyState>>;


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
  pub duration_ms: Option<u64>,
  pub error: Option<String>,
}

impl CapturedRequest {
  fn from_http_request(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<String>,
  ) -> Self {
    let now = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap();
    CapturedRequest {
      id: format!("cap-{}", Uuid::new_v4()),
      method: method.to_string(),
      url: url.to_string(),
      headers: headers.to_vec(),
      body,
      timestamp: now.as_millis() as u64,
      status: None,
      response_headers: None,
      response_body: None,
      duration_ms: None,
      error: None,
    }
  }
}

/// Forward an HTTP request using reqwest (async, used inside proxy thread via rt.block_on).
async fn forward_request_async(
  client: &reqwest::Client,
  method: &str,
  url: &str,
  headers: &[(String, String)],
  body: Option<&str>,
) -> Result<(u16, Vec<(String, String)>, String), String> {
  let _parsed_url = reqwest::Url::parse(url).map_err(|e| e.to_string())?;

  // No SSRF blocking here — same rationale as fetch_proxy: Reqly is a
  // desktop client, testing local/LAN APIs is a core use case.

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
}

fn start_proxy_server(
  app_handle: AppHandle,
  port: u16,
  state: &ManagedCaptureProxyState,
  client: reqwest::Client,
) -> Result<(), String> {
  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  let server = Server::http(addr).map_err(|e| format!("Failed to bind port {}: {}", port, e))?;

  let shutdown_flag = Arc::new(AtomicBool::new(false));
  let flag_for_server = shutdown_flag.clone();

  {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.shutdown_flag = Some(shutdown_flag);
  }

  // Spawn the blocking proxy loop in a std thread with a dedicated runtime
  let handle = app_handle.clone();
  let server_handle = std::thread::spawn(move || {
    let rt = tokio::runtime::Runtime::new().expect("failed to create proxy runtime");
    for mut request in server.incoming_requests() {
      if flag_for_server.load(Ordering::SeqCst) {
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
        let _ = request.as_reader().read_to_end(&mut buf);
        if !buf.is_empty() {
          body_bytes = Some(buf);
        }
      }

      let body_str = body_bytes.as_ref().map(|b| String::from_utf8_lossy(b).to_string());

      // Emit "captured" event (before forwarding)
      let mut captured = CapturedRequest::from_http_request(&method, &full_url, &req_headers, body_str.clone());
      let _captured_id = captured.id.clone();

      let emit_result = handle.emit("captured-request", &captured);
      if emit_result.is_err() {
        eprintln!("[capture-proxy] failed to emit event: {:?}", emit_result);
      }

      // Forward the request
      let start = Instant::now();
      let forward_result = rt.block_on(forward_request_async(
        &client,
        &method,
        &full_url,
        &req_headers,
        body_str.as_deref(),
      ));

      let (status, resp_headers, resp_body) = match forward_result {
        Ok((s, h, b)) => (s, Some(h), Some(b)),
        Err(e) => {
          captured.error = Some(e.clone());
          captured.duration_ms = Some(start.elapsed().as_millis() as u64);
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
      captured.duration_ms = Some(start.elapsed().as_millis() as u64);

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

  let mut guard = state.lock().map_err(|e| e.to_string())?;
  guard.server_thread = Some(server_handle);

  Ok(())
}

#[tauri::command]
fn start_capture_proxy(
  app_handle: AppHandle,
  port: u16,
  state: tauri::State<'_, ManagedCaptureProxyState>,
  client: tauri::State<'_, SharedClient>,
) -> Result<(), String> {
  if port < 1024 {
    return Err("Port must be between 1024 and 65535".to_string());
  }

  {
    let guard = state.lock().map_err(|e| e.to_string())?;
    if guard.shutdown_flag.is_some() {
      return Err("Capture proxy is already running".to_string());
    }
  }

  start_proxy_server(app_handle, port, &state, client.0.clone())
}

#[tauri::command]
fn stop_capture_proxy(
  state: tauri::State<'_, ManagedCaptureProxyState>,
) -> Result<(), String> {
  let mut guard = state.lock().map_err(|e| e.to_string())?;
  if let Some(flag) = guard.shutdown_flag.take() {
    flag.store(true, Ordering::SeqCst);
    if let Some(handle) = guard.server_thread.take() {
      drop(guard);
      handle
        .join()
        .map_err(|_| "Failed to join proxy thread".to_string())?;
    }
    Ok(())
  } else {
    Err("Capture proxy is not running".to_string())
  }
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
    .manage::<ManagedCaptureProxyState>(Arc::new(Mutex::new(CaptureProxyState::default())))
    .manage::<mcp::ManagedMcpState>(Arc::new(Mutex::new(mcp::McpProcessState::default())))
    .invoke_handler(tauri::generate_handler![
      fetch_proxy,
      export_json,
      open_external,
      start_capture_proxy,
      stop_capture_proxy,
      websocket::commands::ws_connect,
      websocket::commands::ws_send,
      websocket::commands::ws_disconnect,
      websocket::commands::ws_get_status,
      mcp::start_mcp_server,
      mcp::stop_mcp_server,
      mcp::get_mcp_server_status,
      mcp::read_mcp_bundle,
      mcp::sync_mcp_collections,
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
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
