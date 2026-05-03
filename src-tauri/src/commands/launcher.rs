use tauri::command;
use crate::launcher::{MinecraftLauncher, LaunchOptions, LaunchResult, VersionManager, MinecraftVersion};
use crate::errors::LauncherError;
use crate::{log_info, log_error, log_debug};

#[command]
pub async fn get_available_versions() -> Result<Vec<MinecraftVersion>, String> {
    log_info!("get_available_versions called");

    let cache_dir = MinecraftLauncher::get_default_minecraft_dir().join("versions");
    let version_manager = VersionManager::new(cache_dir);

    version_manager.get_release_versions().await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn launch_minecraft(window: tauri::Window, options: serde_json::Value) -> Result<LaunchResult, String> {
    log_info!("launch_minecraft called");
    log_debug!("Raw Options: {}", serde_json::to_string_pretty(&options).unwrap_or_default());

    if let Some(obj) = options.as_object() {
        log_debug!("Keys present: {:?}", obj.keys().collect::<Vec<_>>());
    }

    let options: LaunchOptions = serde_json::from_value(options.clone())
        .map_err(|e| {
            log_error!("Failed to parse options: {}", e);
            format!("Failed to parse options: {}", e)
        })?;

    log_info!("Version: {}", options.version);
    log_info!("Auth: {:?}", options.auth);

    let minecraft_dir = options.minecraft_dir.clone()
        .unwrap_or_else(|| MinecraftLauncher::get_default_minecraft_dir());

    let config_path = minecraft_dir.join("instance.json");
    if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(content) => {
                log_debug!("Instance Config on Disk: {}", content);
            },
            Err(e) => log_debug!("Failed to read instance config: {}", e),
        }
    }

    let launcher = MinecraftLauncher::new(minecraft_dir, Some(window));
    launcher.launch(options).await
        .map_err(|e| {
            log_error!("Launch failed: {}", e);
            e.to_string()
        })
}

#[command]
pub fn generate_offline_uuid(username: String) -> String {
    log_debug!("Generating offline UUID for: {}", username);
    MinecraftLauncher::generate_offline_uuid(&username)
}

#[command]
pub async fn get_required_java_version(version: String) -> Result<u32, String> {
    log_info!("get_required_java_version called for {}", version);

    let cache_dir = MinecraftLauncher::get_default_minecraft_dir().join("versions");
    let version_manager = VersionManager::new(cache_dir);

    let manifest = version_manager.fetch_version_manifest().await
        .map_err(|e| e.to_string())?;

    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found in manifest", version))?;

    let details = version_manager.fetch_version_details(&version_info.url).await
        .map_err(|e| e.to_string())?;

    let major = details
        .java_version
        .map(|jv| jv.major_version)
        .unwrap_or(8);

    log_info!("Version {} requires Java {}", version, major);
    Ok(major)
}
