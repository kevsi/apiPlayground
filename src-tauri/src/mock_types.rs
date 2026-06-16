use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRouteRateLimit {
    pub enabled: bool,
    pub max_requests: u32,
    pub window_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRouteVariant {
    pub id: String,
    pub name: String,
    pub weight: u32,
    pub response_status: u16,
    pub response_headers: HashMap<String, String>,
    pub response_body: String,
    pub content_type: String,
    pub delay: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub id: String,
    pub name: String,
    pub method: String,
    pub path_pattern: String,
    pub response_status: u16,
    pub response_headers: HashMap<String, String>,
    pub response_body: String,
    pub content_type: String,
    pub delay: u64,
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collection_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<MockRouteRateLimit>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<MockRouteVariant>>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriMockResponse {
    pub status: u16,
    pub body: String,
    pub headers: Vec<(String, String)>,
    pub duration_ms: u128,
    pub encoding: String,
    pub mocked: bool,
}
