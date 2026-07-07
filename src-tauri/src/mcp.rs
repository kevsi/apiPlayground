use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

const MCP_BUNDLE_FILE: &str = "_mcp_bundle.json";
const MCP_DEFAULT_PORT: u16 = 3311;

#[derive(Default)]
pub struct McpProcessState {
  process: Option<Child>,
  port: Option<u16>,
}

pub type ManagedMcpState = Arc<Mutex<McpProcessState>>;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
  pub running: bool,
  pub port: Option<u16>,
  pub pid: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
  pub port: Option<u16>,
  pub env_name: Option<String>,
  pub allow_local_hosts: bool,
  pub max_response_size: Option<usize>,
}

impl Default for McpServerConfig {
  fn default() -> Self {
    Self {
      port: None,
      env_name: None,
      allow_local_hosts: false,
      max_response_size: None,
    }
  }
}

#[tauri::command]
pub fn start_mcp_server(
  app: AppHandle,
  bundle_json: String,
  config: Option<McpServerConfig>,
  mcp_state: tauri::State<'_, ManagedMcpState>,
) -> Result<String, String> {
  let mut state = mcp_state.lock().map_err(|e| e.to_string())?;

  if let Some(ref mut process) = state.process {
    match process.try_wait() {
      Ok(None) => return Err("MCP server is already running".to_string()),
      Ok(Some(_)) => {}
      Err(_) => {}
    }
  }

  let bundle_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
  std::fs::create_dir_all(&bundle_dir).map_err(|e| e.to_string())?;
  let bundle_path = bundle_dir.join(MCP_BUNDLE_FILE);

  {
    let mut file = std::fs::File::create(&bundle_path).map_err(|e| e.to_string())?;
    file
      .write_all(bundle_json.as_bytes())
      .map_err(|e| e.to_string())?;
  }

  let script_path = resolve_script_path(&app)?;
  let cfg = config.unwrap_or_default();
  let server_port = cfg.port.unwrap_or(MCP_DEFAULT_PORT);

  let node = if cfg!(target_os = "windows") {
    "node.exe"
  } else {
    "node"
  };

  // Ensure node is available before spawning
  if Command::new(node).arg("--version").output().is_err() {
    return Err(format!(
      "Node.js runtime not found: {}. Please install Node.js to use the MCP server.",
      node
    ));
  }

  let mut cmd = Command::new(node);
  cmd
    .arg(&script_path)
    .arg("--file")
    .arg(&bundle_path)
    .arg("--port")
    .arg(server_port.to_string())
    .arg("--timeout")
    .arg("30000");

  if cfg.allow_local_hosts {
    cmd.arg("--allow-local-hosts");
  }

  if let Some(size) = cfg.max_response_size {
    cmd.arg("--max-response-size").arg(size.to_string());
  }

  if let Some(env_name) = cfg.env_name {
    cmd.arg("--env").arg(env_name);
  }

  // In dev mode, inherit stderr so we can see logs
  if cfg!(debug_assertions) {
    cmd.stderr(std::process::Stdio::inherit());
  } else {
    // Redirect stderr to null to prevent the child from blocking if the pipe fills up.
    // In a future enhancement we could stream stderr to a Tauri event.
    cmd.stderr(std::process::Stdio::null());
  }
  cmd.stdout(std::process::Stdio::piped());

  let mut child = cmd.spawn().map_err(|e| format!("Failed to start MCP server: {}", e))?;

  // Drain a small amount of stdout to confirm the process started; then drop the handle.
  if let Some(ref mut stdout) = child.stdout {
    let mut buf = [0u8; 1];
    let _ = stdout.read(&mut buf);
  }

  let pid = child.id();
  state.process = Some(child);
  state.port = Some(server_port);

  let _ = app.emit(
    "mcp-status",
    McpServerStatus {
      running: true,
      port: Some(server_port),
      pid: Some(pid),
    },
  );

  Ok(format!("MCP server started on port {} (PID: {})", server_port, pid))
}

#[tauri::command]
pub fn stop_mcp_server(
  app: AppHandle,
  mcp_state: tauri::State<'_, ManagedMcpState>,
) -> Result<String, String> {
  let mut state = mcp_state.lock().map_err(|e| e.to_string())?;

  match state.process.take() {
    Some(mut child) => {
      let _ = child.kill();

      // Wait for the process with a timeout to avoid hanging if the child ignores SIGTERM.
      let start = std::time::Instant::now();
      loop {
        match child.try_wait() {
          Ok(Some(_)) => break,
          Ok(None) if start.elapsed().as_secs() < 5 => {
            std::thread::sleep(std::time::Duration::from_millis(50));
          }
          _ => {
            let _ = child.kill();
            break;
          }
        }
      }

      state.port = None;

      let _ = app.emit(
        "mcp-status",
        McpServerStatus {
          running: false,
          port: None,
          pid: None,
        },
      );

      Ok("MCP server stopped".to_string())
    }
    None => Err("MCP server is not running".to_string()),
  }
}

#[tauri::command]
pub fn get_mcp_server_status(
  mcp_state: tauri::State<'_, ManagedMcpState>,
) -> Result<McpServerStatus, String> {
  let mut state = mcp_state.lock().map_err(|e| e.to_string())?;

  let (running, pid) = match state.process.as_mut() {
    Some(process) => match process.try_wait() {
      Ok(None) => (true, Some(process.id())),
      _ => {
        // Process exited, clean up
        state.port = None;
        (false, None)
      }
    },
    None => (false, None),
  };

  Ok(McpServerStatus {
    running,
    port: state.port,
    pid,
  })
}

/// Returns the path to the MCP bundle file.
fn mcp_bundle_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  let bundle_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
  Ok(bundle_dir.join(MCP_BUNDLE_FILE))
}

/// Read the MCP bundle file and return its JSON content.
#[tauri::command]
pub fn read_mcp_bundle(
  app: AppHandle,
) -> Result<String, String> {
  let bundle_path = mcp_bundle_path(&app)?;
  if !bundle_path.exists() {
    return Ok(String::new());
  }
  std::fs::read_to_string(&bundle_path).map_err(|e| e.to_string())
}

/// Read collections from the MCP bundle and emit them to the frontend.
/// The frontend should listen for "mcp-sync-collections" events.
#[tauri::command]
pub fn sync_mcp_collections(
  app: AppHandle,
) -> Result<(), String> {
  let bundle_path = mcp_bundle_path(&app)?;
  if !bundle_path.exists() {
    return Ok(());
  }

  let content = std::fs::read_to_string(&bundle_path).map_err(|e| e.to_string())?;
  let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
  let _ = app.emit("mcp-sync-collections", &parsed);

  Ok(())
}

/// Locate the reqy-mcp `dist/index.js` script.
fn resolve_script_path(app: &AppHandle) -> Result<String, String> {
  let candidates: Vec<std::path::PathBuf> = if cfg!(debug_assertions) {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    vec![
      cwd.join("reqy-mcp").join("dist").join("index.js"),
      cwd.join("..").join("reqy-mcp").join("dist").join("index.js"),
      cwd.join("..\\reqy-mcp\\dist\\index.js").into(),
    ]
  } else {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    vec![
      resource_dir.join("reqy-mcp").join("dist").join("index.js"),
    ]
  };

  for p in &candidates {
    if p.exists() {
      return Ok(p.to_string_lossy().to_string());
    }
  }

  Err(format!(
    "reqy-mcp script not found (tried: {})",
    candidates
      .iter()
      .map(|p| p.display().to_string())
      .collect::<Vec<_>>()
      .join(", ")
  ))
}
