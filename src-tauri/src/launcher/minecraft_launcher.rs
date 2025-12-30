use crate::launcher::VersionDetails;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Emitter, Window};
// use std::process::Child;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthData {
    Microsoft {
        access_token: String,
        uuid: String,
        username: String,
        xuid: Option<String>,
    },
    Offline {
        uuid: String,
        username: String,
        xuid: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchOptions {
    pub version: String,
    #[serde(rename = "modLoader", alias = "mod_loader")]
    pub mod_loader: Option<String>,
    #[serde(rename = "modLoaderVersion", alias = "mod_loader_version")]
    pub mod_loader_version: Option<String>,
    pub auth: AuthData,
    #[serde(rename = "memoryMin", alias = "memory_min")]
    pub memory_min: String,
    #[serde(rename = "memoryMax", alias = "memory_max")]
    pub memory_max: String,
    #[serde(rename = "javaPath", alias = "java_path")]
    pub java_path: Option<PathBuf>,
    #[serde(rename = "minecraftDir", alias = "minecraft_dir")]
    pub minecraft_dir: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct LoaderManifest {
    id: String,
    #[serde(rename = "inheritsFrom")]
    inherits_from: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    libraries: Vec<crate::launcher::version_details::Library>,
    arguments: Option<crate::launcher::version_details::Arguments>,
}

#[derive(Debug, Serialize)]
pub struct LaunchResult {
    pub success: bool,
    pub message: String,
    pub process_id: Option<u32>,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: String,
    progress: f64,
    total: u64,
    current: u64,
}

#[derive(Clone, Serialize)]
struct CrashReportEvent {
    path: String,
    content: String,
}

pub struct MinecraftLauncher {
    minecraft_dir: PathBuf,
    window: Option<Window>,
    http_client: reqwest::Client,
}

impl MinecraftLauncher {
    pub fn new(minecraft_dir: PathBuf, window: Option<Window>) -> Self {
        let http_client = reqwest::Client::builder()
            .user_agent("PorcosLauncher/1.0")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
            
        Self { minecraft_dir, window, http_client }
    }

    #[allow(dead_code)]
    pub fn get_minecraft_dir(&self) -> &PathBuf {
        &self.minecraft_dir
    }

    fn emit_progress(&self, stage: &str, current: u64, total: u64, percent: f64) {
        if let Some(window) = &self.window {
            let event = ProgressEvent {
                stage: stage.to_string(),
                progress: percent,
                total,
                current,
            };
            
            let _ = window.emit("launch-progress", event);
        }
    }

    pub async fn launch(&self, options: LaunchOptions) -> Result<LaunchResult, String> {
        println!("[MinecraftLauncher] ========== LAUNCHING MINECRAFT ==========");
        println!("[MinecraftLauncher] Version: {}", options.version);
        if let Some(loader) = &options.mod_loader {
            println!("[MinecraftLauncher] Mod Loader: {} ({})", loader, options.mod_loader_version.as_deref().unwrap_or("?"));
        }
        println!("[MinecraftLauncher] Auth: {:?}", options.auth);
        println!("[MinecraftLauncher] Memory: {} - {}", options.memory_min, options.memory_max);
        
        self.emit_progress("Iniciando lanzador...", 0, 100, 0.0);

        // 1. Get version manifest to find version URL
        use crate::launcher::version_manager::VersionManager;
        let cache_dir = self.minecraft_dir.join("versions");
        let version_manager = VersionManager::new(cache_dir.clone());
        
        println!("[MinecraftLauncher] Fetching version manifest...");
        self.emit_progress("Obteniendo manifiesto de versiones...", 5, 100, 1.0);
        let manifest = version_manager.fetch_version_manifest().await?;
        
        let version_info = manifest.versions.iter()
            .find(|v| v.id == options.version)
            .ok_or_else(|| format!("Version {} not found", options.version))?;
        
        println!("[MinecraftLauncher] Version URL: {}", version_info.url);
        
        // Fetch full version details
        self.emit_progress("Obteniendo detalles de versión...", 10, 100, 2.0);
        let mut version_details = version_manager.fetch_version_details(&version_info.url).await?;
        let version_dir = self.minecraft_dir.join("versions").join(&options.version);
        std::fs::create_dir_all(&version_dir).map_err(|e| format!("Failed to create version dir: {}", e))?;

        // --- MOD LOADER HANDLING ---
        if let (Some(loader), Some(loader_version)) = (&options.mod_loader, &options.mod_loader_version) {
            self.emit_progress(&format!("Preparando {}...", loader), 15, 100, 5.0);
            let loader_manifest = match loader.to_lowercase().as_str() {
                "fabric" => Some(self.get_fabric_profile(&options.version, loader_version).await?),
                "quilt" => Some(self.get_quilt_profile(&options.version, loader_version).await?),
                "neoforge" => Some(self.get_neoforge_profile(&options.version, loader_version).await?),
                "forge" => Some(self.get_forge_profile(&options.version, loader_version).await?),
                "vanilla" => None,
                _ => None,
            };

            if let Some(manifest) = loader_manifest {
                println!("[MinecraftLauncher] Applying mod loader manifest: {}", manifest.id);
                // Override main class
                version_details.main_class = manifest.main_class;
                
                // Merge libraries (handling overrides)
                self.merge_libraries(&mut version_details.libraries, manifest.libraries);
                
                // Merge arguments
                if let Some(args) = manifest.arguments {
                    match args {
                        crate::launcher::version_details::Arguments::New(new_args) => {
                             if let Some(crate::launcher::version_details::Arguments::New(ref mut existing_args)) = version_details.arguments {
                                 existing_args.game.extend(new_args.game);
                                 existing_args.jvm.extend(new_args.jvm);
                             } else {
                                 if version_details.arguments.is_none() {
                                     version_details.arguments = Some(crate::launcher::version_details::Arguments::New(new_args));
                                 }
                             }
                        },
                        crate::launcher::version_details::Arguments::Old(old_args) => {
                            if let Some(ref mut existing) = version_details.minecraft_arguments {
                                existing.push_str(" ");
                                existing.push_str(&old_args);
                            }
                        }
                    }
                }
            }
        }
        // ---------------------------

        // Initialize AssetManager
        use crate::launcher::asset_manager::AssetManager;
        let assets_dir = self.minecraft_dir.join("assets");
        let asset_manager = AssetManager::new(assets_dir.clone(), self.window.clone());

        println!("[MinecraftLauncher] Downloading assets...");
        // AssetManager handles 0-20%
        asset_manager.download_assets(&version_details.asset_index.id, &version_details.asset_index.url).await?;
        
        // Download client jar
        let client_jar_path = version_dir.join(format!("{}.jar", options.version));
        if !client_jar_path.exists() {
             println!("[MinecraftLauncher] Downloading client jar...");
             self.emit_progress("Descargando cliente...", 80, 100, 20.0);
             self.download_file(&version_details.downloads.client.url, &client_jar_path).await?;
        }

        // 5. Download libraries and extract natives (following nitrolaunch exactly)
        println!("[MinecraftLauncher] Processing libraries...");
        self.emit_progress("Procesando librerías...", 85, 100, 22.0);
        let libraries_dir = self.minecraft_dir.join("libraries");
        let natives_dir = version_dir.join("natives");
        let natives_jars_dir = self.minecraft_dir.join("natives"); // Separate folder for native JARs
        
        std::fs::create_dir_all(&libraries_dir)
            .map_err(|e| format!("Failed to create libraries directory: {}", e))?;
        std::fs::create_dir_all(&natives_jars_dir)
            .map_err(|e| format!("Failed to create natives jars directory: {}", e))?;
            
        // Clean natives directory to ensure no leftovers
        if natives_dir.exists() {
            std::fs::remove_dir_all(&natives_dir)
                .map_err(|e| format!("Failed to clean natives directory: {}", e))?;
        }
        std::fs::create_dir_all(&natives_dir)
            .map_err(|e| format!("Failed to create natives directory: {}", e))?;
        
        let mut classpath_entries = vec![client_jar_path.to_string_lossy().to_string()];
        
        let total_libs = version_details.libraries.len() as u64;
        let mut processed_libs = 0;

        for library in &version_details.libraries {
            processed_libs += 1;
            if processed_libs % 5 == 0 {
                let lib_percent = processed_libs as f64 / total_libs as f64;
                // Map libraries to 20% - 90% range
                let global_progress = 20.0 + (lib_percent * 70.0);
                self.emit_progress("Verificando librerías...", processed_libs, total_libs, global_progress);
            }

            println!("[MinecraftLauncher] Checking library: {}", library.name);

            if !VersionDetails::should_use_library(library) {
                continue;
            }
            
            // Get native classifier key for this OS
            let native_classifier_key = if let Some(natives) = &library.natives {
                #[cfg(target_os = "windows")]
                { natives.get("windows").map(|s| s.as_str()) }
                #[cfg(target_os = "macos")]
                { natives.get("osx").map(|s| s.as_str()) }
                #[cfg(target_os = "linux")]
                { natives.get("linux").map(|s| s.as_str()) }
            } else {
                None
            };

            if let Some(downloads) = &library.downloads {
                // Check if this library has native classifiers
                if let Some(key) = native_classifier_key {
                    if let Some(classifiers) = &downloads.classifiers {
                        if let Some(native_artifact) = classifiers.get(key) {
                            println!("[MinecraftLauncher] Processing native library: {} ({})", library.name, key);
                            
                            // Download native jar to natives-jars directory (using the path from the artifact)
                            let path_in_artifact = native_artifact.path.as_ref()
                                .ok_or_else(|| format!("Native artifact missing path field: {}", library.name))?;
                            let native_jar_path = natives_jars_dir.join(path_in_artifact);
                            if !native_jar_path.exists() {
                                if let Some(parent) = native_jar_path.parent() {
                                    std::fs::create_dir_all(parent).ok();
                                }
                                println!("[MinecraftLauncher] Downloading native JAR from: {}", native_artifact.url);
                                self.download_file(&native_artifact.url, &native_jar_path).await?;
                            }
                            
                            // Add native JAR to classpath
                            classpath_entries.push(native_jar_path.to_string_lossy().to_string());
                            
                            // Extract native jar to natives directory
                            let excludes = library.extract.as_ref().map(|e| e.exclude.clone()).unwrap_or_default();
                            println!("[MinecraftLauncher] Extracting native JAR: {:?}", native_jar_path);
                            self.extract_native(&native_jar_path, &natives_dir, &excludes)?;
                            
                            // Also download the artifact (main JAR) if it exists
                            if let Some(artifact) = &downloads.artifact {
                                let path_in_artifact = artifact.path.as_ref()
                                    .ok_or_else(|| format!("Artifact missing path field: {}", library.name))?;
                                let lib_path = libraries_dir.join(path_in_artifact);
                                
                                if !lib_path.exists() {
                                    if let Some(parent) = lib_path.parent() {
                                        std::fs::create_dir_all(parent).ok();
                                    }
                                    self.download_file(&artifact.url, &lib_path).await?;
                                }
                                
                                classpath_entries.push(lib_path.to_string_lossy().to_string());
                            }
                            
                            continue; // Skip artifact-only processing
                        }
                    }
                }
                
                // Regular library or library without native classifiers - just download artifact
                if let Some(artifact) = &downloads.artifact {
                    let path_in_artifact = artifact.path.as_ref()
                        .ok_or_else(|| format!("Artifact missing path field: {}", library.name))?;
                    let lib_path = libraries_dir.join(path_in_artifact);
                    
                    if !lib_path.exists() {
                        if let Some(parent) = lib_path.parent() {
                            std::fs::create_dir_all(parent).ok();
                        }
                        self.download_file(&artifact.url, &lib_path).await?;
                    }
                    
                    classpath_entries.push(lib_path.to_string_lossy().to_string());
                }
            } else {
                // Library without downloads section (Maven style)
                let maven_url = library.url.as_deref().unwrap_or("https://libraries.minecraft.net/");
                let path = self.get_relative_library_path(&library.name);
                let full_url = format!("{}{}", maven_url, path.to_string_lossy().replace("\\", "/"));
                
                let lib_path = libraries_dir.join(&path);
                if !lib_path.exists() {
                    if let Some(parent) = lib_path.parent() {
                        std::fs::create_dir_all(parent).ok();
                    }
                    println!("[MinecraftLauncher] Downloading library (maven): {}", full_url);
                    if let Err(e) = self.download_file(&full_url, &lib_path).await {
                        println!("[MinecraftLauncher] Failed to download library {}: {}", library.name, e);
                        // If it fails, it might be a local library (generated).
                        // We should check if it exists locally anyway.
                    }
                }
                if lib_path.exists() {
                    classpath_entries.push(lib_path.to_string_lossy().to_string());
                } else {
                    println!("[MinecraftLauncher] WARNING: Library not found and download failed: {}", library.name);
                }
            }
        }
        
        // Debug: List natives directory
        println!("[MinecraftLauncher] Natives directory: {:?}", natives_dir);
        if let Ok(entries) = std::fs::read_dir(&natives_dir) {
            println!("[MinecraftLauncher] Natives found:");
            for entry in entries.flatten() {
                println!("  - {:?}", entry.file_name());
            }
        } else {
             println!("[MinecraftLauncher] Warning: Could not read natives directory!");
        }

        // 6. Find Java
        use crate::launcher::java_detector;
        self.emit_progress("Buscando Java...", 95, 100, 92.0);
        let java_path = if let Some(custom_java) = options.java_path {
            custom_java
        } else {
            java_detector::find_java()?
        };
        
        println!("[MinecraftLauncher] Using Java: {:?}", java_path);
        
        // 7. Build arguments
        let (username, uuid, xuid) = match &options.auth {
            AuthData::Microsoft { username, uuid, xuid, .. } => (username.clone(), uuid.clone(), xuid.clone().unwrap_or("0".to_string())),
            AuthData::Offline { username, uuid, xuid } => (username.clone(), uuid.clone(), xuid.clone().unwrap_or("0".to_string())),
        };
        
        let access_token = match &options.auth {
            AuthData::Microsoft { access_token, .. } => access_token.clone(),
            AuthData::Offline { .. } => "0".to_string(),
        };
        
        // Prepare substitutions
        let classpath = classpath_entries.join(if cfg!(windows) { ";" } else { ":" });
        let mut substitutions = std::collections::HashMap::new();
        substitutions.insert("${natives_directory}", natives_dir.to_string_lossy().to_string());
        substitutions.insert("${launcher_name}", "PorcosLauncher".to_string());
        substitutions.insert("${launcher_version}", "0.1.1".to_string());
        substitutions.insert("${classpath}", classpath.clone());
        substitutions.insert("${library_directory}", libraries_dir.to_string_lossy().to_string());
        substitutions.insert("${classpath_separator}", if cfg!(windows) { ";" } else { ":" }.to_string());
        substitutions.insert("${version_name}", options.version.clone());
        substitutions.insert("${game_directory}", self.minecraft_dir.to_string_lossy().to_string());
        substitutions.insert("${assets_root}", assets_dir.to_string_lossy().to_string());
        substitutions.insert("${assets_index_name}", version_details.asset_index.id.clone());
        substitutions.insert("${auth_player_name}", username.clone());
        substitutions.insert("${auth_uuid}", uuid.clone());
        substitutions.insert("${auth_access_token}", access_token.clone());
        substitutions.insert("${auth_xuid}", xuid.clone());
        substitutions.insert("${clientid}", "00000000-0000-0000-0000-000000000000".to_string());
        substitutions.insert("${user_type}", "msa".to_string());
        substitutions.insert("${user_properties}", "{}".to_string());
        substitutions.insert("${version_type}", version_details.version_type.clone());
        substitutions.insert("${resolution_width}", "854".to_string());
        substitutions.insert("${resolution_height}", "480".to_string());

        let mut command = std::process::Command::new(&java_path);
        command
            .arg(format!("-Xmx{}", options.memory_max))
            .arg(format!("-Xms{}", options.memory_min));

        // JVM Args
        let mut jvm_args_added = false;
        if let Some(args) = &version_details.arguments {
            match args {
                crate::launcher::version_details::Arguments::New(new_args) => {
                    if !new_args.jvm.is_empty() {
                        let processed = self.get_arguments(&new_args.jvm, &substitutions);
                        for arg in processed {
                            command.arg(arg);
                        }
                        jvm_args_added = true;
                    }
                },
                _ => {}
            }
        }

        if !jvm_args_added {
            command
                .arg(format!("-Djava.library.path={}", natives_dir.to_string_lossy()))
                .arg("-cp")
                .arg(&classpath);
        }

        command.arg(&version_details.main_class);
        
        // Game Args
        let mut game_args_added = false;
        let mut has_xuid = false;
        let mut has_client_id = false;
        let mut has_user_properties = false;

        if let Some(args) = &version_details.arguments {
             match args {
                crate::launcher::version_details::Arguments::New(new_args) => {
                    if !new_args.game.is_empty() {
                        let processed = self.get_arguments(&new_args.game, &substitutions);
                        for arg in processed {
                            if arg == "--xuid" { has_xuid = true; }
                            if arg == "--clientId" { has_client_id = true; }
                            if arg == "--userProperties" { has_user_properties = true; }
                            command.arg(arg);
                        }
                        game_args_added = true;
                    }
                },
                _ => {}
            }
        }

        if !game_args_added {
            if let Some(mc_args) = &version_details.minecraft_arguments {
                 let processed = self.replace_variables(mc_args, &substitutions);
                 for arg in processed.split_whitespace() {
                     if arg == "--xuid" { has_xuid = true; }
                     if arg == "--clientId" { has_client_id = true; }
                     if arg == "--userProperties" { has_user_properties = true; }
                     command.arg(arg);
                 }
            } else {
                // Fallback to manual construction if no args found (unlikely for modern versions)
                let game_args = vec![
                    "--username".to_string(), username,
                    "--uuid".to_string(), uuid,
                    "--accessToken".to_string(), access_token,
                    "--xuid".to_string(), xuid.clone(),
                    "--clientId".to_string(), "00000000-0000-0000-0000-000000000000".to_string(),
                    "--version".to_string(), options.version.clone(),
                    "--gameDir".to_string(), self.minecraft_dir.to_string_lossy().to_string(),
                    "--assetsDir".to_string(), self.minecraft_dir.join("assets").to_string_lossy().to_string(),
                    "--assetIndex".to_string(), version_details.asset_index.id,
                    "--userType".to_string(), "msa".to_string(),
                    "--versionType".to_string(), version_details.version_type,
                    "--userProperties".to_string(), "{}".to_string(),
                ];
                for arg in game_args {
                    command.arg(arg);
                }
                has_xuid = true;
                has_client_id = true;
                has_user_properties = true;
            }
        }

        // Force add xuid and clientId if missing and using Microsoft auth
        if let AuthData::Microsoft { .. } = options.auth {
             if !has_xuid && xuid != "0" {
                 println!("[MinecraftLauncher] Appending missing --xuid argument");
                 command.arg("--xuid");
                 command.arg(&xuid);
             }
             if !has_client_id {
                 println!("[MinecraftLauncher] Appending missing --clientId argument");
                 command.arg("--clientId");
                 command.arg("00000000-0000-0000-0000-000000000000");
             }
             if !has_user_properties {
                 println!("[MinecraftLauncher] Appending missing --userProperties argument");
                 command.arg("--userProperties");
                 command.arg("{}");
             }
        }
        
        // Set working directory to game directory
        command.current_dir(&self.minecraft_dir);

        println!("[MinecraftLauncher] Launching game process...");
        println!("[MinecraftLauncher] Command: {:?}", command);
        self.emit_progress("Iniciando proceso del juego...", 98, 100, 95.0);
        
        // 8. Launch the game!
        // Configure stdout to be piped
        command.stdout(std::process::Stdio::piped());
        
        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to spawn Minecraft process: {}", e))?;
        
        let process_id = child.id();
        println!("[MinecraftLauncher] ✅ Minecraft launched! PID: {}", process_id);
        
        // Spawn a thread to monitor stdout
        if let Some(stdout) = child.stdout.take() {
            let window_clone = self.window.clone();
            let minecraft_dir = self.minecraft_dir.clone();
            
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(stdout);
                let mut game_started = false;
                
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Emit game output event (optional, for console)
                        if let Some(window) = &window_clone {
                            let _ = window.emit("game-output", line.clone());
                            
                            // Check for Render thread (Game Ready)
                            if !game_started && (line.contains("[Render thread/INFO]:") || line.contains("Sound engine started")) {
                                game_started = true;
                                let event = ProgressEvent {
                                    stage: "¡Juego iniciado!".to_string(),
                                    progress: 100.0,
                                    total: 100,
                                    current: 100,
                                };
                                let _ = window.emit("launch-progress", event);
                            }
                        }
                        println!("[Game] {}", line);
                    }
                }

                // Wait for process to exit and check for crash
                match child.wait() {
                    Ok(status) => {
                        println!("[MinecraftLauncher] Process finished. Exit code: {:?}", status.code());
                        
                        if !status.success() {
                            println!("[MinecraftLauncher] Game exited with error. Checking for crash reports...");
                            
                            // Look for crash reports
                            let crash_reports_dir = minecraft_dir.join("crash-reports");
                            println!("[MinecraftLauncher] Checking directory: {:?}", crash_reports_dir);
                            
                            if crash_reports_dir.exists() {
                                if let Ok(entries) = std::fs::read_dir(&crash_reports_dir) {
                                    let mut reports: Vec<_> = entries
                                        .filter_map(|e| e.ok())
                                        .filter(|e| {
                                            if let Ok(file_type) = e.file_type() {
                                                file_type.is_file() && e.path().extension().map_or(false, |ext| ext == "txt")
                                            } else {
                                                false
                                            }
                                        })
                                        .collect();
                                    
                                    println!("[MinecraftLauncher] Found {} potential crash report files.", reports.len());

                                    // Sort by modification time (newest first)
                                    reports.sort_by(|a, b| {
                                        let a_time = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                        let b_time = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                        b_time.cmp(&a_time)
                                    });

                                    if let Some(latest) = reports.first() {
                                        let report_path = latest.path();
                                        println!("[MinecraftLauncher] Latest report file: {:?}", report_path);
                                        
                                        // Check if it's recent (e.g. within last 5 minutes)
                                        if let Ok(metadata) = latest.metadata() {
                                            if let Ok(modified) = metadata.modified() {
                                                if let Ok(elapsed) = modified.elapsed() {
                                                    println!("[MinecraftLauncher] File modified {:?} ago.", elapsed);
                                                    if elapsed.as_secs() < 300 {
                                                        println!("[MinecraftLauncher] Crash report is recent. Reading content...");
                                                        // It's likely the crash report for this session
                                                        if let Ok(content) = std::fs::read_to_string(&report_path) {
                                                            let msg = format!("[Game] #@!@# Game crashed! Crash report saved to: #@!@# {}", report_path.to_string_lossy());
                                                            if let Some(window) = &window_clone {
                                                                let _ = window.emit("game-output", msg.clone());
                                                                // let _ = window.emit("game-output", content.clone()); // Don't spam console with full report
                                                                
                                                                // Emit structured crash event
                                                                println!("[MinecraftLauncher] Emitting game-crashed event to frontend...");
                                                                let emit_result = window.emit("game-crashed", CrashReportEvent {
                                                                    path: report_path.to_string_lossy().to_string(),
                                                                    content: content.clone()
                                                                });
                                                                
                                                                if let Err(e) = emit_result {
                                                                    println!("[MinecraftLauncher] Failed to emit game-crashed: {}", e);
                                                                } else {
                                                                    println!("[MinecraftLauncher] game-crashed event emitted successfully.");
                                                                }
                                                            }
                                                            println!("{}", msg);
                                                        } else {
                                                            println!("[MinecraftLauncher] Failed to read crash report content.");
                                                        }
                                                    } else {
                                                        println!("[MinecraftLauncher] Crash report is too old (> 300s). Ignoring.");
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        println!("[MinecraftLauncher] No crash reports found in directory.");
                                    }
                                } else {
                                    println!("[MinecraftLauncher] Failed to read crash-reports directory.");
                                }
                            } else {
                                println!("[MinecraftLauncher] crash-reports directory does not exist.");
                            }
                        }

                        // Emit game exited event to ensure frontend state is reset
                        if let Some(window) = &window_clone {
                             println!("[MinecraftLauncher] Emitting game-exited event...");
                             let _ = window.emit("game-exited", ());
                        }
                    },
                    Err(e) => {
                        println!("[MinecraftLauncher] Failed to wait for child process: {}", e);
                        if let Some(window) = &window_clone {
                             let _ = window.emit("game-exited", ());
                        }
                    },
                }
            });
        }
        
        Ok(LaunchResult {
            success: true,
            message: format!("Minecraft launched successfully (PID: {})", process_id),
            process_id: Some(process_id),
        })
    }

    async fn get_fabric_profile(&self, game_version: &str, loader_version: &str) -> Result<LoaderManifest, String> {
        let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", game_version, loader_version);
        let response = self.http_client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to fetch Fabric profile: {}", response.status()));
        }
        response.json().await.map_err(|e| e.to_string())
    }

    async fn get_quilt_profile(&self, game_version: &str, loader_version: &str) -> Result<LoaderManifest, String> {
        let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json", game_version, loader_version);
        let response = self.http_client.get(&url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Failed to fetch Quilt profile: {}", response.status()));
        }
        response.json().await.map_err(|e| e.to_string())
    }

    async fn get_neoforge_profile(&self, _game_version: &str, loader_version: &str) -> Result<LoaderManifest, String> {
        // Construct installer URL
        let url = format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar", loader_version, loader_version);
        
        // Download to temp file
        let temp_dir = std::env::temp_dir();
        let installer_path = temp_dir.join(format!("neoforge-{}-installer.jar", loader_version));
        
        println!("[MinecraftLauncher] Downloading NeoForge installer: {}", url);
        self.download_file(&url, &installer_path).await?;

        // Run the installer to generate libraries
        self.install_neoforge_client(&installer_path).await?;
        
        // Extract client.json
        let file = std::fs::File::open(&installer_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        // Try "client.json" or "version.json"
        let mut content = String::new();
        let mut found = false;

        if let Ok(mut file) = archive.by_name("client.json") {
            std::io::Read::read_to_string(&mut file, &mut content).map_err(|e| e.to_string())?;
            found = true;
        }
        
        if !found {
            if let Ok(mut file) = archive.by_name("version.json") {
                std::io::Read::read_to_string(&mut file, &mut content).map_err(|e| e.to_string())?;
                found = true;
            }
        }

        if !found {
            return Err("Could not find client.json or version.json in NeoForge installer".to_string());
        }
        
        // Parse
        let manifest: LoaderManifest = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        
        Ok(manifest)
    }

    async fn install_neoforge_client(&self, installer_path: &PathBuf) -> Result<(), String> {
        println!("[MinecraftLauncher] Installing NeoForge client from {:?}", installer_path);
        
        // 1. Determine package prefix by inspecting the jar
        let file = std::fs::File::open(installer_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        let package_prefix = if archive.by_name("net/neoforged/installer/SimpleInstaller.class").is_ok() {
            "net.neoforged"
        } else if archive.by_name("net/minecraftforge/installer/SimpleInstaller.class").is_ok() {
            "net.minecraftforge"
        } else {
            return Err("Unknown NeoForge installer structure (neither net.neoforged nor net.minecraftforge found)".to_string());
        };
        
        println!("[MinecraftLauncher] Detected NeoForge installer package: {}", package_prefix);

        // 2. Create temp directory for installation
        let install_dir = std::env::temp_dir().join(format!("neoforge_install_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
        
        // Create dummy launcher profiles to trick the installer
        std::fs::write(install_dir.join("launcher_profiles.json"), "{}").map_err(|e| e.to_string())?;
        std::fs::write(install_dir.join("launcher_profiles_microsoft_store.json"), "{}").map_err(|e| e.to_string())?;

        // 3. Write the installer script
        let script_content = format!(r#"
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import {0}.installer.SimpleInstaller;
import {0}.installer.actions.Actions;
import {0}.installer.actions.ProgressCallback;
import {0}.installer.json.InstallV1;
import {0}.installer.json.Util;

public class NeoForgeInstaller {{
    public static void main(String[] args) throws IOException {{
        SimpleInstaller.headless = true;
        System.setProperty("java.net.preferIPv4Stack", "true");
        ProgressCallback monitor = ProgressCallback.withOutputs(new OutputStream[] {{ System.out }});
        Actions action = Actions.CLIENT;
        try {{
            InstallV1 install = Util.loadInstallProfile();
            File installer = new File(SimpleInstaller.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (!action.getAction(install, monitor).run(new File("."), a -> true, installer)) {{
                System.out.println("Error");
                System.exit(1);
            }}
            System.out.println(action.getSuccess());
        }} catch (Throwable e) {{
            e.printStackTrace();
            System.exit(1);
        }}
        System.exit(0);
    }}
}}
"#, package_prefix);

        let script_path = install_dir.join("NeoForgeInstaller.java");
        std::fs::write(&script_path, script_content).map_err(|e| e.to_string())?;
        
        // 4. Run the installer script
        // We need to find java again.
        use crate::launcher::java_detector;
        let java_path = java_detector::find_java()?;
        
        println!("[MinecraftLauncher] Running NeoForge installer script...");
        let output = std::process::Command::new(&java_path)
            .arg("-cp")
            .arg(installer_path) // Classpath: just the installer jar
            .arg(&script_path)   // Source file to run
            .current_dir(&install_dir) // Run in temp dir so libraries are generated there
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;
            
        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[MinecraftLauncher] Installer STDOUT: {}", stdout);
            println!("[MinecraftLauncher] Installer STDERR: {}", stderr);
            return Err(format!("NeoForge installer failed with exit code {}", output.status));
        }
        
        // 5. Copy generated libraries to the real libraries directory
        let generated_libs = install_dir.join("libraries");
        let target_libs = self.minecraft_dir.join("libraries");
        
        if generated_libs.exists() {
            println!("[MinecraftLauncher] Copying generated libraries to {:?}", target_libs);
            self.copy_dir_all(&generated_libs, &target_libs)?;
        } else {
            println!("[MinecraftLauncher] Warning: No libraries folder generated by installer!");
        }
        
        // Cleanup
        let _ = std::fs::remove_dir_all(&install_dir);
        
        Ok(())
    }

    fn copy_dir_all(&self, src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let ty = entry.file_type().map_err(|e| e.to_string())?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());
            
            if ty.is_dir() {
                self.copy_dir_all(&src_path, &dst_path)?;
            } else {
                std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    async fn get_forge_profile(&self, game_version: &str, loader_version: &str) -> Result<LoaderManifest, String> {
        // URL format: https://maven.minecraftforge.net/net/minecraftforge/forge/{mc_ver}-{forge_ver}/forge-{mc_ver}-{forge_ver}-installer.jar
        let long_version = format!("{}-{}", game_version, loader_version);
        let url = format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar", long_version, long_version);
        
        let temp_dir = std::env::temp_dir();
        let installer_path = temp_dir.join(format!("forge-{}-installer.jar", long_version));
        
        println!("[MinecraftLauncher] Downloading Forge installer: {}", url);
        self.download_file(&url, &installer_path).await?;
        
        // Run installer
        self.install_forge_client(&installer_path).await?;

        let file = std::fs::File::open(&installer_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        let mut content = String::new();
        let mut found = false;

        if let Ok(mut file) = archive.by_name("version.json") {
            std::io::Read::read_to_string(&mut file, &mut content).map_err(|e| e.to_string())?;
            found = true;
        }
        
        if !found {
            if let Ok(mut file) = archive.by_name("install_profile.json") {
                std::io::Read::read_to_string(&mut file, &mut content).map_err(|e| e.to_string())?;
                found = true;
            }
        }

        if !found {
            return Err("Could not find version.json in Forge installer".to_string());
        }
        
        let manifest: LoaderManifest = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(manifest)
    }

    async fn install_forge_client(&self, installer_path: &PathBuf) -> Result<(), String> {
        println!("[MinecraftLauncher] Installing Forge client from {:?}", installer_path);
        
        let install_dir = std::env::temp_dir().join(format!("forge_install_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
        
        // Dummy profiles
        std::fs::write(install_dir.join("launcher_profiles.json"), "{}").map_err(|e| e.to_string())?;
        std::fs::write(install_dir.join("launcher_profiles_microsoft_store.json"), "{}").map_err(|e| e.to_string())?;

        let script_content = r#"
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import net.minecraftforge.installer.SimpleInstaller;
import net.minecraftforge.installer.actions.Actions;
import net.minecraftforge.installer.actions.ProgressCallback;
import net.minecraftforge.installer.json.InstallV1;
import net.minecraftforge.installer.json.Util;

public class ForgeInstaller {
    public static void main(String[] args) throws IOException {
        SimpleInstaller.headless = true;
        System.setProperty("java.net.preferIPv4Stack", "true");
        ProgressCallback monitor = ProgressCallback.withOutputs(new OutputStream[] { System.out });
        Actions action = Actions.CLIENT;
        try {
            InstallV1 install = Util.loadInstallProfile();
            File installer = new File(SimpleInstaller.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            if (!action.getAction(install, monitor).run(new File("."), installer)) {
                System.out.println("Error");
                System.exit(1);
            }
            System.out.println(action.getSuccess());
        } catch (Throwable e) {
            e.printStackTrace();
            System.exit(1);
        }
        System.exit(0);
    }
}
"#;
        let script_path = install_dir.join("ForgeInstaller.java");
        std::fs::write(&script_path, script_content).map_err(|e| e.to_string())?;
        
        use crate::launcher::java_detector;
        let java_path = java_detector::find_java()?;
        
        println!("[MinecraftLauncher] Running Forge installer script...");
        let output = std::process::Command::new(&java_path)
            .arg("-cp")
            .arg(installer_path)
            .arg(&script_path)
            .current_dir(&install_dir)
            .output()
            .map_err(|e| format!("Failed to execute Java: {}", e))?;
            
        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[MinecraftLauncher] Installer STDOUT: {}", stdout);
            println!("[MinecraftLauncher] Installer STDERR: {}", stderr);
            return Err(format!("Forge installer failed with exit code {}", output.status));
        }
        
        let generated_libs = install_dir.join("libraries");
        let target_libs = self.minecraft_dir.join("libraries");
        
        if generated_libs.exists() {
            println!("[MinecraftLauncher] Copying generated libraries to {:?}", target_libs);
            self.copy_dir_all(&generated_libs, &target_libs)?;
        }
        
        let _ = std::fs::remove_dir_all(&install_dir);
        Ok(())
    }

    fn get_relative_library_path(&self, library_name: &str) -> PathBuf {
        let parts: Vec<&str> = library_name.split(':').collect();
        if parts.len() >= 3 {
            let group = parts[0].replace('.', "/");
            let artifact = parts[1];
            let version = parts[2];
            PathBuf::from(group).join(artifact).join(version).join(format!("{}-{}.jar", artifact, version))
        } else {
            PathBuf::from(format!("{}.jar", library_name))
        }
    }

    fn extract_native(&self, jar_path: &std::path::Path, output_dir: &std::path::Path, excludes: &[String]) -> Result<(), String> {
        println!("[MinecraftLauncher] Extracting native jar: {:?}", jar_path);
        let file = std::fs::File::open(jar_path)
            .map_err(|e| format!("Failed to open native jar: {}", e))?;
        
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read zip archive: {}", e))?;
            
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read zip file: {}", e))?;
                
            // Get the full path in the zip
            let full_path = match file.enclosed_name() {
                Some(path) => path.to_owned(),
                None => continue,
            };
            
            // Skip META-INF
            if full_path.starts_with("META-INF") {
                continue;
            }

            // Check excludes
            let path_str = full_path.to_string_lossy();
            if excludes.iter().any(|e| path_str.contains(e)) {
                continue;
            }
            
            // Only extract shared libraries (.dll, .so, .dylib)
            let extension = match full_path.extension() {
                Some(ext) => ext.to_string_lossy().to_string(),
                None => continue,
            };

            let is_shared_lib = extension == "dll" || extension == "dylib" || extension == "so";
            if !is_shared_lib {
                continue;
            }

            // Ensure we don't extract directories
            if file.is_dir() {
                continue;
            }

            // IMPORTANT: Keep the directory structure from the jar (like nitrolaunch does)
            let outpath = output_dir.join(&full_path);
            println!("[MinecraftLauncher] Extracting {:?} to {:?}", full_path, outpath);
            
            // Create parent directories if needed
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir {:?}: {}", parent, e))?;
            }
            
            // Create output file
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create output file {:?}: {}", outpath, e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to copy file content: {}", e))?;
        }
        
        Ok(())
    }

    fn get_library_path(&self, library_name: &str, libraries_dir: &std::path::Path) -> std::path::PathBuf {
        // Parse Maven-style library name: group:artifact:version
        let parts: Vec<&str> = library_name.split(':').collect();
        if parts.len() >= 3 {
            let group = parts[0].replace('.', "/");
            let artifact = parts[1];
            let version = parts[2];
            
            libraries_dir
                .join(group)
                .join(artifact)
                .join(version)
                .join(format!("{}-{}.jar", artifact, version))
        } else {
            libraries_dir.join(format!("{}.jar", library_name))
        }
    }

    async fn download_file(&self, url: &str, path: &std::path::Path) -> Result<(), String> {
        println!("[MinecraftLauncher] Downloading file: {}", url);
        let response = self.http_client.get(url)
            .send()
            .await
            .map_err(|e| format!("Download failed (network): {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Download failed with status: {} for URL: {}", response.status(), url));
        }
        
        let bytes = response.bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;
        
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        std::fs::write(path, &bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        
        Ok(())
    }

    /// Generate offline UUID from username (same algorithm as old launcher)
    pub fn generate_offline_uuid(username: &str) -> String {
        use crypto::digest::Digest;
        use crypto::md5::Md5;
        
        let data = format!("OfflinePlayer:{}", username);
        let mut hasher = Md5::new();
        hasher.input_str(&data);
        
        let mut bytes = [0u8; 16];
        hasher.result(&mut bytes);
        
        // Set version to 3 (MD5 hash based)
        bytes[6] = (bytes[6] & 0x0f) | 0x30;
        // Set variant
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        
        format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5],
            bytes[6], bytes[7],
            bytes[8], bytes[9],
            bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        )
    }

    /// Get default Minecraft directory
    pub fn get_default_minecraft_dir() -> PathBuf {
        let home = dirs::home_dir().expect("Could not find home directory");
        
        #[cfg(target_os = "windows")]
        {
            home.join("AppData").join("Roaming").join(".minecraft")
        }
        
        #[cfg(target_os = "macos")]
        {
            home.join("Library").join("Application Support").join("minecraft")
        }
        
        #[cfg(target_os = "linux")]
        {
            home.join(".minecraft")
        }
    }

    fn get_arguments(&self, args: &Vec<crate::launcher::version_details::ArgumentItem>, substitutions: &std::collections::HashMap<&str, String>) -> Vec<String> {
        let mut result = Vec::new();
        for arg in args {
            match arg {
                crate::launcher::version_details::ArgumentItem::Simple(value) => {
                    result.push(self.replace_variables(value, substitutions));
                },
                crate::launcher::version_details::ArgumentItem::Conditional(cond) => {
                    if self.check_rules(&cond.rules) {
                        match &cond.value {
                            crate::launcher::version_details::ArgumentValue::Single(v) => {
                                result.push(self.replace_variables(v, substitutions));
                            },
                            crate::launcher::version_details::ArgumentValue::Multiple(vec) => {
                                for v in vec {
                                    result.push(self.replace_variables(v, substitutions));
                                }
                            }
                        }
                    }
                }
            }
        }
        result
    }

    fn replace_variables(&self, input: &str, substitutions: &std::collections::HashMap<&str, String>) -> String {
        let mut result = input.to_string();
        for (key, value) in substitutions {
            result = result.replace(key, value);
        }
        result
    }

    fn check_rules(&self, rules: &Vec<crate::launcher::version_details::Rule>) -> bool {
        for rule in rules {
            let mut os_match = true;
            let mut arch_match = true;
            let mut feature_match = true;

            if let Some(os) = &rule.os {
                if let Some(name) = &os.name {
                    #[cfg(target_os = "windows")]
                    let current = "windows";
                    #[cfg(target_os = "macos")]
                    let current = "osx";
                    #[cfg(target_os = "linux")]
                    let current = "linux";
                    if name != current { os_match = false; }
                }
                
                if let Some(arch) = &os.arch {
                    #[cfg(target_arch = "x86")]
                    let current_arch = "x86";
                    #[cfg(target_arch = "x86_64")]
                    let current_arch = "x64";
                    if arch != current_arch { arch_match = false; }
                }
            }

            if let Some(features) = &rule.features {
                for (_feature, value) in features {
                    // We currently don't support any specific features like quick_play
                    // So if a feature is required (true), we fail the match.
                    if *value {
                        feature_match = false;
                    }
                }
            }

            if rule.action == "allow" && os_match && arch_match && feature_match {
                return true;
            } else if rule.action == "disallow" && os_match && arch_match && feature_match {
                return false;
            }
        }
        false
    }

    fn merge_libraries(&self, base: &mut Vec<crate::launcher::version_details::Library>, extension: Vec<crate::launcher::version_details::Library>) {
        use std::collections::HashMap;
        
        // Map "group:artifact" -> index in base
        let mut library_map: HashMap<String, usize> = HashMap::new();
        
        for (i, lib) in base.iter().enumerate() {
            let parts: Vec<&str> = lib.name.split(':').collect();
            if parts.len() >= 2 {
                let key = format!("{}:{}", parts[0], parts[1]);
                library_map.insert(key, i);
            }
        }
        
        for lib in extension {
            let parts: Vec<&str> = lib.name.split(':').collect();
            if parts.len() >= 2 {
                let key = format!("{}:{}", parts[0], parts[1]);
                if let Some(&index) = library_map.get(&key) {
                    // Replace existing library
                    println!("[MinecraftLauncher] Overriding library {} with {}", base[index].name, lib.name);
                    base[index] = lib;
                } else {
                    // Add new library
                    base.push(lib);
                }
            } else {
                base.push(lib);
            }
        }
    }
}
