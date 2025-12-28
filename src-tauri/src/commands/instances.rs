use tauri::command;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use crate::launcher::MinecraftLauncher;

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
    println!("[Command] create_instance called");
    println!("[Command] Name: {}, Version: {}, Loader: {:?}, LoaderVer: {:?}", name, version, mod_loader, mod_loader_version);
    
    let id = uuid::Uuid::new_v4().to_string();
    let created = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);
    
    if let Err(e) = fs::create_dir_all(&instance_dir) {
        return Err(format!("Failed to create instance directory: {}", e));
    }

    let mut background_image = None;

    if let Some(img_path_str) = image_path {
        let img_path = PathBuf::from(&img_path_str);
        if img_path.exists() {
            if let Some(ext) = img_path.extension() {
                let new_filename = format!("background.{}", ext.to_string_lossy());
                let dest_path = instance_dir.join(&new_filename);
                if let Err(e) = fs::copy(&img_path, &dest_path) {
                    println!("Failed to copy background image: {}", e);
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
        return Err(format!("Failed to write instance config: {}", e));
    }

    Ok(instance)
}

#[command]
pub async fn get_instances() -> Result<Vec<Instance>, String> {
    println!("[Command] get_instances called");
    let instances_dir = get_instances_dir();
    let mut instances = Vec::new();

    if let Ok(entries) = fs::read_dir(instances_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    let config_path = path.join("instance.json");
                    if config_path.exists() {
                        if let Ok(content) = fs::read_to_string(config_path) {
                            if let Ok(instance) = serde_json::from_str::<Instance>(&content) {
                                println!("[Command] Loaded instance: {} (Loader: {:?})", instance.name, instance.mod_loader);
                                instances.push(instance);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by created date descending
    instances.sort_by(|a, b| b.created.cmp(&a.created));

    Ok(instances)
}

#[command]
pub async fn delete_instance(id: String) -> Result<(), String> {
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);

    if instance_dir.exists() {
        fs::remove_dir_all(instance_dir).map_err(|e| format!("Failed to delete instance: {}", e))?;
    }

    Ok(())
}

#[command]
pub fn get_instance_path(id: String) -> String {
    let instances_dir = get_instances_dir();
    instances_dir.join(id).to_string_lossy().to_string()
}

#[command]
pub async fn open_instance_folder(id: String) -> Result<(), String> {
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);
    
    if instance_dir.exists() {
        open::that(instance_dir).map_err(|e| format!("Failed to open folder: {}", e))?;
        Ok(())
    } else {
        Err("Instance folder not found".to_string())
    }
}

#[command]
pub async fn update_instance(id: String, name: Option<String>, version: Option<String>, versions: Option<Vec<String>>, mod_loader: Option<String>, mod_loader_version: Option<String>, icon: Option<String>, background_image: Option<String>) -> Result<Instance, String> {
    let instances_dir = get_instances_dir();
    let instance_dir = instances_dir.join(&id);
    let config_path = instance_dir.join("instance.json");

    if !config_path.exists() {
        return Err("Instance not found".to_string());
    }

    let content = fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))?;
    let mut instance: Instance = serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;

    if let Some(n) = name { instance.name = n; }
    if let Some(v) = version { instance.version = v; }
    if let Some(vs) = versions { instance.versions = Some(vs); }
    if let Some(ml) = mod_loader { instance.mod_loader = Some(ml); }
    if let Some(mlv) = mod_loader_version { instance.mod_loader_version = Some(mlv); }
    // Allow clearing icon/bg if empty string passed? Or just update if Some.
    // For now assume we only set new values.
    if let Some(i) = icon { instance.icon = Some(i); }
    if let Some(b) = background_image { instance.background_image = Some(b); }

    let config_json = serde_json::to_string_pretty(&instance)
        .map_err(|e| format!("Failed to serialize instance config: {}", e))?;

    if let Err(e) = fs::write(config_path, config_json) {
        return Err(format!("Failed to write instance config: {}", e));
    }

    Ok(instance)
}

