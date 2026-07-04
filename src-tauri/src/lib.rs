use base64::{Engine as _, engine::general_purpose};
use reqwest::Client;
use rfd::FileDialog;
use serde::Serialize;
use serde::Deserialize;

use std::fs;

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
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

mod websocket;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriFetchResponse {
  status: u16,
  body: String,
  headers: Vec<(String, String)>,
  duration_ms: u128,
  encoding: String,
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
  // SECURITY FIX H4: Whitelist allowed URL schemes to prevent RCE via file://, ms-settings:, etc.
  let scheme = url
    .split("://")
    .next()
    .unwrap_or("")
    .to_lowercase();
  
  let allowed_schemes = vec!["http", "https", "mailto"];
  
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
) -> Result<TauriFetchResponse, String> {
  // Parse and validate URL
  let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

  // Validate that a host is present — no SSRF blocking here (see comment above
  // the fetch_proxy function for the rationale).
  if parsed_url.host_str().is_none() {
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
    let _parsed_url = reqwest::Url::parse(url).map_err(|e| e.to_string())?;

    // No SSRF blocking here — same rationale as fetch_proxy: Reqly is a
    // desktop client, testing local/LAN APIs is a core use case.

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
    for mut request in server.incoming_requests() {
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
  if port < 1024 {
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
    .plugin(tauri_plugin_notification::init())
    .manage(websocket::manager::ConnectionManager::new())
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
    ])
    .setup(|app| {
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
