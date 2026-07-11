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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn register_creates_connection_with_connecting_status() {
        let manager = ConnectionManager::new();
        let (_tx, _rx) = mpsc::channel::<WsCommand>(1);
        manager.register("conn-1".into(), _tx).await;

        let status = manager.get_status("conn-1").await;
        assert_eq!(status, Some(WsStatus::Connecting));
    }

    #[tokio::test]
    async fn unregister_removes_connection() {
        let manager = ConnectionManager::new();
        let (_tx, _rx) = mpsc::channel::<WsCommand>(1);
        manager.register("conn-1".into(), _tx).await;
        manager.unregister("conn-1").await;

        let status = manager.get_status("conn-1").await;
        assert!(status.is_none());
    }

    #[tokio::test]
    async fn get_sender_returns_none_for_unknown_id() {
        let manager = ConnectionManager::new();
        let sender = manager.get_sender("missing").await;
        assert!(sender.is_none());
    }

    #[tokio::test]
    async fn set_status_updates_existing_connection() {
        let manager = ConnectionManager::new();
        let (_tx, _rx) = mpsc::channel::<WsCommand>(1);
        manager.register("conn-1".into(), _tx).await;
        manager.set_status("conn-1", WsStatus::Connected).await;

        let status = manager.get_status("conn-1").await;
        assert_eq!(status, Some(WsStatus::Connected));
    }

    #[tokio::test]
    async fn set_status_is_noop_for_unknown_id() {
        let manager = ConnectionManager::new();
        manager.set_status("missing", WsStatus::Connected).await;
        // Should not panic; nothing to verify beyond that
    }

    #[tokio::test]
    async fn get_sender_clones_sender_for_existing_connection() {
        let manager = ConnectionManager::new();
        let (tx, _rx) = mpsc::channel::<WsCommand>(1);
        manager.register("conn-1".into(), tx).await;

        let sender = manager.get_sender("conn-1").await;
        assert!(sender.is_some());
    }
}
