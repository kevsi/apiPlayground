use std::collections::HashMap;
use std::str::FromStr;
use http::{HeaderName, HeaderValue};
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tokio_tungstenite::tungstenite::Message;
use tokio::net::TcpStream;
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::websocket::manager::{ConnectionManager, WsCommand};
use crate::websocket::types::*;

#[tauri::command]
pub async fn ws_connect(
    url: String,
    headers: HashMap<String, String>,
    app_handle: AppHandle,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<String, String> {
    let connection_id = Uuid::new_v4().to_string();

    // Validate URL format, then build a tungstenite::Request (= http::Request<()>)
    // so we can attach custom headers before connecting.
    let _validated = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let mut request = http::Request::builder()
        .uri(&url)
        .body(())
        .map_err(|e| format!("Failed to build request: {}", e))?;

    for (k, v) in &headers {
        let name = HeaderName::from_str(k).map_err(|e| format!("Invalid header name '{}': {}", k, e))?;
        let value = HeaderValue::from_str(v).map_err(|e| format!("Invalid header value for '{}': {}", k, e))?;
        request.headers_mut().append(name, value);
    }

    let (ws_stream, _) = connect_async(request)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    manager.set_status(&connection_id, WsStatus::Connected).await;

    let _ = app_handle.emit("ws://status", WsStatusPayload {
        connection_id: connection_id.clone(),
        status: WsStatus::Connected,
        reason: None,
    });

    let conn_id = connection_id.clone();
    let handle = app_handle.clone();

    let (tx, mut rx) = tokio::sync::mpsc::channel::<WsCommand>(256);
    manager.register(connection_id.clone(), tx).await;

    tokio::spawn(async move {
        if let Err(e) = run_ws_loop(ws_stream, &mut rx, &conn_id, &handle).await {
            let _ = handle.emit("ws://error", WsErrorPayload {
                connection_id: conn_id.clone(),
                message: e.to_string(),
            });
        }
    });

    Ok(connection_id)
}

async fn run_ws_loop(
    ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
    rx: &mut tokio::sync::mpsc::Receiver<WsCommand>,
    connection_id: &str,
    app_handle: &AppHandle,
) -> Result<(), String> {
    let (mut write, mut read) = ws_stream.split();
    let conn_id = connection_id.to_string();
    let handle = app_handle.clone();

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let _ = handle.emit("ws://message", WsMessagePayload {
                            connection_id: conn_id.clone(),
                            direction: "received".to_string(),
                            content: text,
                            timestamp: chrono::Utc::now().timestamp_millis(),
                        });
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let reason = frame.as_ref().and_then(|f| {
                            if f.reason.is_empty() { None } else { Some(f.reason.to_string()) }
                        });
                        let _ = handle.emit("ws://status", WsStatusPayload {
                            connection_id: conn_id.clone(),
                            status: WsStatus::Disconnected,
                            reason,
                        });
                        break;
                    }
                    Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Frame(_))) => {} // raw frame — not processed
                    Some(Err(e)) => {
                        let _ = handle.emit("ws://error", WsErrorPayload {
                            connection_id: conn_id.clone(),
                            message: e.to_string(),
                        });
                        break;
                    }
                    None => break,
                }
            }
            cmd = rx.recv() => {
                match cmd {
                    Some(WsCommand::Send(text)) => {
                        if let Err(e) = write.send(Message::Text(text)).await {
                            let _ = handle.emit("ws://error", WsErrorPayload {
                                connection_id: conn_id.clone(),
                                message: e.to_string(),
                            });
                            break;
                        }
                    }
                    Some(WsCommand::Close) | None => {
                        let _ = write.send(Message::Close(None)).await;
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn ws_send(
    connection_id: String,
    message: String,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<(), String> {
    let sender = manager.get_sender(&connection_id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;

    sender.send(WsCommand::Send(message))
        .await
        .map_err(|e| format!("Send failed: {}", e))
}

#[tauri::command]
pub async fn ws_disconnect(
    connection_id: String,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<(), String> {
    let sender = manager.get_sender(&connection_id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;

    manager.set_status(&connection_id, WsStatus::Disconnecting).await;
    sender.send(WsCommand::Close)
        .await
        .map_err(|e| format!("Disconnect failed: {}", e))?;
    manager.unregister(&connection_id).await;

    Ok(())
}

#[tauri::command]
pub async fn ws_get_status(
    connection_id: String,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<WsStatus, String> {
    manager.get_status(&connection_id)
        .await
        .ok_or_else(|| "Connection not found".to_string())
}
