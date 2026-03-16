use russh::*;
use russh_keys::ssh_key;
use std::sync::Arc;
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
        // Accept all host keys (like StrictHostKeyChecking=no)
        // TODO: implement known_hosts checking for production
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
}
