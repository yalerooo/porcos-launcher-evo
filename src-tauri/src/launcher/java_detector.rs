// Simple Java detection - checks common locations
use std::path::PathBuf;
use std::process::Command;

pub fn find_java() -> Result<PathBuf, String> {
    // Try to run `java -version` to see if Java is in PATH
    if let Ok(output) = Command::new("java").arg("-version").output() {
        if output.status.success() {
            println!("[Java] Found Java in PATH");
            return Ok(PathBuf::from("java"));
        }
    }

    // Common Java locations on Windows
    #[cfg(target_os = "windows")]
    {
        let common_paths = vec![
            r"C:\Program Files\Java",
            r"C:\Program Files (x86)\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft\jdk",
        ];

        for base_path in common_paths {
            if let Ok(entries) = std::fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let java_exe = entry.path().join("bin").join("java.exe");
                    if java_exe.exists() {
                        println!("[Java] Found Java at: {:?}", java_exe);
                        return Ok(java_exe);
                    }
                }
            }
        }
    }

    // Common Java locations on macOS
    #[cfg(target_os = "macos")]
    {
        let common_paths = vec![
            "/Library/Java/JavaVirtualMachines",
            "/System/Library/Java/JavaVirtualMachines",
        ];

        for base_path in common_paths {
            if let Ok(entries) = std::fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let java_bin = entry.path().join("Contents/Home/bin/java");
                    if java_bin.exists() {
                        println!("[Java] Found Java at: {:?}", java_bin);
                        return Ok(java_bin);
                    }
                }
            }
        }
    }

    // Common Java locations on Linux
    #[cfg(target_os = "linux")]
    {
        let common_paths = vec![
            "/usr/lib/jvm",
            "/usr/java",
        ];

        for base_path in common_paths {
            if let Ok(entries) = std::fs::read_dir(base_path) {
                for entry in entries.flatten() {
                    let java_bin = entry.path().join("bin/java");
                    if java_bin.exists() {
                        println!("[Java] Found Java at: {:?}", java_bin);
                        return Ok(java_bin);
                    }
                }
            }
        }
    }

    Err("Java not found. Please install Java 17 or newer.".to_string())
}
