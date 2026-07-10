//! Capture proxy — a local HTTP proxy that intercepts requests, emits them
//! to the frontend via `captured-request` / `captured-request-updated` events,
//! then forwards them to the upstream server.
//!
//! The server is implemented with `tiny_http` and runs on a dedicated std
//! thread with its own tokio runtime (so it can call `reqwest::Client`
//! async methods via `rt.block_on`). A shutdown atomic flag is shared
//! between the proxy thread and the Tauri command that stops it.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Response, Server};
use uuid::Uuid;

use crate::error::AppError;
use crate::fetch::SharedClient;

#[derive(Default)]
pub struct CaptureProxyState {
  pub shutdown_flag: Option<Arc<AtomicBool>>,
  pub server_thread: Option<std::thread::JoinHandle<()>>,
}

pub type ManagedCaptureProxyState = Arc<Mutex<CaptureProxyState>>;

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
  pub fn from_http_request(
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
) -> Result<(u16, Vec<(String, String)>, String), AppError> {
  let _parsed_url = reqwest::Url::parse(url)
    .map_err(|e| AppError::InvalidInput(format!("Invalid URL: {}", e)))?;

  // No SSRF blocking here — same rationale as fetch_proxy: Reqly is a
  // desktop client, testing local/LAN APIs is a core use case.

  let mut request = client
    .request(method.parse::<reqwest::Method>().map_err(|e| AppError::InvalidInput(e.to_string()))?, url);

  for (key, value) in headers {
    request = request.header(key, value);
  }

  if let Some(b) = body {
    request = request.body(reqwest::Body::from(b.to_string()));
  }

  let response = request.send().await?;
  let status = response.status().as_u16();
  let resp_headers: Vec<(String, String)> = response
    .headers()
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
    .collect();
  let body_str = response.text().await.map_err(|e| AppError::Network(e.to_string()))?;

  Ok((status, resp_headers, body_str))
}

fn start_proxy_server(
  app_handle: AppHandle,
  port: u16,
  state: &ManagedCaptureProxyState,
  client: reqwest::Client,
) -> Result<(), AppError> {
  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  let server = Server::http(addr).map_err(|e| AppError::Network(format!("Failed to bind port {}: {}", port, e)))?;

  let shutdown_flag = Arc::new(AtomicBool::new(false));
  let flag_for_server = shutdown_flag.clone();

  {
    let mut guard = state.lock()?;
    guard.shutdown_flag = Some(shutdown_flag);
  }

  // Spawn the blocking proxy loop in a std thread with a dedicated runtime
  let handle = app_handle.clone();
  let server_handle = std::thread::spawn(move || {
    let rt = match tokio::runtime::Runtime::new() {
      Ok(r) => r,
      Err(e) => {
        eprintln!("[capture-proxy] failed to create tokio runtime: {}", e);
        return;
      }
    };
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
        let max_body: u64 = 10_485_760; // 10 MB cap
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        let mut buf: Vec<u8> = Vec::new();
        let reader = request.as_reader();
        let mut chunk = [0u8; 8192];
        loop {
          if buf.len() >= max_body as usize {
            eprintln!("[capture-proxy] request body exceeds 10 MB, truncating");
            break;
          }
          if std::time::Instant::now() > deadline {
            eprintln!("[capture-proxy] request body read timed out after 30s");
            break;
          }
          match reader.read(&mut chunk) {
            Ok(0) => break, // EOF
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(e) => {
              eprintln!("[capture-proxy] error reading request body: {}", e);
              break;
            }
          }
        }
        if !buf.is_empty() {
          body_bytes = Some(buf);
        }
      }

      let body_str = body_bytes.as_ref().map(|b| String::from_utf8_lossy(b).to_string());

      // Emit "captured" event (before forwarding)
      let mut captured =
        CapturedRequest::from_http_request(&method, &full_url, &req_headers, body_str.clone());

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
          captured.error = Some(e.to_string());
          captured.duration_ms = Some(start.elapsed().as_millis() as u64);
          let _ = handle.emit("captured-request-updated", &captured);
          let _ = request.respond(
            Response::from_string(format!("Proxy error: {}", e))
              .with_status_code(502)
              .with_header(
                tiny_http::Header::from_bytes(
                  "Content-Type".as_bytes(),
                  "text/plain".as_bytes(),
                )
                .unwrap(),
              ),
          );
          continue;
        }
      };

      captured.status = Some(status);
      captured.response_headers = resp_headers.clone();
      captured.response_body = resp_body.clone();
      captured.duration_ms = Some(start.elapsed().as_millis() as u64);

      let _ = handle.emit("captured-request-updated", &captured);

      // Build tiny_http response headers — filter out invalid header entries
      // instead of unwrapping (which would panic the proxy thread).
      let http_resp_headers: Vec<Header> = resp_headers
        .unwrap_or_default()
        .iter()
        .filter(|(k, _)| !k.eq_ignore_ascii_case("transfer-encoding"))
        .filter(|(k, _)| !k.eq_ignore_ascii_case("content-encoding"))
        .filter_map(|(k, v)| {
          Header::from_bytes(k.as_bytes(), v.as_bytes()).ok()
        })
        .collect();

      let _ = request.respond({
        let mut response = Response::from_string(resp_body.unwrap_or_default()).with_status_code(status);
        for header in http_resp_headers {
          response = response.with_header(header);
        }
        response
      });
    }
  });

  let mut guard = state.lock()?;
  guard.server_thread = Some(server_handle);

  Ok(())
}

