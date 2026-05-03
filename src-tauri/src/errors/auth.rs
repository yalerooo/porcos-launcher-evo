use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Flujo de código de dispositivo fallido: {reason}")]
    DeviceCodeFlowFailed { reason: String },

    #[error("Autenticación Xbox Live fallida: {reason}")]
    XblAuthFailed { reason: String },

    #[error("Intercambio XSTS fallido: {reason}")]
    XstsFailed { reason: String },

    #[error("Autenticación Minecraft fallida: {reason}")]
    McAuthFailed { reason: String },

    #[error("Token expirado")]
    TokenExpired,

    #[error("Token inválido o revocado")]
    TokenInvalid,

    #[error("No se pudo obtener el perfil de Minecraft: {reason}")]
    ProfileFetchFailed { reason: String },

    #[error("Error de red durante autenticación: {reason}")]
    NetworkError { reason: String },

    #[error("Inicio de sesión cancelado por el usuario")]
    Cancelled,

    #[error("Error interno de autenticación: {0}")]
    Internal(String),
}

impl AuthError {
    pub fn device_code_failed(reason: impl Into<String>) -> Self {
        AuthError::DeviceCodeFlowFailed {
            reason: reason.into(),
        }
    }

    pub fn xbl_failed(reason: impl Into<String>) -> Self {
        AuthError::XblAuthFailed {
            reason: reason.into(),
        }
    }

    pub fn xsts_failed(reason: impl Into<String>) -> Self {
        AuthError::XstsFailed {
            reason: reason.into(),
        }
    }

    pub fn mc_failed(reason: impl Into<String>) -> Self {
        AuthError::McAuthFailed {
            reason: reason.into(),
        }
    }

    pub fn profile_failed(reason: impl Into<String>) -> Self {
        AuthError::ProfileFetchFailed {
            reason: reason.into(),
        }
    }

    pub fn network_error(reason: impl Into<String>) -> Self {
        AuthError::NetworkError {
            reason: reason.into(),
        }
    }

    pub fn internal(reason: impl Into<String>) -> Self {
        AuthError::Internal(reason.into())
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            AuthError::TokenExpired => true,
            AuthError::Cancelled => false,
            _ => false,
        }
    }
}

impl From<reqwest::Error> for AuthError {
    fn from(err: reqwest::Error) -> Self {
        AuthError::network_error(err.to_string())
    }
}
