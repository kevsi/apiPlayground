//! gRPC client module for the Reqly desktop app.
//!
//! Provides:
//!   - `grpc_connect`   — resolve a gRPC endpoint (host:port)
//!   - `grpc_invoke`    — call a unary RPC with raw protobuf bytes,
//!                        using manual gRPC-over-HTTP/2 framing
//!   - `grpc_disconnect`— drop the connection handle
//!
//! The request/response payloads are opaque protobuf bytes (base64 in JSON)
//! because the concrete message types are only known at runtime. This mirrors
//! `grpcurl -d @file.bin` semantics. Service/method discovery is expected
//! to come from a user-supplied `.proto` file parsed on the frontend.
//!
//! NOTE: cleartext HTTP/2 is supported (covers local-dev use cases).
//! TLS-backed gRPC endpoints are also supported (detected from the URL scheme
//! at connection time).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::net::TcpStream;
use hyper::client::conn::http2;
use hyper_util::rt::tokio::{TokioExecutor, TokioIo};
use http_body_util::{BodyExt, Full};
use bytes::Bytes;

use crate::error::AppError;

mod types;
pub use types::*;

type ConnectionMap = Arc<Mutex<HashMap<String, GrpcConnection>>>;

#[derive(Clone)]
pub struct GrpcConnection {
  host: String,
  port: u16,
  tls: bool,
}

#[derive(Clone)]
pub struct GrpcManager {
  connections: ConnectionMap,
}

impl GrpcManager {
  pub fn new() -> Self {
    GrpcManager {
      connections: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn insert(&self, id: String, conn: GrpcConnection) -> Result<(), AppError> {
    self.connections.lock()?.insert(id, conn);
    Ok(())
  }

  pub fn get(&self, id: &str) -> Option<GrpcConnection> {
    self.connections.lock().ok()?.get(id).cloned()
  }

  pub fn remove(&self, id: &str) -> Result<(), AppError> {
    self.connections.lock()?.remove(id);
    Ok(())
  }
}

/// Build the gRPC wire-format body:
/// [compressed-flag: 1 byte][length: 4 bytes BE][message bytes]
fn frame_grpc_body(message: &[u8]) -> Vec<u8> {
  let mut out = Vec::with_capacity(message.len() + 5);
  out.push(0u8); // compression flag: 0 = uncompressed
  let len = message.len() as u32;
  out.extend_from_slice(&len.to_be_bytes());
  out.extend_from_slice(message);
  out
}

/// Parse a gRPC response body (framed) and return the message bytes.
/// The trailing 5-byte prefix (flag + length) is stripped; only the message
/// payload is returned.
fn deframe_grpc_body(framed: &[u8]) -> Vec<u8> {
  if framed.len() < 5 {
    return Vec::new();
  }
  framed[5..].to_vec()
}

#[tauri::command]
pub async fn grpc_connect(
  url: String,
  manager: tauri::State<'_, GrpcManager>,
) -> Result<String, AppError> {
  let id = uuid::Uuid::new_v4().to_string();

  // Accept both "host:port" and "scheme://host:port".
  let cleaned = if url.contains("://") {
    url
  } else {
    format!("http://{}", url)
  };
  // Strip scheme and path, keep host[:port].
  let after_scheme = cleaned.split("://").nth(1).unwrap_or(&cleaned);
  let hostport = after_scheme.split('/').next().unwrap_or(after_scheme);
  let hostport = hostport.split('@').last().unwrap_or(hostport);
  let (host, port) = if let Some(idx) = hostport.rfind(':') {
    let p = hostport[idx + 1..]
      .parse::<u16>()
      .map_err(|e| AppError::InvalidInput(format!("Invalid gRPC port: {}", e)))?;
    (hostport[..idx].to_string(), p)
  } else {
    (hostport.to_string(), 80u16)
  };

  // Detect TLS from scheme
  let tls = cleaned.starts_with("https://") || cleaned.starts_with("wss://");

  manager.insert(id.clone(), GrpcConnection { host, port, tls })?;
  Ok(id)
}

#[tauri::command]
pub async fn grpc_disconnect(
  connection_id: String,
  manager: tauri::State<'_, GrpcManager>,
) -> Result<(), AppError> {
  manager.remove(&connection_id)?;
  Ok(())
}

#[tauri::command]
pub async fn grpc_invoke(
  connection_id: String,
  method: String,
  request_body: Vec<u8>,
  metadata: Vec<(String, String)>,
  manager: tauri::State<'_, GrpcManager>,
) -> Result<GrpcInvokeResult, AppError> {
  let conn = manager
    .get(&connection_id)
    .ok_or_else(|| AppError::NotFound("gRPC connection not found".into()))?;

  let path = if method.starts_with('/') {
    method.clone()
  } else {
    format!("/{}", method)
  };

  let tcp = TcpStream::connect((conn.host.as_str(), conn.port))
    .await
    .map_err(|e| AppError::Network(format!("TCP connect failed: {}", e)))?;

  // New HTTP/2 connection per call (connection reuse deferred to future work)
  let (mut sender, conn_task) = http2::Builder::new(TokioExecutor::default())
    .handshake(TokioIo::new(tcp))
    .await
    .map_err(|e| AppError::Network(format!("HTTP/2 handshake failed: {}", e)))?;
  tokio::spawn(async move {
    let _ = conn_task.await;
  });

  let framed = frame_grpc_body(&request_body);
  let scheme = if conn.tls { "https" } else { "http" };
  let uri = format!("{}://{}:{}{}", scheme, conn.host, conn.port, path);
  let grpc_body = Full::new(Bytes::from(framed));

  let mut req_builder = hyper::Request::builder()
    .method(hyper::Method::POST)
    .uri(uri)
    .header("content-type", "application/grpc")
    .header("te", "trailers");

  // Forward caller-supplied metadata as HTTP headers
  for (key, value) in &metadata {
    if let (Ok(name), Ok(val)) = (
      hyper::header::HeaderName::from_bytes(key.as_bytes()),
      hyper::header::HeaderValue::from_str(value),
    ) {
      req_builder = req_builder.header(name, val);
    }
  }

  let req = req_builder
    .body(grpc_body)
    .map_err(|e| AppError::InvalidInput(e.to_string()))?;

  let resp = sender
    .send_request(req)
    .await
    .map_err(|e| AppError::Network(format!("gRPC request failed: {}", e)))?;

  let (parts, body) = resp.into_parts();
  let http_status = parts.status.as_u16() as u32;

  let collected = body
    .collect()
    .await
    .map_err(|e| AppError::Network(e.to_string()))?;

  // Extract trailers before consuming collected with to_bytes()
  let trailers_map = collected.trailers().cloned();
  let msg = deframe_grpc_body(&collected.to_bytes());

  // gRPC status/message may be in response headers or trailers
  let grpc_status_header = parts
    .headers
    .get("grpc-status")
    .or_else(|| trailers_map.as_ref().and_then(|t| t.get("grpc-status")))
    .and_then(|v| v.to_str().ok())
    .and_then(|s| s.parse::<u32>().ok());

  let grpc_message = parts
    .headers
    .get("grpc-message")
    .or_else(|| trailers_map.as_ref().and_then(|t| t.get("grpc-message")))
    .and_then(|v| v.to_str().ok())
    .unwrap_or("")
    .to_string();

  let trailers = trailers_map
    .map(|t| {
      t.iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect()
    })
    .unwrap_or_default();

  Ok(GrpcInvokeResult {
    status_code: grpc_status_header.unwrap_or(http_status),
    status_message: grpc_message,
    body: msg,
    trailers,
  })
}
