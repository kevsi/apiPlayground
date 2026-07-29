use crate::websocket::manager::ConnectionManager;
use crate::websocket::types::WsStatus;
use tauri::State;

pub fn ws_send_manager(
  id: String,
  message: String,
  manager: &ConnectionManager,
) -> Result<(), String> {
  manager.send_message(&id, message)
}

pub fn ws_send(
  id: String,
  message: String,
  manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
  ws_send_manager(id, message, &manager)
}

pub fn ws_disconnect_manager(
  id: String,
  manager: &ConnectionManager,
) -> Result<(), String> {
  if manager.unregister(&id) {
    Ok(())
  } else {
    Err("connection not found".to_string())
  }
}

pub fn ws_disconnect(
  id: String,
  manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
  ws_disconnect_manager(id, &manager)
}

pub fn ws_get_status_manager(
  id: String,
  manager: &ConnectionManager,
) -> Result<WsStatus, String> {
  if manager.has_connection(&id) {
    Ok(WsStatus::Connecting)
  } else {
    Err("connection not found".to_string())
  }
}

pub fn ws_get_status(
  id: String,
  manager: State<'_, ConnectionManager>,
) -> Result<WsStatus, String> {
  ws_get_status_manager(id, &manager)
}
