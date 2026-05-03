pub mod network;
pub mod io;
pub mod auth;
pub mod launcher;

use thiserror::Error;
use serde::Serialize;

pub use network::NetworkError;
pub use io::IoError;
pub use auth::AuthError;
pub use launcher::LaunchError;
pub use launcher::ModLoaderError;

#[derive(Debug, Error)]
pub enum LauncherError {
    #[error("Error de red: {0}")]
    Network(#[from] NetworkError),

    #[error("Error de archivo: {0}")]
    Io(#[from] IoError),

    #[error("Error de autenticación: {0}")]
    Auth(#[from] AuthError),

    #[error("Error al iniciar juego: {0}")]
    Launch(#[from] LaunchError),

    #[error("Error de mod loader: {0}")]
    ModLoader(#[from] ModLoaderError),

    #[error("{0}")]
    Other(String),
}

impl LauncherError {
    pub fn is_recoverable(&self) -> bool {
        match self {
            LauncherError::Network(e) => e.is_recoverable(),
            LauncherError::Io(e) => e.is_recoverable(),
            LauncherError::Launch(e) => e.is_recoverable(),
            LauncherError::ModLoader(e) => e.is_recoverable(),
            LauncherError::Auth(_) => false,
            LauncherError::Other(_) => false,
        }
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            LauncherError::Network(_) => "NETWORK_ERROR",
            LauncherError::Io(_) => "IO_ERROR",
            LauncherError::Auth(_) => "AUTH_ERROR",
            LauncherError::Launch(_) => "LAUNCH_ERROR",
            LauncherError::ModLoader(_) => "MODLOADER_ERROR",
            LauncherError::Other(_) => "UNKNOWN_ERROR",
        }
    }

    pub fn other(msg: impl Into<String>) -> Self {
        LauncherError::Other(msg.into())
    }
}

impl From<std::io::Error> for LauncherError {
    fn from(err: std::io::Error) -> Self {
        LauncherError::Io(IoError::Unknown { reason: err.to_string() })
    }
}

impl From<IoError> for String {
    fn from(err: IoError) -> Self {
        err.to_string()
    }
}

impl From<reqwest::Error> for LauncherError {
    fn from(err: reqwest::Error) -> Self {
        LauncherError::Network(err.into())
    }
}

impl From<zip::result::ZipError> for LauncherError {
    fn from(err: zip::result::ZipError) -> Self {
        LauncherError::Io(IoError::Unknown { reason: err.to_string() })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorEvent {
    pub code: String,
    pub message: String,
    pub context: String,
    pub recoverable: bool,
}

impl ErrorEvent {
    pub fn from_error(error: &LauncherError, context: &str) -> Self {
        ErrorEvent {
            code: error.error_code().to_string(),
            message: error.to_string(),
            context: context.to_string(),
            recoverable: error.is_recoverable(),
        }
    }

    pub fn from_string(message: &str, code: &str, context: &str) -> Self {
        ErrorEvent {
            code: code.to_string(),
            message: message.to_string(),
            context: context.to_string(),
            recoverable: false,
        }
    }
}
