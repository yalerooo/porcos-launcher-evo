use tauri::{command, Window, Emitter};
use reqwest::Client;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use futures::StreamExt;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    id: Option<String>,
    progress: f64,
}

#[command]
pub async fn fetch_cors(url: String, headers: Option<HashMap<String, String>>) -> Result<String, String> {
    let client = Client::new();
    let mut request = client.get(&url);

    if let Some(h) = headers {
        for (key, value) in h {
            request = request.header(key, value);
        }
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;
    
    Ok(text)
}

#[command]
pub async fn download_file(window: Window, url: String, path: String, id: Option<String>) -> Result<(), String> {
    let client = Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    
    let path_obj = Path::new(&path);
    if let Some(parent) = path_obj.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emit = 0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            // Emit every 1% or so to avoid flooding
            if progress as u64 > last_emit {
                let payload = DownloadProgress { id: id.clone(), progress };
                window.emit("download-progress", payload).map_err(|e| e.to_string())?;
                last_emit = progress as u64;
            }
        }
    }
    
    // Ensure 100% is emitted
    let payload = DownloadProgress { id: id.clone(), progress: 100.0 };
    window.emit("download-progress", payload).map_err(|e| e.to_string())?;
    
    Ok(())
}
