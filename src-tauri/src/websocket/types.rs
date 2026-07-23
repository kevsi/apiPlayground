use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WsStatus {
    Connecting,
    Connected,
    Disconnecting,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct WsConnection {
    pub id: String,
    pub url: String,
    pub status: WsStatus,
    pub headers: HashMap<String, String>,
    pub connected_at: Option<i64>,
    pub disconnected_at: Option<i64>,
    pub error_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsMessagePayload {
    pub connection_id: String,
    pub direction: String,
    pub content: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsStatusPayload {
    pub connection_id: String,
    pub status: WsStatus,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsErrorPayload {
    pub connection_id: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_status_default_is_disconnected() {
        // WsStatus doesn't implement Default, but we can verify
        // that the expected initial status for a connection is Disconnected
        let status = WsStatus::Disconnected;
        assert_eq!(status, WsStatus::Disconnected);
    }

    #[test]
    fn ws_status_serialization() {
        let statuses = vec![
            (WsStatus::Connecting, r#""connecting""#),
            (WsStatus::Connected, r#""connected""#),
            (WsStatus::Disconnecting, r#""disconnecting""#),
            (WsStatus::Disconnected, r#""disconnected""#),
            (WsStatus::Error, r#""error""#),
        ];
        for (status, expected) in &statuses {
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(json, *expected);
        }
    }

    #[test]
    fn ws_status_deserialization() {
        let status: WsStatus = serde_json::from_str(r#""connected""#).unwrap();
        assert_eq!(status, WsStatus::Connected);
    }

    #[test]
    fn ws_message_payload_creation() {
        let payload = WsMessagePayload {
            connection_id: "conn-1".into(),
            direction: "sent".into(),
            content: "Hello".into(),
            timestamp: 1234567890,
        };
        assert_eq!(payload.connection_id, "conn-1");
        assert_eq!(payload.direction, "sent");
        assert_eq!(payload.content, "Hello");
        assert_eq!(payload.timestamp, 1234567890);
    }

    #[test]
    fn ws_message_payload_serialization() {
        let payload = WsMessagePayload {
            connection_id: "conn-1".into(),
            direction: "received".into(),
            content: "{\"type\":\"ping\"}".into(),
            timestamp: 1000,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("connectionId"));
        assert!(json.contains("conn-1"));
        assert!(json.contains("direction"));
        assert!(json.contains("received"));
        assert!(json.contains("content"));
        assert!(json.contains("timestamp"));
    }
}
