//! Shared types for the gRPC module.

use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GrpcMethodInfo {
  pub name: String,
  pub service: String,
  pub method: String,
  pub client_streaming: bool,
  pub server_streaming: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GrpcReflectionResult {
  pub services: Vec<String>,
  pub methods: Vec<GrpcMethodInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GrpcInvokeResult {
  pub status_code: u32,
  pub status_message: String,
  /// Raw protobuf response bytes.
  pub body: Vec<u8>,
  pub trailers: Vec<(String, String)>,
}
