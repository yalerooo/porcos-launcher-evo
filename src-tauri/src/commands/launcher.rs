use tauri::command;
use crate::launcher::{MinecraftLauncher, LaunchOptions, LaunchResult, VersionManager, MinecraftVersion};

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

#[command]
pub async fn get_required_java_version(version: String) -> Result<u32, String> {
    println!("[Command] get_required_java_version called for {}", version);

    let cache_dir = MinecraftLauncher::get_default_minecraft_dir().join("versions");
    let version_manager = VersionManager::new(cache_dir);

    let manifest = version_manager.fetch_version_manifest().await?;

    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found in manifest", version))?;

    let details = version_manager.fetch_version_details(&version_info.url).await?;

    let major = details
        .java_version
        .map(|jv| jv.major_version)
        .unwrap_or(8); // Versions without javaVersion field default to Java 8

    println!("[Command] Version {} requires Java {}", version, major);
    Ok(major)
}
