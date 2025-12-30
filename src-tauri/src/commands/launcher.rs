use tauri::command;
use crate::launcher::{MinecraftLauncher, LaunchOptions, LaunchResult, VersionManager, MinecraftVersion};
// use std::path::PathBuf;

#[command]
pub async fn get_available_versions() -> Result<Vec<MinecraftVersion>, String> {
    println!("[Command] get_available_versions called");
    
    let cache_dir = MinecraftLauncher::get_default_minecraft_dir().join("versions");
    let version_manager = VersionManager::new(cache_dir);
    
    version_manager.get_release_versions().await
}

#[command]
pub async fn launch_minecraft(window: tauri::Window, options: serde_json::Value) -> Result<LaunchResult, String> {
    println!("[Command] launch_minecraft called");
    println!("[Command] Raw Options: {}", serde_json::to_string_pretty(&options).unwrap_or_default());
    
    // Debug keys
    if let Some(obj) = options.as_object() {
        println!("[Command] Keys present: {:?}", obj.keys().collect::<Vec<_>>());
    }

    let options: LaunchOptions = serde_json::from_value(options.clone())
        .map_err(|e| format!("Failed to parse options: {}", e))?;

    println!("[Command] Parsed Options: {:?}", options);
    println!("[Command] Version: {}", options.version);
    println!("[Command] Auth: {:?}", options.auth);
    
    let minecraft_dir = options.minecraft_dir.clone()
        .unwrap_or_else(|| MinecraftLauncher::get_default_minecraft_dir());
    
    // Debug & Fallback: Check instance.json on disk
    let config_path = minecraft_dir.join("instance.json");
    if config_path.exists() {
        match std::fs::read_to_string(&config_path) {
            Ok(content) => {
                println!("[Command] Instance Config on Disk: {}", content);
                
                // REMOVED FALLBACK: We no longer auto-apply modLoader from disk if options are missing.
                // This allows launching Vanilla versions (options.mod_loader = None) even if the instance
                // has a "global" mod loader set from previous configurations.
                // The frontend is now responsible for explicitly sending the mod loader if needed.
            },
            Err(e) => println!("[Command] Failed to read instance config: {}", e),
        }
    }

    let launcher = MinecraftLauncher::new(minecraft_dir, Some(window));
    launcher.launch(options).await
}

#[command]
pub fn generate_offline_uuid(username: String) -> String {
    MinecraftLauncher::generate_offline_uuid(&username)
}
