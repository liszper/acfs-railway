use russh::*;
use russh_keys::ssh_key;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

pub struct SshConnection {
    handle: Arc<Mutex<client::Handle<SshHandler>>>,
}

struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

impl SshConnection {
    pub async fn connect(
        host: &str,
        port: u16,
        user: &str,
        password: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config = Arc::new(client::Config {
            // Send keepalives every 15s to prevent NAT/firewall timeouts
            keepalive_interval: Some(Duration::from_secs(15)),
            // Disconnect if no response after 45s
            keepalive_max: 3,
            ..Default::default()
        });

        let handler = SshHandler;
        eprintln!("[ssh] connecting to {}:{}...", host, port);
        let mut handle = client::connect(config, (host, port), handler).await?;
        eprintln!("[ssh] connected, authenticating as {}...", user);

        let auth_result = handle.authenticate_password(user, password).await?;
        if !auth_result {
            eprintln!("[ssh] auth failed");
            return Err("SSH authentication failed".into());
        }
        eprintln!("[ssh] authenticated OK");

        Ok(Self {
            handle: Arc::new(Mutex::new(handle)),
        })
    }

    pub async fn open_channel(
        &self,
    ) -> Result<Channel<client::Msg>, Box<dyn std::error::Error + Send + Sync>> {
        let handle = self.handle.lock().await;
        let channel = handle.channel_open_session().await?;
        Ok(channel)
    }

    /// Actually test the connection by opening and closing a channel
    pub async fn is_alive(&self) -> bool {
        match self.open_channel().await {
            Ok(mut ch) => {
                let _ = ch.close().await;
                true
            }
            Err(e) => {
                eprintln!("[ssh] health check failed: {}", e);
                false
            }
        }
    }
}
