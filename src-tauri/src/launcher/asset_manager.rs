use std::path::PathBuf;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use reqwest;
use tauri::{Emitter, Window};
use futures::stream::{self, StreamExt};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::errors::{LauncherError, NetworkError, IoError};
use crate::{log_info, log_warn, log_error, log_debug};

#[derive(Debug, Deserialize, Clone)]
struct AssetIndexFile {
    objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize, Clone)]
struct AssetObject {
    hash: String,
    #[allow(dead_code)]
    size: u64,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: String,
    progress: f64,
    total: u64,
    current: u64,
}

pub struct AssetManager {
    assets_dir: PathBuf,
    window: Option<Window>,
}

impl AssetManager {
    pub fn new(assets_dir: PathBuf, window: Option<Window>) -> Self {
        Self { assets_dir, window }
    }

    fn emit_progress(&self, stage: &str, current: u64, total: u64) {
        if let Some(window) = &self.window {
            let raw_progress = if total > 0 {
                current as f64 / total as f64
            } else {
                0.0
            };
            
            // Scale to 0-20% range for assets
            let progress = raw_progress * 20.0;

            let event = ProgressEvent {
                stage: stage.to_string(),
                progress,
                total,
                current,
            };
            
            let _ = window.emit("launch-progress", event);
        }
    }

    pub async fn download_assets(&self, asset_index_id: &str, asset_index_url: &str) -> Result<(), LauncherError> {
        log_info!("Starting asset download for index: {}", asset_index_id);
        self.emit_progress("Verificando índices de assets...", 0, 100);

        // 1. Ensure directories exist
        let indexes_dir = self.assets_dir.join("indexes");
        let objects_dir = self.assets_dir.join("objects");

        std::fs::create_dir_all(&indexes_dir)
            .map_err(|e| IoError::CreateDir {
                path: indexes_dir.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;
        std::fs::create_dir_all(&objects_dir)
            .map_err(|e| IoError::CreateDir {
                path: objects_dir.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;

        // 2. Download index file
        let index_path = indexes_dir.join(format!("{}.json", asset_index_id));
        if !index_path.exists() {
            log_info!("Downloading asset index...");
            self.emit_progress("Descargando índice de assets...", 10, 100);
            let response = reqwest::get(asset_index_url)
                .await
                .map_err(|e| {
                    log_error!("Failed to download asset index: {}", e);
                    NetworkError::connection_failed(asset_index_url, e.to_string())
                })?;

            if !response.status().is_success() {
                let status = response.status().as_u16();
                log_error!("Asset index download failed with status: {}", status);
                return Err(NetworkError::status_code(status, asset_index_url).into());
            }

            let content = response.bytes()
                .await
                .map_err(|e| {
                    log_error!("Failed to read asset index: {}", e);
                    NetworkError::read_error(asset_index_url, e.to_string())
                })?;

            std::fs::write(&index_path, &content)
                .map_err(|e| {
                    log_error!("Failed to write asset index: {}", e);
                    IoError::WriteError {
                        path: index_path.to_string_lossy().to_string(),
                        reason: e.to_string(),
                    }
                })?;
        }

        // 3. Parse index
        let index_content = std::fs::read_to_string(&index_path)
            .map_err(|e| {
                log_error!("Failed to read index file: {}", e);
                IoError::ReadError {
                    path: index_path.to_string_lossy().to_string(),
                    reason: e.to_string(),
                }
            })?;

        let index: AssetIndexFile = serde_json::from_str(&index_content)
            .map_err(|e| {
                log_error!("Failed to parse asset index: {}", e);
                IoError::CorruptedFile {
                    path: index_path.to_string_lossy().to_string(),
                }
            })?;

        log_info!("Found {} assets to process", index.objects.len());

        // 4. Download objects
        let total = index.objects.len() as u64;
        let current_progress = Arc::new(Mutex::new(0u64));

        // Create a vector of objects to process
        let objects_to_download: Vec<(String, AssetObject)> = index.objects.into_iter().collect();

        let client = reqwest::Client::new();

        // Create a stream
        let stream = stream::iter(objects_to_download)
            .map(|(name, object)| {
                let assets_dir = self.assets_dir.clone();
                let client = client.clone();
                let current_progress = current_progress.clone();

                async move {
                    let hash_prefix = &object.hash[0..2];
                    let object_path = assets_dir.join("objects").join(hash_prefix).join(&object.hash);

                    if !object_path.exists() {
                        if let Some(parent) = object_path.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }

                        let url = format!("https://resources.download.minecraft.net/{}/{}", hash_prefix, object.hash);

                        // Use the shared client
                        match Self::download_file_with_client(&client, &url, &object_path).await {
                            Ok(_) => {}
                            Err(e) => log_warn!("Failed to download {}: {}", name, e),
                        }
                    }

                    let mut count = current_progress.lock().await;
                    *count += 1;
                    *count
                }
            })
            .buffer_unordered(50); // 50 concurrent downloads

        // Process the stream
        stream.for_each(|count| async move {
            // Emit progress every 10 items or when complete
            if count % 10 == 0 || count == total {
                self.emit_progress("Descargando assets...", count, total);
            }
        }).await;

        log_info!("Asset download complete!");
        self.emit_progress("Assets descargados", total, total);
        Ok(())
    }

    async fn download_file_with_client(client: &reqwest::Client, url: &str, path: &std::path::Path) -> Result<(), LauncherError> {
        let response = client.get(url)
            .send()
            .await
            .map_err(|e| {
                log_error!("Download failed: {} - {}", url, e);
                NetworkError::connection_failed(url, e.to_string())
            })?;

        if !response.status().is_success() {
            log_error!("Download failed with status {}: {}", response.status().as_u16(), url);
            return Err(NetworkError::status_code(response.status().as_u16(), url).into());
        }

        let bytes = response.bytes()
            .await
            .map_err(|e| {
                log_error!("Failed to read response: {} - {}", url, e);
                NetworkError::read_error(url, e.to_string())
            })?;

        std::fs::write(path, &bytes)
            .map_err(|e| {
                log_error!("Failed to write file: {:?} - {}", path, e);
                IoError::WriteError {
                    path: path.to_string_lossy().to_string(),
                    reason: e.to_string(),
                }
            })?;

        Ok(())
    }

    #[allow(dead_code)]
    async fn download_file(&self, url: &str, path: &std::path::Path) -> Result<(), LauncherError> {
        let response = reqwest::get(url)
            .await
            .map_err(|e| {
                log_error!("Download failed: {} - {}", url, e);
                NetworkError::connection_failed(url, e.to_string())
            })?;

        if !response.status().is_success() {
            log_error!("Download failed with status {}: {}", response.status().as_u16(), url);
            return Err(NetworkError::status_code(response.status().as_u16(), url).into());
        }

        let bytes = response.bytes()
            .await
            .map_err(|e| {
                log_error!("Failed to read response: {} - {}", url, e);
                NetworkError::read_error(url, e.to_string())
            })?;

        std::fs::write(path, &bytes)
            .map_err(|e| {
                log_error!("Failed to write file: {:?} - {}", path, e);
                IoError::WriteError {
                    path: path.to_string_lossy().to_string(),
                    reason: e.to_string(),
                }
            })?;

        Ok(())
    }
}
