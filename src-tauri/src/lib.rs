mod commands;
mod launcher;

use std::sync::Mutex;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager, State};

struct SetupState {
    frontend_task: bool,
    backend_task: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
        }))
        .invoke_handler(tauri::generate_handler![
            commands::auth::login_microsoft,
            commands::auth::login_offline,
            commands::auth::open_url,
            commands::launcher::get_available_versions,
            commands::launcher::launch_minecraft,
            commands::launcher::generate_offline_uuid,
            commands::instances::create_instance,
            commands::instances::get_instances,
            commands::instances::update_instance,
            commands::instances::delete_instance,
            commands::instances::get_instance_path,
            commands::instances::open_instance_folder,
            commands::modloaders::get_fabric_versions,
            commands::modloaders::get_quilt_versions,
            commands::modloaders::get_forge_versions,
            commands::modloaders::get_neoforge_versions,
            commands::network::fetch_cors,
            commands::network::download_file,
            commands::files::extract_zip,
            commands::files::read_text_file,
            commands::files::read_binary_file,
            commands::files::write_text_file,
            commands::files::file_exists,
            commands::files::list_files,
            commands::files::delete_file,
            commands::files::get_mod_icon,
            commands::files::get_mod_metadata,
            set_complete
        ])
        .setup(|app| {
            spawn(setup(app.handle().clone()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), ()> {
    let mut state_lock = state.lock().unwrap();
    match task.as_str() {
        "frontend" => state_lock.frontend_task = true,
        "backend" => state_lock.backend_task = true,
        _ => panic!("invalid task completed!"),
    }
    
    if state_lock.backend_task && state_lock.frontend_task {
        if let Some(splash_window) = app.get_webview_window("splashscreen") {
            let _ = splash_window.close();
        }
        if let Some(main_window) = app.get_webview_window("main") {
            // Calculate 70% of the screen size
            if let Ok(Some(monitor)) = main_window.current_monitor() {
                let screen_size = monitor.size();
                let width = (screen_size.width as f64 * 0.60) as u32;
                let height = (screen_size.height as f64 * 0.70) as u32;
                
                let _ = main_window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width,
                    height,
                }));
            } else {
                // Fallback if monitor detection fails
                let _ = main_window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: 1280,
                    height: 800,
                }));
            }
            let _ = main_window.center();
            
            let _ = main_window.show();
            let _ = main_window.set_focus();
        }
    }
    Ok(())
}

async fn setup(app: AppHandle) -> Result<(), ()> {
    println!("Performing backend setup task...");
    // No delay for immediate splash display
    println!("Backend setup task completed!");
    
    set_complete(
        app.clone(),
        app.state::<Mutex<SetupState>>(),
        "backend".to_string(),
    )
    .await?;
    Ok(())
}