#[tauri::command]
pub fn start_capture_proxy(
  app_handle: AppHandle,
  port: u16,
  state: tauri::State<'_, ManagedCaptureProxyState>,
  client: tauri::State<'_, SharedClient>,
) -> Result<(), AppError> {
  if port < 1024 {
    return Err(AppError::InvalidInput("Port must be between 1024 and 65535".into()));
  }

  {
    let guard = state.lock()?;
    if guard.shutdown_flag.is_some() {
      return Err(AppError::AlreadyRunning("Capture proxy is already running".into()));
    }
  }

  start_proxy_server(app_handle, port, &state, client.0.clone())
}

#[tauri::command]
pub fn stop_capture_proxy(state: tauri::State<'_, ManagedCaptureProxyState>) -> Result<(), AppError> {
  let mut guard = state.lock()?;
  if let Some(flag) = guard.shutdown_flag.take() {
    flag.store(true, Ordering::SeqCst);
    if let Some(handle) = guard.server_thread.take() {
      // Release the mutex before joining so the thread can acquire it if needed.
      drop(guard);
      // Poll the thread handle with a 2-second timeout.
      // The proxy thread checks `shutdown_flag` on each iteration so it should
      // terminate quickly, but we don't want to block the UI indefinitely if
      // the thread is stuck (e.g. blocked on a slow upstream read).
      let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
      loop {
        if handle.is_finished() {
          match handle.join() {
            Ok(_) => break Ok(()),
            Err(_) => {
              eprintln!("[capture-proxy] proxy thread panicked");
              break Ok(());
            }
          }
        }
        if std::time::Instant::now() >= deadline {
          // Detach — the thread will exit on its next flag check.
          break Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
      }
    } else {
      Ok(())
    }
  } else {
    Err(AppError::NotRunning("Capture proxy is not running".into()))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn hdrs() -> Vec<(String, String)> {
    vec![("Content-Type".to_string(), "application/json".to_string())]
  }

  #[test]
  fn captured_request_has_unique_id() {
    let a = CapturedRequest::from_http_request("GET", "http://x", &hdrs(), None);
    let b = CapturedRequest::from_http_request("GET", "http://x", &hdrs(), None);
    assert_ne!(a.id, b.id);
    assert!(a.id.starts_with("cap-"));
  }

  #[test]
  fn captured_request_copies_method_url_headers() {
    let r = CapturedRequest::from_http_request("POST", "http://example.com/api", &hdrs(), Some("{}".to_string()));
    assert_eq!(r.method, "POST");
    assert_eq!(r.url, "http://example.com/api");
    assert_eq!(r.headers.len(), 1);
    assert_eq!(r.body.as_deref(), Some("{}"));
    assert!(r.status.is_none());
    assert!(r.error.is_none());
  }

  #[test]
  fn captured_request_timestamp_is_recent() {
    let before = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_millis() as u64;
    let r = CapturedRequest::from_http_request("GET", "http://x", &hdrs(), None);
    let after = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_millis() as u64;
    assert!(r.timestamp >= before);
    assert!(r.timestamp <= after);
  }

  #[test]
  fn capture_proxy_state_default_has_no_resources() {
    let state = CaptureProxyState::default();
    assert!(state.shutdown_flag.is_none());
    assert!(state.server_thread.is_none());
  }
}
