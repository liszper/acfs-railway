mod api;
mod ssh;
mod state;
mod terminal;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Connection
            connect_ssh,
            disconnect_ssh,
            connection_status,
            // Terminal
            terminal_open,
            terminal_write,
            terminal_resize,
            terminal_close,
            // API proxy
            api_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn connect_ssh(
    state: tauri::State<'_, AppState>,
    host: String,
    port: u16,
    user: String,
    password: String,
    api_url: String,
) -> Result<(), String> {
    state
        .connect(host, port, user, password, api_url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn disconnect_ssh(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.disconnect().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn connection_status(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    Ok(state.is_connected().await)
}

#[tauri::command]
async fn terminal_open(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    session_name: String,
) -> Result<String, String> {
    state
        .open_terminal(app, session_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn terminal_write(
    state: tauri::State<'_, AppState>,
    tab_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    state
        .write_terminal(&tab_id, &data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn terminal_resize(
    state: tauri::State<'_, AppState>,
    tab_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    state
        .resize_terminal(&tab_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn terminal_close(
    state: tauri::State<'_, AppState>,
    tab_id: String,
) -> Result<(), String> {
    state
        .close_terminal(&tab_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn api_request(
    state: tauri::State<'_, AppState>,
    method: String,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state
        .api_request(&method, &path, body)
        .await
        .map_err(|e| e.to_string())
}
