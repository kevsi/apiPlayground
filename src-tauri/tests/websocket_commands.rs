use reqly_lib::websocket::commands::{ws_send, ws_disconnect, ws_get_status};
use reqly_lib::websocket::manager::ConnectionManager;
use reqly_lib::websocket::types::WsStatus;
use tauri::Manager;

fn setup_app() -> tauri::App<tauri::test::MockRuntime> {
    let app = tauri::test::mock_app();
    app.manage(ConnectionManager::new());
    app
}

// ─── error paths for unknown connections ───────────────────────────────────

#[tokio::test]
async fn ws_send_returns_not_found_for_unknown_connection() {
    let app = setup_app();

    let result = ws_send(
        "missing".into(),
        "hello".into(),
        app.state::<ConnectionManager>(),
    )
    .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn ws_disconnect_returns_not_found_for_unknown_connection() {
    let app = setup_app();

    let result = ws_disconnect(
        "missing".into(),
        app.state::<ConnectionManager>(),
    )
    .await;

    assert!(result.is_err());
}

#[tokio::test]
async fn ws_get_status_returns_not_found_for_unknown_connection() {
    let app = setup_app();

    let result = ws_get_status(
        "missing".into(),
        app.state::<ConnectionManager>(),
    )
    .await;

    assert!(result.is_err());
}

// ─── happy paths via pre-registered connections ────────────────────────────

#[tokio::test]
async fn ws_get_status_reports_connecting_after_register() {
    let app = setup_app();

    let manager = app.state::<ConnectionManager>();
    let (tx, _rx) = tokio::sync::mpsc::channel::<reqly_lib::websocket::manager::WsCommand>(1);
    manager.register("conn-1".into(), tx).await;

    let result = ws_get_status(
        "conn-1".into(),
        app.state::<ConnectionManager>(),
    )
    .await;

    assert!(result.is_ok());
    assert_eq!(result.unwrap(), WsStatus::Connecting);
}

#[tokio::test]
async fn ws_disconnect_unregisters_connection() {
    let app = setup_app();

    let manager = app.state::<ConnectionManager>();
    let (tx, _rx) = tokio::sync::mpsc::channel::<reqly_lib::websocket::manager::WsCommand>(1);
    manager.register("conn-1".into(), tx).await;

    ws_disconnect(
        "conn-1".into(),
        app.state::<ConnectionManager>(),
    )
    .await
    .expect("disconnect should succeed");

    let status = manager.get_status("conn-1").await;
    assert!(status.is_none());
}
