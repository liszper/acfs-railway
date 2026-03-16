use base64::Engine;

pub struct ApiClient {
    client: reqwest::Client,
    base_url: String,
    auth_header: String,
}

impl ApiClient {
    pub fn new(base_url: String, user: &str, password: &str) -> Self {
        let encoded =
            base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", user, password));
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_header: format!("Basic {}", encoded),
        }
    }

    pub async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = match method.to_uppercase().as_str() {
            "GET" => self.client.get(&url),
            "POST" => self.client.post(&url),
            "PUT" => self.client.put(&url),
            "DELETE" => self.client.delete(&url),
            _ => return Err(format!("Unknown method: {}", method).into()),
        };

        req = req.header("Authorization", &self.auth_header);

        if let Some(body) = body {
            req = req.header("Content-Type", "application/json").json(&body);
        }

        let resp = req.send().await?;
        let status = resp.status();
        let text = resp.text().await?;

        if text.is_empty() {
            return Ok(serde_json::json!({ "status": status.as_u16() }));
        }

        serde_json::from_str(&text).map_err(|_| {
            format!(
                "Invalid JSON response ({}): {}",
                status,
                &text[..text.len().min(200)]
            )
            .into()
        })
    }
}
