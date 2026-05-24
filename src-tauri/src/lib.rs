use base64::{Engine as _, engine::general_purpose};
use reqwest::blocking::Client;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use dirs::data_dir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TauriFetchResponse {
  status: u16,
  body: String,
  headers: Vec<(String, String)>,
  duration_ms: u128,
  encoding: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredTabs {
  tabs: serde_json::Value,
  active_tab_id: String,
}

fn parse_state_path() -> Result<PathBuf, String> {
  let dir = data_dir().ok_or_else(|| "Unable to find data directory".to_string())?;
  let dir = dir.join("zendeeps");
  let path = dir.join("request-tabs-state.json");
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  Ok(path)
}

#[tauri::command]
fn save_tabs_state(state: StoredTabs) -> Result<(), String> {
  let path = parse_state_path()?;
  let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
  fs::write(path, json).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn load_tabs_state() -> Result<Option<StoredTabs>, String> {
  let path = parse_state_path()?;
  if !path.exists() {
    return Ok(None);
  }
  let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
  let state = serde_json::from_str(&data).map_err(|e| e.to_string())?;
  Ok(Some(state))
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
fn fetch_proxy(
  method: String,
  url: String,
  headers: Vec<(String, String)>,
  body: Option<String>,
) -> Result<TauriFetchResponse, String> {
  let start = Instant::now();
  let client = Client::new();

  let mut request = client
    .request(method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, &url);

  for (key, value) in headers {
    request = request.header(key, value);
  }

  if let Some(body) = body {
    request = request.body(body);
  }

  let response = request.send().map_err(|e| e.to_string())?;
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
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    (general_purpose::STANDARD.encode(&bytes), "base64".to_string())
  } else {
    (response.text().map_err(|e| e.to_string())?, "utf8".to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![fetch_proxy, load_tabs_state, save_tabs_state, export_json])
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
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
