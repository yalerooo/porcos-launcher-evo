use tauri::command;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use crate::launcher::MinecraftLauncher;
use crate::errors::IoError;
use crate::{log_info, log_error, log_debug, log_warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub versions: Option<Vec<String>>,
    #[serde(alias = "mod_loader")]
    pub mod_loader: Option<String>,
    #[serde(alias = "mod_loader_version")]
    pub mod_loader_version: Option<String>,
    pub icon: Option<String>,
    #[serde(alias = "background_image")]
    pub background_image: Option<String>,
    pub created: u64,
}

fn get_instances_dir() -> PathBuf {
    let mut path = MinecraftLauncher::get_default_minecraft_dir();
    // Use a custom subdirectory for our launcher's instances to avoid cluttering .minecraft root if possible,
    // or just use .minecraft/instances if we want to be standard-ish.
    // Let's use .porcos/instances to be safe and separate.
    path.pop(); // Go up from .minecraft
    path.push(".porcos");
    path.push("instances");
    
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

#[command]
pub async fn create_instance(name: String, version: String, mod_loader: Option<String>, mod_loader_version: Option<String>, image_path: Option<String>) -> Result<Instance, String> {
    log_info!("create_instance called - Name: {}, Version: {}, Loader: {:?}, LoaderVer: {:?}",
        name, version, mod_loader, mod_loader_version);

    let id = uuid::Uuid::new_v4().to_string();
    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);

    if let Err(e) = fs::create_dir_all(&instance_dir) {
        log_error!("Failed to create instance directory: {}", e);
        return Err(IoError::CreateDir {
            path: instance_dir.to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string());
    }

    let mut background_image = None;

    if let Some(img_path_str) = image_path {
        let img_path = PathBuf::from(&img_path_str);
        if img_path.exists() {
            if let Some(ext) = img_path.extension() {
                let new_filename = format!("background.{}", ext.to_string_lossy());
                let dest_path = instance_dir.join(&new_filename);
                if let Err(e) = fs::copy(&img_path, &dest_path) {
                    log_error!("Failed to copy background image: {}", e);
                } else {
                    background_image = Some(new_filename);
                }
            }
        }
    }

    let instance = Instance {
        id: id.clone(),
        name,
        version: version.clone(),
        versions: Some(vec![version]),
        mod_loader,
        mod_loader_version,
        icon: None,
        background_image,
        created,
    };

    let config_path = instance_dir.join("instance.json");
    let config_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance config: {}", e))?;

    if let Err(e) = fs::write(config_path, config_json) {
        log_error!("Failed to write instance config: {}", e);
        return Err(IoError::WriteError {
            path: instance_dir.join("instance.json").to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string());
    }

    log_info!("Instance created successfully: {}", id);
    Ok(instance)
}

#[command]
pub async fn get_instances() -> Result<Vec<Instance>, String> {
    log_debug!("get_instances called");
    let instances_dir = get_instances_dir();
    let mut instances = Vec::new();

    if let Ok(entries) = fs::read_dir(instances_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    let config_path = path.join("instance.json");
                    if config_path.exists() {
                        if let Ok(content) = fs::read_to_string(&config_path) {
                            if let Ok(instance) = serde_json::from_str::<Instance>(&content) {
                                log_debug!("Loaded instance: {} (Loader: {:?})", instance.name, instance.mod_loader);
                                instances.push(instance);
                            }
                        }
                    }
                }
            }
        }
    }

    instances.sort_by(|a, b| b.created.cmp(&a.created));
    log_info!("Loaded {} instances", instances.len());
    Ok(instances)
}

