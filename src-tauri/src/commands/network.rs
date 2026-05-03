use tauri::{command, Window, Emitter};
use reqwest::Client;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::time::Duration;
use futures::StreamExt;
use crate::errors::{LauncherError, NetworkError};
use crate::{log_error, log_warn, log_info, log_debug};

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    id: Option<String>,
    progress: f64,
}

const MAX_RETRIES: u32 = 3;
const INITIAL_DELAY_MS: u64 = 1000;

fn calculate_delay(attempt: u32) -> Duration {
    Duration::from_millis(INITIAL_DELAY_MS * (2_u64.pow(attempt.saturating_sub(1))))
}

async fn fetch_with_retry(
    client: &Client,
    url: &str,
    method: &str,
    headers: Option<&HashMap<String, String>>,
    body: Option<&str>,
) -> Result<reqwest::Response, LauncherError> {
    let mut delay = calculate_delay(1);

    for attempt in 1..=MAX_RETRIES {
        let mut request = match method {
            "POST" => client.post(url),
            "PUT" => client.put(url),
            "DELETE" => client.delete(url),
            "PATCH" => client.patch(url),
            _ => client.get(url),
        };

        if let Some(h) = headers {
            for (key, value) in h {
                request = request.header(key, value);
            }
        }

        if let Some(b) = body {
            request = request.body(b.to_string());
        }

        match request.send().await {
            Ok(response) => {
                if response.status().is_success() {
                    log_debug!("Request successful after {} attempt(s): {}", attempt, url);
                    return Ok(response);
                }

                let status = response.status().as_u16();

                if status == 404 {
                    log_error!("Resource not found (404): {}", url);
                    return Err(NetworkError::not_found(url).into());
                }

                if !response.status().is_success() {
                    log_warn!("Request failed with status {} (attempt {}/{}): {}",
                        status, attempt, MAX_RETRIES, url);

                    if attempt == MAX_RETRIES {
                        return Err(NetworkError::status_code(status, url).into());
                    }
                }
            }
            Err(e) => {
                log_warn!("Request error (attempt {}/{}): {} - {}",
                    attempt, MAX_RETRIES, url, e);

                if attempt == MAX_RETRIES {
                    return Err(e.into());
                }
            }
        }

        if attempt < MAX_RETRIES {
            log_debug!("Retrying in {:?}...", delay);
            tokio::time::sleep(delay).await;
            delay = calculate_delay(attempt + 1);
        }
    }

    Err(NetworkError::Unknown(format!(
        "Max retries ({}) exceeded for {}",
        MAX_RETRIES, url
    )).into())
}

#[command]
pub async fn fetch_cors(
    url: String,
    headers: Option<HashMap<String, String>>,
    method: Option<String>,
    body: Option<String>
) -> Result<String, String> {
    log_info!("fetch_cors: {} {}", method.as_deref().unwrap_or("GET"), url);

    let client = Client::new();
    let method_str = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();

    let headers_ref = headers.as_ref();
    let body_ref = body.as_deref();

    let response = fetch_with_retry(&client, &url, &method_str, headers_ref, body_ref)
        .await
        .map_err(|e| {
            log_error!("fetch_cors failed: {} - {}", url, e);
            e.to_string()
        })?;

    response.text().await.map_err(|e| {
        log_error!("Failed to read response from {}: {}", url, e);
        NetworkError::read_error(url, e.to_string()).to_string()
    })
}

async fn download_with_retry(
    client: &Client,
    url: &str,
    path: &Path,
) -> Result<u64, LauncherError> {
    let mut delay = calculate_delay(1);

    for attempt in 1..=MAX_RETRIES {
        match download_single(client, url, path).await {
            Ok(size) => {
                log_debug!("Download successful after {} attempt(s): {} -> {:?}",
                    attempt, url, path);
                return Ok(size);
            }
            Err(e) => {
                log_warn!("Download failed (attempt {}/{}): {} - {}",
                    attempt, MAX_RETRIES, url, e);

                if !e.is_recoverable() || attempt == MAX_RETRIES {
                    return Err(e);
                }
            }
        }

        if attempt < MAX_RETRIES {
            log_debug!("Retrying download in {:?}...", delay);
            tokio::time::sleep(delay).await;
            delay = calculate_delay(attempt + 1);
        }
    }

    Err(NetworkError::Unknown(format!(
        "Max retries ({}) exceeded for download",
        MAX_RETRIES
    )).into())
}

async fn download_single(
    client: &Client,
    url: &str,
    path: &Path,
) -> Result<u64, LauncherError> {
    let response = client.get(url)
        .send()
        .await
        .map_err(|e| {
            log_error!("Connection failed for download: {} - {}", url, e);
            LauncherError::Network(NetworkError::from(e))
        })?;

    let status = response.status();
    if !response.status().is_success() {
        log_error!("Download failed with status {}: {}", status, url);
        return Err(NetworkError::status_code(status.as_u16(), url).into());
    }

    let total_size = response.content_length().unwrap_or(0);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| IoError::CreateDir {
                path: parent.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;
    }

    let mut file = File::create(path)
        .map_err(|e| {
            log_error!("Failed to create file {:?}: {}", path, e);
            IoError::WriteError {
                path: path.to_string_lossy().to_string(),
                reason: e.to_string(),
            }
        })?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| {
            log_error!("Stream read error: {}", e);
            LauncherError::Network(NetworkError::read_error(url, e.to_string()))
        })?;

        file.write_all(&chunk)
            .map_err(|e| {
                log_error!("File write error: {}", e);
                IoError::WriteError {
                    path: path.to_string_lossy().to_string(),
                    reason: e.to_string(),
                }
            })?;

        downloaded += chunk.len() as u64;
    }

    log_debug!("Downloaded {} bytes from {} -> {:?}", downloaded, url, path);
    Ok(downloaded)
}

use crate::errors::IoError;

#[command]
pub async fn download_file(window: Window, url: String, path: String, id: Option<String>) -> Result<(), String> {
    log_info!("download_file: {} -> {}", url, path);

    let client = Client::new();
    let path_obj = Path::new(&path);

    match download_with_retry(&client, &url, path_obj).await {
        Ok(size) => {
            log_info!("download_file completed: {} bytes -> {}", size, path);
            let payload = DownloadProgress { id, progress: 100.0 };
            window.emit("download-progress", payload)
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            log_error!("download_file failed: {} - {}", url, e);
            Err(e.to_string())
        }
    }
}
