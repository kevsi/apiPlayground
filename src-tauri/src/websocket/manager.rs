use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};

#[derive(Debug)]
pub enum WsCommand {
  Disconnect,
  SendMessage(String),
}

#[derive(Debug)]
pub struct ConnectionManager {
  inner: Arc<Mutex<HashMap<String, mpsc::SyncSender<WsCommand>>>>,
}

impl ConnectionManager {
  pub fn new() -> Self {
    Self {
      inner: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub fn register(&self, id: String, sender: mpsc::SyncSender<WsCommand>) {
    self.inner.lock().unwrap().insert(id, sender);
  }

  pub fn unregister(&self, id: &str) -> bool {
    self.inner.lock().unwrap().remove(id).is_some()
  }

  pub fn send_message(&self, id: &str, message: String) -> Result<(), String> {
    let lock = self.inner.lock().unwrap();
    let sender = lock.get(id).ok_or_else(|| "connection not found".to_string())?;
    sender.try_send(WsCommand::SendMessage(message)).map_err(|_| "send failed".to_string())
  }

  pub fn has_connection(&self, id: &str) -> bool {
    self.inner.lock().unwrap().contains_key(id)
  }

  pub fn get_status(&self, id: &str) -> Option<super::types::WsStatus> {
    if self.has_connection(id) {
      Some(super::types::WsStatus::Connecting)
    } else {
      None
    }
  }
}