#[command]
pub async fn delete_instance(id: String) -> Result<(), String> {
    log_info!("Deleting instance: {}", id);
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);

    if !instance_dir.exists() {
        return Ok(());
    }

    let trash_name = format!(".trash_{}", id);
    let trash_path = instances_dir.join(&trash_name);

    if trash_path.exists() {
        let _ = fs::remove_dir_all(&trash_path);
    }

    match fs::rename(&instance_dir, &trash_path) {
        Ok(_) => {
            fs::remove_dir_all(&trash_path)
                .map_err(|e| {
                    log_error!("Instance removed from list, but failed to clean up files: {}", e);
                    IoError::DeleteError {
                        path: trash_path.to_string_lossy().to_string(),
                        reason: e.to_string(),
                    }
                }.to_string())
        }
        Err(e) => {
            log_warn!("Rename failed ({}), trying direct delete...", e);
            fs::remove_dir_all(&instance_dir)
                .map_err(|e| {
                    log_error!("Failed to delete instance: {}", e);
                    IoError::DeleteError {
                        path: instance_dir.to_string_lossy().to_string(),
                        reason: e.to_string(),
                    }
                }.to_string())
        }
    }?;

    log_info!("Instance deleted successfully: {}", id);
    Ok(())
}

#[command]
pub fn get_instance_path(id: String) -> String {
    let instances_dir = get_instances_dir();
    instances_dir.join(id).to_string_lossy().to_string()
}

#[command]
pub async fn open_instance_folder(id: String) -> Result<(), String> {
    log_info!("Opening instance folder: {}", id);
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);

    if instance_dir.exists() {
        open::that(&instance_dir)
            .map_err(|e| {
                log_error!("Failed to open folder: {}", e);
                format!("Failed to open folder: {}", e)
            })?;
        Ok(())
    } else {
        Err("Instance folder not found".to_string())
    }
}

#[command]
pub async fn update_instance(id: String, name: Option<String>, version: Option<String>, versions: Option<Vec<String>>, mod_loader: Option<String>, mod_loader_version: Option<String>, icon: Option<String>, background_image: Option<String>) -> Result<Instance, String> {
    log_debug!("Updating instance: {}", id);
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);
    let config_path = instance_dir.join("instance.json");

    if !config_path.exists() {
        log_error!("Instance not found: {}", id);
        return Err("Instance not found".to_string());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| IoError::ReadError {
            path: config_path.to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string())?;
    let mut instance: Instance = serde_json::from_str(&content)
        .map_err(|e| IoError::CorruptedFile {
            path: config_path.to_string_lossy().to_string(),
        }.to_string())?;

    if let Some(n) = name { instance.name = n; }
    if let Some(v) = version { instance.version = v; }
    if let Some(vs) = versions { instance.versions = Some(vs); }
    if let Some(ml) = mod_loader { instance.mod_loader = Some(ml); }
    if let Some(mlv) = mod_loader_version { instance.mod_loader_version = Some(mlv); }

    if let Some(i) = icon {
        let icon_path = PathBuf::from(&i);
        if icon_path.exists() && icon_path.is_absolute() {
             if let Some(ext) = icon_path.extension() {
                let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
                let new_filename = format!("icon_{}.{}", timestamp, ext.to_string_lossy());
                let dest_path = instance_dir.join(&new_filename);
                if let Err(e) = fs::copy(&icon_path, &dest_path) {
                    log_error!("Failed to copy icon: {}", e);
                    instance.icon = Some(i);
                } else {
                    instance.icon = Some(new_filename);
                }
            } else {
                instance.icon = Some(i);
            }
        } else {
            instance.icon = Some(i);
        }
    }

    if let Some(b) = background_image {
        let bg_path = PathBuf::from(&b);
        if bg_path.exists() && bg_path.is_absolute() {
            if let Some(ext) = bg_path.extension() {
                let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
                let new_filename = format!("background_{}.{}", timestamp, ext.to_string_lossy());
                let dest_path = instance_dir.join(&new_filename);

                if let Err(e) = fs::copy(&bg_path, &dest_path) {
                    log_error!("Failed to copy background image: {}", e);
                    instance.background_image = Some(b);
                } else {
                    instance.background_image = Some(new_filename);
                }
            } else {
                instance.background_image = Some(b);
            }
        } else {
            instance.background_image = Some(b);
        }
    }

    let config_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance config: {}", e))?;

    if let Err(e) = fs::write(config_path, config_json) {
        log_error!("Failed to write instance config: {}", e);
        return Err(IoError::WriteError {
            path: instance_dir.join("instance.json").to_string_lossy().to_string(),
            reason: e.to_string(),
        }.to_string());
    }

    log_info!("Instance updated successfully: {}", id);
    Ok(instance)
}

