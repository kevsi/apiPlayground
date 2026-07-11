use std::collections::HashMap;
use std::str::FromStr;
use http::{HeaderName, HeaderValue};
use tokio_tungstenite::{connect_async};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{Sink, SinkExt, Stream, StreamExt};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::AppError;
use crate::websocket::manager::{ConnectionManager, WsCommand};
use crate::websocket::types::*;

#[tauri::command]
pub async fn ws_connect(
    url: String,
    headers: HashMap<String, String>,
    app_handle: AppHandle,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<String, AppError> {
    let connection_id = Uuid::new_v4().to_string();

    // Build a proper tungstenite request via IntoClientRequest, which
    // automatically sets the required WebSocket handshake headers
    // (Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Host).
    // Using http::Request::builder() would produce a bare request WITHOUT
    // these mandatory headers, causing the server to reject the handshake
    // with "Missing, duplicated or incorrect header sec-websocket-key".
    let mut request = url
        .into_client_request()
        .map_err(|e| AppError::InvalidInput(format!("Invalid WebSocket URL: {}", e)))?;

    // Merge custom headers on top of the properly-built request.
    for (k, v) in &headers {
        let name = HeaderName::from_str(k).map_err(|e| AppError::InvalidInput(format!("Invalid header name '{}': {}", k, e)))?;
        let value = HeaderValue::from_str(v).map_err(|e| AppError::InvalidInput(format!("Invalid header value for '{}': {}", k, e)))?;
        request.headers_mut().append(name, value);
    }

    let (ws_stream, _) = connect_async(request)
        .await
        .map_err(|e| AppError::Network(format!("Connection failed: {}", e)))?;

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

    // Split the stream before moving halves into the spawned task.
    let (ws_write, ws_read) = ws_stream.split();

    tokio::spawn(async move {
        let handler = handle.clone();
        if let Err(e) = run_ws_loop(ws_read, ws_write, &mut rx, &conn_id, handler).await {
            let _ = handle.emit("ws://error", WsErrorPayload {
                connection_id: conn_id.clone(),
                message: e.to_string(),
            });
        }
    });

    Ok(connection_id)
}

// ─── Event emission trait (production + test) ──────────────────────────────

trait WsEventTarget: Send + Sync {
    fn emit_message(&self, connection_id: &str, content: String);
    fn emit_status(&self, connection_id: &str, status: WsStatus, reason: Option<String>);
    fn emit_error(&self, connection_id: &str, message: String);
}

impl WsEventTarget for AppHandle {
    fn emit_message(&self, connection_id: &str, content: String) {
        let _ = self.emit("ws://message", WsMessagePayload {
            connection_id: connection_id.to_string(),
            direction: "received".to_string(),
            content,
            timestamp: chrono::Utc::now().timestamp_millis(),
        });
    }
    fn emit_status(&self, connection_id: &str, status: WsStatus, reason: Option<String>) {
        let _ = self.emit("ws://status", WsStatusPayload {
            connection_id: connection_id.to_string(),
            status,
            reason,
        });
    }
    fn emit_error(&self, connection_id: &str, message: String) {
        let _ = self.emit("ws://error", WsErrorPayload {
            connection_id: connection_id.to_string(),
            message,
        });
    }
}

async fn run_ws_loop<R, W, E, H>(
    mut read: R,
    mut write: W,
    rx: &mut tokio::sync::mpsc::Receiver<WsCommand>,
    connection_id: &str,
    handler: H,
) -> Result<(), String>
where
    R: Stream<Item = Result<Message, E>> + Unpin,
    W: Sink<Message> + Unpin,
    E: std::fmt::Display,
    W::Error: std::fmt::Display,
    H: WsEventTarget,
{
    let conn_id = connection_id.to_string();

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handler.emit_message(&conn_id, text);
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let reason = frame.as_ref().and_then(|f| {
                            if f.reason.is_empty() { None } else { Some(f.reason.to_string()) }
                        });
                        handler.emit_status(&conn_id, WsStatus::Disconnected, reason);
                        break;
                    }
                    Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Frame(_))) => {}
                    Some(Err(e)) => {
                        handler.emit_error(&conn_id, e.to_string());
                        break;
                    }
                    None => break,
                }
            }
            cmd = rx.recv() => {
                match cmd {
                    Some(WsCommand::Send(text)) => {
                        if let Err(e) = write.send(Message::Text(text)).await {
                            handler.emit_error(&conn_id, format!("Send failed: {}", e));
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
) -> Result<(), AppError> {
    let sender = manager.get_sender(&connection_id)
        .await
        .ok_or_else(|| AppError::NotFound("Connection not found".into()))?;

    sender.send(WsCommand::Send(message))
        .await
        .map_err(|e| AppError::Network(format!("Send failed: {}", e)))
}

#[tauri::command]
pub async fn ws_disconnect(
    connection_id: String,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<(), AppError> {
    let sender = manager.get_sender(&connection_id)
        .await
        .ok_or_else(|| AppError::NotFound("Connection not found".into()))?;

    manager.set_status(&connection_id, WsStatus::Disconnecting).await;
    sender.send(WsCommand::Close)
        .await
        .map_err(|e| AppError::Network(format!("Disconnect failed: {}", e)))?;
    manager.unregister(&connection_id).await;

    Ok(())
}

#[tauri::command]
pub async fn ws_get_status(
    connection_id: String,
    manager: tauri::State<'_, ConnectionManager>,
) -> Result<WsStatus, AppError> {
    manager.get_status(&connection_id)
        .await
        .ok_or_else(|| AppError::NotFound("Connection not found".into()))
}

// ─── Pure-Rust `run_ws_loop` tests (no Tauri required) ──────────────────────

#[cfg(test)]
mod run_ws_loop_tests {
    use super::*;
    use std::pin::Pin;
    use std::sync::{Arc, Mutex};
    use std::task::{Context, Poll};
    use tokio::sync::mpsc;

    // ── Fake emitter ─────────────────────────────────────────────────────────

    #[derive(Clone, Default)]
    struct FakeEmitter {
        pub messages: Arc<Mutex<Vec<(String, String)>>>,
        pub statuses: Arc<Mutex<Vec<(String, WsStatus, Option<String>)>>>,
        pub errors: Arc<Mutex<Vec<(String, String)>>>,
    }

    impl WsEventTarget for FakeEmitter {
        fn emit_message(&self, connection_id: &str, content: String) {
            self.messages.lock().unwrap().push((connection_id.to_string(), content));
        }
        fn emit_status(&self, connection_id: &str, status: WsStatus, reason: Option<String>) {
            self.statuses
                .lock()
                .unwrap()
                .push((connection_id.to_string(), status, reason));
        }
        fn emit_error(&self, connection_id: &str, message: String) {
            self.errors
                .lock()
                .unwrap()
                .push((connection_id.to_string(), message));
        }
    }

    // ── Mock sink ────────────────────────────────────────────────────────────

    #[derive(Clone, Default)]
    struct MockSink {
        sent_text: Arc<Mutex<Vec<String>>>,
        sent_close: Arc<Mutex<bool>>,
    }

    impl Sink<Message> for MockSink {
        type Error = String;

        fn poll_ready(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }

        fn start_send(self: Pin<&mut Self>, msg: Message) -> Result<(), Self::Error> {
            match msg {
                Message::Text(text) => self.sent_text.lock().unwrap().push(text),
                Message::Close(_) => *self.sent_close.lock().unwrap() = true,
                _ => {}
            }
            Ok(())
        }

        fn poll_flush(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }

        fn poll_close(
            self: Pin<&mut Self>,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    // Stream-driven tests: run_ws_loop is fed by a real Stream. We keep `tx` alive
    // with no enqueued commands, so `rx.recv()` stays Pending and never races.
    async fn drive_stream_only(
        items: Vec<Result<Message, String>>,
    ) -> (FakeEmitter, Arc<Mutex<Vec<String>>>, Arc<Mutex<bool>>) {
        let emitter = FakeEmitter::default();
        let sink = MockSink::default();
        use futures_util::stream;
        let msg_stream = stream::iter(items);
        let (tx, mut rx) = mpsc::channel::<WsCommand>(16);

        let _ = run_ws_loop(msg_stream, sink.clone(), &mut rx, "conn-1", emitter.clone()).await;
        drop(tx); // hygiene

        (emitter, sink.sent_text, sink.sent_close)
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn emits_ws_message_on_received_text() {
        let (emitter, _, _) = drive_stream_only(vec![
            Ok(Message::Text("hello".into())),
            Ok(Message::Close(None)),
        ])
        .await;

        let msgs = emitter.messages.lock().unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].0, "conn-1");
        assert_eq!(msgs[0].1, "hello");
    }

    #[tokio::test]
    async fn emits_status_on_close_frame() {
        let frame = tokio_tungstenite::tungstenite::protocol::CloseFrame {
            code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Normal,
            reason: "bye".into(),
        };
        let (emitter, _, _) = drive_stream_only(vec![Ok(Message::Close(Some(frame)))]).await;

        let statuses = emitter.statuses.lock().unwrap();
        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].0, "conn-1");
        assert_eq!(statuses[0].1, WsStatus::Disconnected);
        assert_eq!(statuses[0].2, Some("bye".to_string()));
    }

    #[tokio::test]
    async fn emits_error_on_read_error() {
        let (emitter, _, _) = drive_stream_only(vec![Err("boom".into())]).await;

        let errors = emitter.errors.lock().unwrap();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].0, "conn-1");
        assert!(errors[0].1.contains("boom"));
    }

    #[tokio::test]
    async fn sends_text_on_send_command() {
        use futures_util::stream;
        let emitter = FakeEmitter::default();
        let sink = MockSink::default();
        // Forever-pending stream: `read.next()` never wins — only commands do.
        let msg_stream = stream::pending::<Result<Message, String>>();
        let (tx, mut rx) = mpsc::channel::<WsCommand>(16);

        tx.send(WsCommand::Send("outgoing".into())).await.unwrap();
        tx.send(WsCommand::Close).await.unwrap();
        drop(tx);

        let _ = run_ws_loop(msg_stream, sink.clone(), &mut rx, "conn-1", emitter.clone()).await;

        let items = sink.sent_text.lock().unwrap();
        assert_eq!(items.len(), 1, "expected 'outgoing' to have been written to sink");
        assert_eq!(items[0], "outgoing");
        let closed = sink.sent_close.lock().unwrap();
        assert!(*closed, "Close frame should have been written");
    }

    #[tokio::test]
    async fn closes_cleanly_on_close_command() {
        use futures_util::stream;
        let emitter = FakeEmitter::default();
        let sink = MockSink::default();
        let msg_stream = stream::pending::<Result<Message, String>>();
        let (tx, mut rx) = mpsc::channel::<WsCommand>(16);

        tx.send(WsCommand::Close).await.unwrap();
        drop(tx);

        let _ = run_ws_loop(msg_stream, sink.clone(), &mut rx, "conn-1", emitter.clone()).await;

        let closed = sink.sent_close.lock().unwrap();
        assert!(*closed, "Close frame should have been written");
    }
}

