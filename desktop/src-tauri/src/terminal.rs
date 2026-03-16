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

        eprintln!("[terminal] requesting PTY for tab {}", tab_id);

        // Request PTY
        channel
            .request_pty(false, &"xterm-256color", 80, 24, 0, 0, &[])
            .await?;

        eprintln!("[terminal] PTY granted, requesting shell");

        // Request interactive shell (not exec — we need persistent session)
        channel.request_shell(false).await?;

        eprintln!("[terminal] shell started, sending command: {}", command);

        // Send the tmux attach/new command through the shell
        let cmd_with_newline = format!("{}\n", command);
        channel.data(cmd_with_newline.as_bytes()).await?;

        let (tx, mut rx) = mpsc::channel::<TerminalCommand>(256);
        let event_name = format!("terminal-data-{}", tab_id);
        let tab_id_owned = tab_id.to_string();

        // Spawn task that reads from channel and forwards to frontend,
        // and also handles write/resize commands from frontend
        let close_event = format!("terminal-closed-{}", tab_id);
        let reader_task = tokio::spawn(async move {
            eprintln!("[terminal] reader loop started for tab {}", tab_id_owned);
            let mut reason = "unknown";
            loop {
                tokio::select! {
                    // Read from SSH channel -> emit to frontend
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                let bytes = data.to_vec();
                                eprintln!("[terminal] {} received {} bytes", tab_id_owned, bytes.len());
                                let _ = app.emit(&event_name, &bytes);
                            }
                            Some(ChannelMsg::Eof) => {
                                eprintln!("[terminal] {} EOF", tab_id_owned);
                                reason = "Session ended (EOF)";
                                break;
                            }
                            None => {
                                eprintln!("[terminal] {} channel closed", tab_id_owned);
                                reason = "Connection lost";
                                break;
                            }
                            other => {
                                eprintln!("[terminal] {} other msg: {:?}", tab_id_owned, other);
                            }
                        }
                    }
                    // Handle commands from frontend
                    cmd = rx.recv() => {
                        match cmd {
                            Some(TerminalCommand::Write(data)) => {
                                if channel.data(&data[..]).await.is_err() {
                                    eprintln!("[terminal] {} write failed", tab_id_owned);
                                    reason = "Write failed — connection lost";
                                    break;
                                }
                            }
                            Some(TerminalCommand::Resize(cols, rows)) => {
                                eprintln!("[terminal] {} resize {}x{}", tab_id_owned, cols, rows);
                                let _ = channel.window_change(cols, rows, 0, 0).await;
                            }
                            Some(TerminalCommand::Close) | None => {
                                eprintln!("[terminal] {} close requested", tab_id_owned);
                                reason = "closed";
                                break;
                            }
                        }
                    }
                }
            }
            let _ = channel.close().await;
            // Notify frontend that this terminal died (unless it was an intentional close)
            if reason != "closed" {
                let _ = app.emit(&close_event, reason);
            }
            eprintln!("[terminal] {} reader loop ended: {}", tab_id_owned, reason);
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
