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
