#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::*;
#[cfg(windows)]
use windows::Win32::Foundation::*;
#[cfg(windows)]
use windows::Win32::System::Threading::*;
#[cfg(windows)]
use windows::Win32::System::Diagnostics::ToolHelp::*;
#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use crate::{log_info, log_warn};

#[cfg(windows)]
pub fn wait_for_minecraft_window(process_id: u32) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(30);

    while start.elapsed() < timeout {
        if find_minecraft_window_by_title(process_id) {
            log_info!("Minecraft window detected via title");
            return true;
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    log_warn!("Timeout waiting for Minecraft window (30s), assuming game is running");
    false
}

#[cfg(windows)]
fn find_minecraft_window_by_title(target_pid: u32) -> bool {
    let found = AtomicBool::new(false);

    unsafe {
        let ctx = Box::into_raw(Box::new(FindWindowCtx {
            target_pid,
            found: &found,
        }));

        let _ = EnumWindows(Some(enum_windows_callback), LPARAM(ctx as isize));

        Box::from_raw(ctx);
    }

    found.load(Ordering::SeqCst)
}

#[cfg(windows)]
struct FindWindowCtx {
    target_pid: u32,
    found: *const AtomicBool,
}

unsafe impl Send for FindWindowCtx {}

#[cfg(windows)]
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &*(lparam.0 as *const FindWindowCtx);
    let found = &*ctx.found;

    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let mut title_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title_buf);

    if len > 0 {
        let title = String::from_utf16_lossy(&title_buf[..len as usize]).to_lowercase();

        if title.contains("minecraft") || title.contains("lwjgl") {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));

            if pid == ctx.target_pid || is_child_of(pid, ctx.target_pid) {
                log_info!("Found Minecraft window: '{}' (Window PID: {}, Target PID: {})", title, pid, ctx.target_pid);
                found.store(true, Ordering::SeqCst);
                return BOOL(0);
            }
        }
    }

    BOOL(1)
}

#[cfg(windows)]
fn is_child_of(child_pid: u32, parent_pid: u32) -> bool {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot.is_err() {
            return false;
        }
        let snapshot = snapshot.unwrap();

        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == child_pid {
                    if entry.th32ParentProcessID == parent_pid {
                        return true;
                    }
                    if entry.th32ParentProcessID != 0 {
                        return is_child_of(entry.th32ParentProcessID, parent_pid);
                    }
                }
                if !Process32NextW(snapshot, &mut entry).is_ok() {
                    break;
                }
            }
        }
    }
    false
}

#[cfg(not(windows))]
pub fn wait_for_minecraft_window(_process_id: u32) -> bool {
    true
}
