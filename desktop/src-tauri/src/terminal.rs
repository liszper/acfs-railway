use russh::*;
use tauri::Emitter;
use tokio::sync::mpsc;

pub struct TerminalSession {
    writer: mpsc::Sender<TerminalCommand>,
    _reader_task: tokio::task::JoinHandle<()>,
}

enum TerminalCommand {
    Write(Vec<u8>),
    Resize(u32, u32),
    Close,
}

impl TerminalSession {
    pub async fn start(
        ssh: &crate::ssh::SshConnection,
        tab_id: &str,
        command: &str,
        app: tauri::AppHandle,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut channel = ssh.open_channel().await?;

        // Request PTY
        channel
            .request_pty(false, &"xterm-256color", 80, 24, 0, 0, &[])
            .await?;

        // Execute command
        channel.exec(true, command.as_bytes()).await?;

        let (tx, mut rx) = mpsc::channel::<TerminalCommand>(256);
        let event_name = format!("terminal-data-{}", tab_id);

        // Spawn task that reads from channel and forwards to frontend,
        // and also handles write/resize commands from frontend
        let reader_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    // Read from SSH channel -> emit to frontend
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                let _ = app.emit(&event_name, data.to_vec());
                            }
                            Some(ChannelMsg::Eof) | None => break,
                            _ => {}
                        }
                    }
                    // Handle commands from frontend
                    cmd = rx.recv() => {
                        match cmd {
                            Some(TerminalCommand::Write(data)) => {
                                if channel.data(&data[..]).await.is_err() {
                                    break;
                                }
                            }
                            Some(TerminalCommand::Resize(cols, rows)) => {
                                let _ = channel.window_change(cols, rows, 0, 0).await;
                            }
                            Some(TerminalCommand::Close) | None => break,
                        }
                    }
                }
            }
            let _ = channel.close().await;
        });

        Ok(Self {
            writer: tx,
            _reader_task: reader_task,
        })
    }

    pub async fn write(
        &self,
        data: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.writer
            .send(TerminalCommand::Write(data.to_vec()))
            .await?;
        Ok(())
    }

    pub async fn resize(
        &self,
        cols: u32,
        rows: u32,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.writer
            .send(TerminalCommand::Resize(cols, rows))
            .await?;
        Ok(())
    }

    pub async fn close(self) {
        let _ = self.writer.send(TerminalCommand::Close).await;
    }
}
