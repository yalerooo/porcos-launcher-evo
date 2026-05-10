use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use unrar::Archive;
use sha1::{Sha1, Digest};
use crate::errors::IoError;
use crate::{log_debug, log_error, log_info, log_warn};

fn compute_murmur2_hash(data: &[u8]) -> u32 {
    let m: u32 = 0x5bd1e995;
    let r: i32 = 24;
    let seed: u32 = 1;
    let mut len = data.len() as u32;
    let mut h: u32 = seed ^ len;
    let mut data_idx = 0;

    while len >= 4 {
        let mut k: u32 = u32::from(data[data_idx])
            | (u32::from(data[data_idx + 1]) << 8)
            | (u32::from(data[data_idx + 2]) << 16)
            | (u32::from(data[data_idx + 3]) << 24);

        k = k.wrapping_mul(m);
        k ^= k >> r;
        k = k.wrapping_mul(m);

        h = h.wrapping_mul(m);
        h ^= k;

        data_idx += 4;
        len -= 4;
    }

    match len {
        3 => {
            h ^= u32::from(data[data_idx + 2]) << 16;
            h ^= u32::from(data[data_idx + 1]) << 8;
            h ^= u32::from(data[data_idx]);
            h = h.wrapping_mul(m);
        }
        2 => {
            h ^= u32::from(data[data_idx + 1]) << 8;
            h ^= u32::from(data[data_idx]);
            h = h.wrapping_mul(m);
        }
        1 => {
            h ^= u32::from(data[data_idx]);
            h = h.wrapping_mul(m);
        }
        _ => {}
    }

    h ^= h >> 13;
    h = h.wrapping_mul(m);
    h ^= h >> 15;

    h
}

fn normalize_for_murmur2(data: &[u8]) -> Vec<u8> {
    data.iter()
        .filter(|&&b| b != 9 && b != 10 && b != 13 && b != 32)
        .cloned()
        .collect()
}

