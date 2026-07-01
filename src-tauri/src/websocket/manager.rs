use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use super::types::WsStatus;

pub enum WsCommand {
    Send(String),
    Close,
}

pub struct ConnectionHandle {
    pub sender: tokio::sync::mpsc::Sender<WsCommand>,
    pub status: WsStatus,
}

pub struct ConnectionManager {
    connections: Arc<Mutex<HashMap<String, ConnectionHandle>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register(&self, id: String, sender: tokio::sync::mpsc::Sender<WsCommand>) {
        let mut map = self.connections.lock().await;
        map.insert(id, ConnectionHandle {
            sender,
            status: WsStatus::Connecting,
        });
    }

    pub async fn unregister(&self, id: &str) {
        let mut map = self.connections.lock().await;
        map.remove(id);
    }

    pub async fn get_sender(&self, id: &str) -> Option<tokio::sync::mpsc::Sender<WsCommand>> {
        let map = self.connections.lock().await;
        map.get(id).map(|h| h.sender.clone())
    }

    pub async fn set_status(&self, id: &str, status: WsStatus) {
        let mut map = self.connections.lock().await;
        if let Some(handle) = map.get_mut(id) {
            handle.status = status;
        }
    }

    pub async fn get_status(&self, id: &str) -> Option<WsStatus> {
        let map = self.connections.lock().await;
        map.get(id).map(|h| h.status.clone())
    }
}
