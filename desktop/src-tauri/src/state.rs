use crate::api::ApiClient;
use crate::ssh::SshConnection;
use crate::terminal::TerminalSession;
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct AppState {
    ssh: RwLock<Option<SshConnection>>,
    api: RwLock<Option<ApiClient>>,
    terminals: RwLock<HashMap<String, TerminalSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ssh: RwLock::new(None),
            api: RwLock::new(None),
            terminals: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect(
        &self,
        host: String,
        port: u16,
        user: String,
        password: String,
        api_url: String,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let ssh = SshConnection::connect(&host, port, &user, &password).await?;
        *self.ssh.write().await = Some(ssh);

        // API uses TTYD_USER (admin) with same password, not the SSH user (dev)
        let api = ApiClient::new(api_url, "admin", &password);
        *self.api.write().await = Some(api);

        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Close all terminals
        let mut terminals = self.terminals.write().await;
        for (_, term) in terminals.drain() {
            term.close().await;
        }
        *self.ssh.write().await = None;
        *self.api.write().await = None;
        Ok(())
    }

    pub async fn is_connected(&self) -> bool {
        let ssh = self.ssh.read().await;
        match ssh.as_ref() {
            Some(conn) => conn.is_alive().await,
            None => false,
        }
    }

    pub async fn open_terminal(
        &self,
        app: tauri::AppHandle,
        session_name: String,
        project_path: Option<String>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let ssh = self.ssh.read().await;
        let ssh = ssh.as_ref().ok_or("Not connected")?;

        let tab_id = uuid::Uuid::new_v4().to_string();
        let start_dir = project_path
            .as_deref()
            .unwrap_or("/data/projects");
        // Create session if needed, then attach with tmux chrome hidden.
        // We hide the status bar on attach and restore it on client-detach so
        // web/ttyd clients are not affected. aggressive-resize lets each client
        // window use its own exact size.
        let sn = shell_escape(&session_name);
        let sd = shell_escape(start_dir);
        let cmd = format!(
            "tmux has-session -t {sn} 2>/dev/null || tmux new-session -d -s {sn} -c {sd}; \
             tmux set-option -t {sn} status off 2>/dev/null; \
             tmux set-option -t {sn} mouse on 2>/dev/null; \
             tmux set-window-option -t {sn} aggressive-resize on 2>/dev/null; \
             tmux set-hook -t {sn} client-detached 'set-option -t {sn} status on' 2>/dev/null; \
             exec tmux attach-session -t {sn}"
        );

        let terminal = TerminalSession::start(ssh, &tab_id, &cmd, app).await?;
        self.terminals
            .write()
            .await
            .insert(tab_id.clone(), terminal);

        Ok(tab_id)
    }

    pub async fn write_terminal(
        &self,
        tab_id: &str,
        data: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let terminals = self.terminals.read().await;
        let term = terminals.get(tab_id).ok_or("Terminal not found")?;
        term.write(data).await?;
        Ok(())
    }

    pub async fn resize_terminal(
        &self,
        tab_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let terminals = self.terminals.read().await;
        let term = terminals.get(tab_id).ok_or("Terminal not found")?;
        term.resize(cols, rows).await?;
        Ok(())
    }

    pub async fn close_terminal(
        &self,
        tab_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut terminals = self.terminals.write().await;
        if let Some(term) = terminals.remove(tab_id) {
            term.close().await;
        }
        Ok(())
    }

    pub async fn api_request(
        &self,
        method: &str,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let api = self.api.read().await;
        let api = api.as_ref().ok_or("Not connected")?;
        api.request(method, path, body).await
    }
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