#[tauri::command]
pub async fn get_file_hash(path: String) -> Result<String, String> {
    let mut file = fs::File::open(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
    let mut hasher = Sha1::new();
    io::copy(&mut file, &mut hasher)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}

#[tauri::command]
pub async fn get_file_hash_murmur2(path: String) -> Result<u32, String> {
    let data = fs::read(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
    let normalized = normalize_for_murmur2(&data);
    Ok(compute_murmur2_hash(&normalized))
}

#[tauri::command]
pub async fn extract_zip(zip_path: String, target_dir: String, skip_files: Option<Vec<String>>) -> Result<(), String> {
    let skip_list = skip_files.unwrap_or_default();

    if zip_path.to_lowercase().ends_with(".rar") {
        let mut archive = Archive::new(&zip_path)
            .open_for_processing()
            .map_err(|e| IoError::ExtractionError {
                reason: format!("Failed to open RAR: {}", e),
            })?;

        loop {
            match archive.read_header() {
                Ok(Some(header)) => {
                    let entry = header.entry();
                    let filename = PathBuf::from(&entry.filename);
                    let dest_path = Path::new(&target_dir).join(&filename);

                    let file_name_str = filename.file_name().unwrap_or_default().to_string_lossy();
                    if skip_list.iter().any(|s| s == &file_name_str) && dest_path.exists() {
                        archive = header.skip().map_err(|e| IoError::ExtractionError {
                            reason: format!("Failed to skip entry: {}", e),
                        })?;
                        continue;
                    }

                    if entry.is_directory() {
                        fs::create_dir_all(&dest_path).map_err(|e| IoError::CreateDir {
                            path: dest_path.to_string_lossy().to_string(),
                            reason: e.to_string(),
                        })?;
                        archive = header.skip().map_err(|e| IoError::ExtractionError {
                            reason: format!("Failed to skip dir: {}", e),
                        })?;
                    } else {
                        if let Some(parent) = dest_path.parent() {
                            if !parent.exists() {
                                fs::create_dir_all(parent).map_err(|e| IoError::CreateDir {
                                    path: parent.to_string_lossy().to_string(),
                                    reason: e.to_string(),
                                })?;
                            }
                        }

                        let (data, next_archive) = header.read().map_err(|e| IoError::ExtractionError {
                            reason: format!("Failed to read entry {:?}: {}", filename, e),
                        })?;
                        archive = next_archive;

                        fs::write(&dest_path, data).map_err(|e| IoError::WriteError {
                            path: dest_path.to_string_lossy().to_string(),
                            reason: e.to_string(),
                        })?;
                    }
                }
                Ok(None) => break,
                Err(e) => return Err(IoError::ExtractionError {
                    reason: format!("RAR read error: {}", e),
                }.to_string()),
            }
        }
        return Ok(());
    }

    let file = fs::File::open(&zip_path)
        .map_err(|e| IoError::ReadError {
            path: zip_path.clone(),
            reason: e.to_string(),
        })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| IoError::ExtractionError {
            reason: format!("Failed to read ZIP: {}", e),
        })?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| IoError::ExtractionError {
                reason: format!("Failed to read ZIP entry: {}", e),
            })?;
        let outpath = match file.enclosed_name() {
            Some(path) => Path::new(&target_dir).join(path),
            None => continue,
        };

        let file_name_str = outpath.file_name().unwrap_or_default().to_string_lossy();
        if skip_list.iter().any(|s| s == &file_name_str) && outpath.exists() {
            continue;
        }

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| IoError::CreateDir {
                path: outpath.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| IoError::CreateDir {
                        path: p.to_string_lossy().to_string(),
                        reason: e.to_string(),
                    })?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| IoError::WriteError {
                path: outpath.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;
            io::copy(&mut file, &mut outfile).map_err(|e| IoError::WriteError {
                path: outpath.to_string_lossy().to_string(),
                reason: e.to_string(),
            })?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| IoError::WriteError {
            path: path.clone(),
            reason: e.to_string(),
        }.to_string())
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
    let dir = fs::read_dir(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;

    for entry in dir {
        let entry = entry.map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let is_dir = path.is_dir();

        entries.push(FileEntry { name, is_dir });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path)
        .map_err(|e| IoError::DeleteError {
            path: path.clone(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn get_mod_icon(path: String) -> Result<Vec<u8>, String> {
    let file = fs::File::open(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| IoError::ExtractionError {
            reason: format!("Failed to read ZIP: {}", e),
        })?;

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

fn parse_forge_toml(content: &str) -> ModMetadata {
    if let Ok(toml_value) = content.parse::<toml::Value>() {
        if let Some(mods) = toml_value.get("mods").and_then(|v| v.as_array()) {
            if let Some(first_mod) = mods.first() {
                let id = first_mod.get("modId").and_then(|v| v.as_str()).map(|s| s.to_string());
                let name = first_mod.get("displayName").and_then(|v| v.as_str()).map(|s| s.to_string());
                let version = first_mod.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                return ModMetadata { id, name, version };
            }
        }
    }
    ModMetadata { id: None, name: None, version: None }
}

#[tauri::command]
pub async fn get_mod_metadata(path: String) -> Result<ModMetadata, String> {
    let file = fs::File::open(&path)
        .map_err(|e| IoError::ReadError {
            path: path.clone(),
            reason: e.to_string(),
        })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| IoError::ExtractionError {
            reason: format!("Failed to read ZIP: {}", e),
        })?;

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

    if let Ok(mut file) = archive.by_name("quilt.mod.json") {
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut file, &mut content).is_ok() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let loader = json.get("quilt_loader");
                let id = loader.and_then(|l| l.get("id")).and_then(|v| v.as_str()).map(|s| s.to_string());
                let name = loader
                    .and_then(|l| l.get("metadata"))
                    .and_then(|m| m.get("name"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let version = loader.and_then(|l| l.get("version")).and_then(|v| v.as_str()).map(|s| s.to_string());

                if id.is_some() {
                    return Ok(ModMetadata { id, name, version });
                }
            }
        }
    }

    if let Ok(mut file) = archive.by_name("META-INF/neoforge.mods.toml") {
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut file, &mut content).is_ok() {
            let metadata = parse_forge_toml(&content);
            if metadata.id.is_some() {
                return Ok(metadata);
            }
        }
    }

    if let Ok(mut file) = archive.by_name("META-INF/mods.toml") {
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut file, &mut content).is_ok() {
            let metadata = parse_forge_toml(&content);
            if metadata.id.is_some() {
                return Ok(metadata);
            }
        }
    }

    Ok(ModMetadata { id: None, name: None, version: None })
}

#[tauri::command]
pub async fn run_installer(path: String) -> Result<(), String> {
    open::that(&path)
        .map_err(|e| format!("Failed to run installer: {}", e))
}

#[tauri::command]
pub async fn run_installer_with_args(path: String, args: Vec<String>) -> Result<(), String> {
    let mut command = std::process::Command::new(&path);
    command.args(&args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.spawn()
        .map_err(|e| format!("Failed to spawn installer: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn run_update_installer(installer_path: String) -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe: {}", e))?;
    let exe_path_str = current_exe.to_str().ok_or("Invalid path")?.to_string();
    let temp_dir = std::env::temp_dir();
    let bat_path = temp_dir.join("porcos_update.bat");

    let script_content = format!(
        "@echo off\r\ntimeout /t 3 /nobreak >nul\r\nstart /wait \"\" \"{}\" /S\r\nstart \"\" \"{}\"\r\n(goto) 2>nul & del \"%~f0\"",
        installer_path,
        exe_path_str
    );

    std::fs::write(&bat_path, script_content)
        .map_err(|e| IoError::WriteError {
            path: bat_path.to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string())?;

    let mut command = std::process::Command::new("cmd");
    command.args(&["/C", bat_path.to_str().ok_or("Invalid bat path")?]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command.spawn()
        .map_err(|e| format!("Failed to spawn update script: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn move_file(source: String, target: String) -> Result<(), String> {
    fs::rename(&source, &target)
        .map_err(|e| IoError::RenameError {
            old_path: source.clone(),
            new_path: target.clone(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let parent = path_buf.parent().ok_or("Invalid path")?;
    let new_path = parent.join(new_name);
    fs::rename(&path, &new_path)
        .map_err(|e| IoError::RenameError {
            old_path: path.clone(),
            new_path: new_path.to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn remove_dir(path: String) -> Result<(), String> {
    fs::remove_dir_all(&path)
        .map_err(|e| IoError::DeleteError {
            path: path.clone(),
            reason: e.to_string(),
        }.to_string())
}

fn merge_dir_recursive(source: &std::path::Path, target: &std::path::Path, skip_files: &[String], is_root: bool) -> io::Result<()> {
    if !target.exists() {
        fs::create_dir_all(target)?;
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = path.file_name().unwrap().to_string_lossy().to_string();

        if is_root && skip_files.contains(&file_name) {
            continue;
        }

        let target_path = target.join(&file_name);

        if path.is_dir() {
            merge_dir_recursive(&path, &target_path, skip_files, false)?;
        } else {
            if target_path.exists() {
                if target_path.is_dir() {
                    fs::remove_dir_all(&target_path)?;
                } else {
                    fs::remove_file(&target_path)?;
                }
            }
            if let Err(_) = fs::rename(&path, &target_path) {
                fs::copy(&path, &target_path)?;
                fs::remove_file(&path)?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn merge_dir(source: String, target: String, skip_files: Option<Vec<String>>) -> Result<(), String> {
    let source_path = PathBuf::from(&source);
    let target_path = PathBuf::from(&target);
    let skip = skip_files.unwrap_or_default();

    merge_dir_recursive(&source_path, &target_path, &skip, true)
        .map_err(|e| IoError::CopyError {
            src: source.clone(),
            dst: target.clone(),
            reason: e.to_string(),
        }.to_string())
}

#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}
