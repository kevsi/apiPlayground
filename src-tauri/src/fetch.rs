//! HTTP fetch proxy used by the desktop client.
//!
//! This module owns:
//!   - `TauriFetchResponse` (returned to the frontend)
//!   - `SharedClient` (reqwest client shared across commands)
//!   - `fetch_proxy` (the Tauri command invoked from JS)
//!   - `decode_html_entities` (post-processing of text bodies)
//!
//! Binary responses (image/*, audio/*, video/*, font/*, application/pdf,
//! application/octet-stream, application/zip, application/gzip) are returned
//! as base64 in `body` with `encoding: "base64"`. Text responses are decoded
//! as UTF-8 with HTML entities unescaped.

use std::time::Instant;

use base64::{Engine as _, engine::general_purpose};
use serde::Serialize;
use tauri;

use crate::error::AppError;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriFetchResponse {
  pub status: u16,
  pub body: String,
  pub headers: Vec<(String, String)>,
  pub duration_ms: u64,
  pub encoding: String,
}

#[derive(Clone)]
pub struct SharedClient(pub reqwest::Client);

/// Decode common HTML entities in response bodies.
///
/// Some upstream servers/frameworks encode characters like ' → &#x27; in JSON.
pub fn decode_html_entities(text: &str) -> String {
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

fn is_binary_content_type(content_type: &str) -> bool {
  content_type.starts_with("image/")
    || content_type.starts_with("audio/")
    || content_type.starts_with("video/")
    || content_type.starts_with("font/")
    || content_type == "application/pdf"
    || content_type == "application/octet-stream"
    || content_type == "application/zip"
    || content_type == "application/gzip"
}

// Note: SSRF protection is intentionally absent from the desktop Tauri binary.
// Reqly is an API client (like Postman/Insomnia) that runs entirely on the
// user's own machine. Blocking localhost or LAN addresses would prevent the
// primary use-case: testing APIs that run locally or on a private network.
// The SSRF guard remains in place on the web-only Next.js proxy route
// (reqy-web/app/api/proxy/route.ts), which can be exposed publicly on Vercel.

#[tauri::command]
pub async fn fetch_proxy(
  method: String,
  url: String,
  headers: Vec<(String, String)>,
  body: Option<String>,
  client: tauri::State<'_, SharedClient>,
) -> Result<TauriFetchResponse, AppError> {
  // Parse and validate URL
  let parsed_url = reqwest::Url::parse(&url)
    .map_err(|e| AppError::InvalidInput(format!("Invalid URL: {}", e)))?;

  // Validate that a host is present — no SSRF blocking here (see module comment).
  if parsed_url.host_str().is_none() {
    return Err(AppError::InvalidInput("Invalid URL: missing host".into()));
  }
  let start = Instant::now();
  let mut request = client
    .0
    .request(method.parse::<reqwest::Method>().map_err(|e| AppError::InvalidInput(e.to_string()))?, &url);

  // Add headers
  let mut has_content_type = false;
  for (key, value) in headers {
    if key.eq_ignore_ascii_case("Content-Type") {
      has_content_type = true;
    }
    request = request.header(key, value);
  }

  // Force Content-Type if body and not already set
  if body.is_some() && !has_content_type {
    request = request.header("Content-Type", "application/json");
  }

  if let Some(body) = body {
    request = request.body(body);
  }

  let response = request.send().await?;
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

  let (body_str, encoding) = if is_binary_content_type(&content_type) {
    let bytes = response.bytes().await.map_err(|e| AppError::Network(e.to_string()))?;
    (general_purpose::STANDARD.encode(&bytes), "base64".to_string())
  } else {
    let text = response.text().await.map_err(|e| AppError::Network(e.to_string()))?;
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn decode_html_entities_returns_input_when_no_entities() {
    assert_eq!(decode_html_entities("plain text"), "plain text");
    assert_eq!(decode_html_entities(""), "");
  }

  #[test]
  fn decode_html_entities_decodes_common_entities() {
    assert_eq!(decode_html_entities("a &#x27; b"), "a ' b");
    assert_eq!(decode_html_entities("a &#39; b"), "a ' b");
    assert_eq!(decode_html_entities("a &apos; b"), "a ' b");
    assert_eq!(decode_html_entities("a &quot; b"), "a \" b");
    assert_eq!(decode_html_entities("a &#x22; b"), "a \" b");
    assert_eq!(decode_html_entities("&lt;tag&gt;"), "<tag>");
    assert_eq!(decode_html_entities("a &amp; b"), "a & b");
  }

  #[test]
  fn decode_html_entities_handles_json_payload() {
    let input = r#"{"name":"O&#x27;Brien"}"#;
    let expected = r#"{"name":"O'Brien"}"#;
    assert_eq!(decode_html_entities(input), expected);
  }

  #[test]
  fn decode_html_entities_does_not_touch_unknown_entities() {
    assert_eq!(decode_html_entities("a &unknown; b"), "a &unknown; b");
  }

  #[test]
  fn is_binary_content_type_classifies_correctly() {
    assert!(is_binary_content_type("image/png"));
    assert!(is_binary_content_type("image/jpeg"));
    assert!(is_binary_content_type("audio/mpeg"));
    assert!(is_binary_content_type("video/mp4"));
    assert!(is_binary_content_type("font/woff2"));
    assert!(is_binary_content_type("application/pdf"));
    assert!(is_binary_content_type("application/octet-stream"));
    assert!(is_binary_content_type("application/zip"));
    assert!(is_binary_content_type("application/gzip"));

    assert!(!is_binary_content_type("application/json"));
    assert!(!is_binary_content_type("text/html"));
    assert!(!is_binary_content_type(""));
  }
}
