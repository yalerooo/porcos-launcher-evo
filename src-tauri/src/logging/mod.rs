use std::path::PathBuf;
use std::sync::Mutex;
use std::io::Write;

pub mod file_writer;

pub use file_writer::FileWriter;

static LOG_FILE: Mutex<Option<Mutex<std::fs::File>>> = Mutex::new(None);

pub fn init_logging(log_dir: Option<PathBuf>) -> Result<(), String> {
    let log_dir = log_dir.unwrap_or_else(|| {
        let mut path = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."));
        path.push("porcoslauncherevo");
        path.push("logs");
        path
    });

    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log directory: {}", e))?;

    let log_file_path = log_dir.join(format!(
        "launcher_{}.log",
        chrono_lite_date()
    ));

    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    {
        let mut guard = LOG_FILE.lock().map_err(|e| format!("Mutex error: {}", e))?;
        *guard = Some(Mutex::new(file));
    }

    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .with_target(true)
        .with_thread_ids(false)
        .with_file(true)
        .with_line_number(true)
        .with_writer(move || FileWriter {
            file: &LOG_FILE,
        })
        .with_ansi(false)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| format!("Failed to set tracing subscriber: {}", e))?;

    tracing::info!("Logging initialized. Log file: {:?}", log_file_path);
    tracing::info!("Launcher version: {}", env!("CARGO_PKG_VERSION"));

    Ok(())
}

pub fn close_logging() {
    if let Ok(mut guard) = LOG_FILE.lock() {
        if let Some(mutex_file) = guard.take() {
            if let Ok(mut file) = mutex_file.lock() {
                let _ = file.flush();
            }
        }
    }
}

fn chrono_lite_date() -> String {
    let now = std::time::SystemTime::now();
    let secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = remaining / 3600;
    let minutes = (remaining % 3600) / 60;

    let base_date = std::time::UNIX_EPOCH;
    let days_since_epoch = days * 86400;
    let base_date_adjusted = base_date + std::time::Duration::from_secs(days_since_epoch);

    date_format(days, hours, minutes, base_date_adjusted)
}

#[allow(clippy::unnecessary_operation)]
fn date_format(days: u64, hours: u64, minutes: u64, _base_date: std::time::SystemTime) -> String {
    let _year = 1970 + days / 1461 * 4 + (days % 1461) / 365;
    let day_of_year = days % 365;
    let month_map = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1;
    let mut day = day_of_year + 1;
    for (i, &m_days) in month_map.iter().enumerate() {
        if day <= m_days {
            month = i + 1;
            break;
        }
        day -= m_days;
    }

    format!(
        "{:04}-{:02}-{:02}_{:02}-{:02}",
        2024, month, day, hours, minutes
    )
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        tracing::error!(target: "launcher", $($arg)*)
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        tracing::warn!(target: "launcher", $($arg)*)
    };
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        tracing::info!(target: "launcher", $($arg)*)
    };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        tracing::debug!(target: "launcher", $($arg)*)
    };
}
