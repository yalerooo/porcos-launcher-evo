use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use unrar::Archive;

#[tauri::command]
pub async fn extract_zip(zip_path: String, target_dir: String) -> Result<(), String> {
    // Handle RAR files
    if zip_path.to_lowercase().ends_with(".rar") {
        let mut archive = Archive::new(&zip_path)
            .open_for_processing()
            .map_err(|e| format!("Failed to open RAR: {}", e))?;

        loop {
            match archive.read_header() {
                Ok(Some(header)) => {
                    let entry = header.entry();
                    let filename = PathBuf::from(&entry.filename);
                    let dest_path = Path::new(&target_dir).join(&filename);
                    
                    if entry.is_directory() {
                        fs::create_dir_all(&dest_path).map_err(|e| format!("Failed to create dir {:?}: {}", dest_path, e))?;
                        archive = header.skip().map_err(|e| format!("Failed to skip dir: {}", e))?;
                    } else {
                        // Ensure parent directories exist
                        if let Some(parent) = dest_path.parent() {
                            if !parent.exists() {
                                fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir {:?}: {}", parent, e))?;
                            }
                        }

                        // Read content into memory and write manually to avoid unrar creation issues
                        let (data, next_archive) = header.read().map_err(|e| format!("Failed to read entry {:?}: {}", filename, e))?;
                        archive = next_archive;

                        fs::write(&dest_path, data).map_err(|e| format!("Failed to write file {:?}: {}", dest_path, e))?;
                    }
                }
                Ok(None) => break,
                Err(e) => return Err(format!("RAR read error: {}", e)),
            }
        }
        return Ok(());
    }

    // Handle ZIP files
    let file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => Path::new(&target_dir).join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[derive(serde::Serialize)]
pub struct FileEntry {
    name: String,
    is_dir: bool,
}

#[tauri::command]
pub async fn list_files(path: String) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let dir = fs::read_dir(path).map_err(|e| e.to_string())?;
    
    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let is_dir = path.is_dir();
        
        entries.push(FileEntry { name, is_dir });
    }
    
    Ok(entries)
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mod_icon(path: String) -> Result<Vec<u8>, String> {
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Try to find fabric.mod.json
    let icon_path = {
        if let Ok(mut config) = archive.by_name("fabric.mod.json") {
            let mut content = String::new();
            if std::io::Read::read_to_string(&mut config, &mut content).is_ok() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    json.get("icon").and_then(|i| i.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    };

    if let Some(icon) = icon_path {
        let icon_path = if icon.starts_with("./") { &icon[2..] } else { &icon };
        if let Ok(mut icon_file) = archive.by_name(icon_path) {
            let mut buffer = Vec::new();
            if std::io::Read::read_to_end(&mut icon_file, &mut buffer).is_ok() {
                return Ok(buffer);
            }
        }
    }
    
    // Try common names
    let common_names = ["icon.png", "logo.png", "mod_icon.png", "pack.png"];
    for name in common_names {
        if let Ok(mut file) = archive.by_name(name) {
             let mut buffer = Vec::new();
             if std::io::Read::read_to_end(&mut file, &mut buffer).is_ok() {
                 return Ok(buffer);
             }
        }
    }

    Err("Icon not found".to_string())
}

#[derive(serde::Serialize)]
pub struct ModMetadata {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
}

fn extract_toml_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split('=').collect();
    if parts.len() >= 2 {
        let val = parts[1].trim().trim_matches('"').trim_matches('\'');
        return Some(val.to_string());
    }
    None
}

#[tauri::command]
pub async fn get_mod_metadata(path: String) -> Result<ModMetadata, String> {
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // 1. Try Fabric (fabric.mod.json)
    if let Ok(mut file) = archive.by_name("fabric.mod.json") {
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut file, &mut content).is_ok() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = json.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                let name = json.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
                let version = json.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                
                return Ok(ModMetadata { id, name, version });
            }
        }
    }

    // 2. Try Forge (META-INF/mods.toml)
    if let Ok(mut file) = archive.by_name("META-INF/mods.toml") {
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut file, &mut content).is_ok() {
            let mut id = None;
            let mut name = None;
            let mut version = None;

            for line in content.lines() {
                let line = line.trim();
                if line.starts_with("modId") {
                    if let Some(val) = extract_toml_value(line) {
                        if id.is_none() { id = Some(val); }
                    }
                } else if line.starts_with("displayName") {
                    if let Some(val) = extract_toml_value(line) {
                        if name.is_none() { name = Some(val); }
                    }
                } else if line.starts_with("version") {
                    if let Some(val) = extract_toml_value(line) {
                        if version.is_none() { version = Some(val); }
                    }
                }
            }
            
            if id.is_some() {
                return Ok(ModMetadata { id, name, version });
            }
        }
    }

    Ok(ModMetadata { id: None, name: None, version: None })
}
