use thiserror::Error;
use serde::Serialize;

#[derive(Debug, Error)]
pub enum NetworkError {
    #[error("Conexión fallida a {url}: {reason}")]
    ConnectionFailed { url: String, reason: String },

    #[error("Tiempo de espera agotado para {url}")]
    Timeout { url: String },

    #[error("Solicitud HTTP fallida: código de estado {status} ({url})")]
    StatusCode { status: u16, url: String },

    #[error("Recurso no encontrado: {url}")]
    NotFound { url: String },

    #[error("Error al leer respuesta de {url}: {reason}")]
    ReadError { url: String, reason: String },

    #[error("Error de escritura en {path}: {reason}")]
    WriteError { path: String, reason: String },

    #[error("Error de parsing JSON: {0}")]
    ParseError(serde_json::Error),

    #[error("Descarga cancelada: {reason}")]
    Cancelled { reason: String },

    #[error("Error desconocido de red: {0}")]
    Unknown(String),
}

impl NetworkError {
    pub fn connection_failed(url: impl Into<String>, reason: impl Into<String>) -> Self {
        NetworkError::ConnectionFailed {
            url: url.into(),
            reason: reason.into(),
        }
    }

    pub fn timeout(url: impl Into<String>) -> Self {
        NetworkError::Timeout { url: url.into() }
    }

    pub fn status_code(status: u16, url: impl Into<String>) -> Self {
        NetworkError::StatusCode {
            status,
            url: url.into(),
        }
    }

    pub fn not_found(url: impl Into<String>) -> Self {
        NetworkError::NotFound { url: url.into() }
    }

    pub fn read_error(url: impl Into<String>, reason: impl Into<String>) -> Self {
        NetworkError::ReadError {
            url: url.into(),
            reason: reason.into(),
        }
    }

    pub fn write_error(path: impl Into<String>, reason: impl Into<String>) -> Self {
        NetworkError::WriteError {
            path: path.into(),
            reason: reason.into(),
        }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            NetworkError::ConnectionFailed { .. } => true,
            NetworkError::Timeout { .. } => true,
            NetworkError::StatusCode { status, .. } => {
                matches!(status, 408 | 429 | 500 | 502 | 503 | 504)
            }
            NetworkError::NotFound { .. } => false,
            NetworkError::ReadError { .. } => true,
            NetworkError::WriteError { .. } => false,
            NetworkError::ParseError { .. } => false,
            NetworkError::Cancelled { .. } => false,
            NetworkError::Unknown(_) => true,
        }
    }
}

impl From<reqwest::Error> for NetworkError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            NetworkError::Unknown(err.to_string())
        } else if let Some(status) = err.status() {
            NetworkError::StatusCode {
                status: status.as_u16(),
                url: err.url().map(|u| u.to_string()).unwrap_or_default(),
            }
        } else if err.is_connect() {
            NetworkError::connection_failed(
                err.url().map(|u| u.to_string()).unwrap_or_default(),
                err.to_string(),
            )
        } else {
            NetworkError::Unknown(err.to_string())
        }
    }
}
