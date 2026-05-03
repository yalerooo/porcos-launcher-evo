use thiserror::Error;

#[derive(Debug, Error)]
pub enum IoError {
    #[error("Archivo no encontrado: {path}")]
    FileNotFound { path: String },

    #[error("Permiso denegado: {path}")]
    PermissionDenied { path: String },

    #[error("Archivo corrupto o formato inválido: {path}")]
    CorruptedFile { path: String },

    #[error("Espacio en disco insuficiente: {path}")]
    DiskFull { path: String },

    #[error("El archivo ya existe: {path}")]
    AlreadyExists { path: String },

    #[error("No se puede crear el directorio '{path}': {reason}")]
    CreateDir { path: String, reason: String },

    #[error("No se puede leer el archivo '{path}': {reason}")]
    ReadError { path: String, reason: String },

    #[error("No se puede escribir en '{path}': {reason}")]
    WriteError { path: String, reason: String },

    #[error("No se puede eliminar '{path}': {reason}")]
    DeleteError { path: String, reason: String },

    #[error("Error al renombrar '{old_path}' a '{new_path}': {reason}")]
    RenameError { old_path: String, new_path: String, reason: String },

    #[error("Error al copiar '{src}' a '{dst}': {reason}")]
    CopyError { src: String, dst: String, reason: String },

    #[error("El directorio no está vacío: {path}")]
    DirNotEmpty { path: String },

    #[error("Error de extracción: {reason}")]
    ExtractionError { reason: String },

    #[error("Ruta inválida: {path}")]
    InvalidPath { path: String },

    #[error("Error de I/O desconocido: {reason}")]
    Unknown { reason: String },
}

impl IoError {
    pub fn file_not_found(path: impl Into<String>) -> Self {
        IoError::FileNotFound { path: path.into() }
    }

    pub fn permission_denied(path: impl Into<String>) -> Self {
        IoError::PermissionDenied { path: path.into() }
    }

    pub fn corrupted_file(path: impl Into<String>) -> Self {
        IoError::CorruptedFile { path: path.into() }
    }

    pub fn disk_full(path: impl Into<String>) -> Self {
        IoError::DiskFull { path: path.into() }
    }

    pub fn already_exists(path: impl Into<String>) -> Self {
        IoError::AlreadyExists { path: path.into() }
    }

    pub fn read_error(path: impl Into<String>, reason: impl Into<String>) -> Self {
        IoError::ReadError {
            path: path.into(),
            reason: reason.into(),
        }
    }

    pub fn write_error(path: impl Into<String>, reason: impl Into<String>) -> Self {
        IoError::WriteError {
            path: path.into(),
            reason: reason.into(),
        }
    }

    pub fn delete_error(path: impl Into<String>, reason: impl Into<String>) -> Self {
        IoError::DeleteError {
            path: path.into(),
            reason: reason.into(),
        }
    }

    pub fn rename_error(old_path: impl Into<String>, new_path: impl Into<String>, reason: impl Into<String>) -> Self {
        IoError::RenameError {
            old_path: old_path.into(),
            new_path: new_path.into(),
            reason: reason.into(),
        }
    }

    pub fn copy_error(src: impl Into<String>, dst: impl Into<String>, reason: impl Into<String>) -> Self {
        IoError::CopyError {
            src: src.into(),
            dst: dst.into(),
            reason: reason.into(),
        }
    }

    pub fn extraction_error(reason: impl Into<String>) -> Self {
        IoError::ExtractionError { reason: reason.into() }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            IoError::DiskFull { .. } => false,
            IoError::PermissionDenied { .. } => false,
            IoError::CorruptedFile { .. } => false,
            IoError::FileNotFound { .. } => false,
            IoError::AlreadyExists { .. } => true,
            IoError::CreateDir { .. } => false,
            IoError::ReadError { .. } => false,
            IoError::WriteError { .. } => false,
            IoError::DeleteError { .. } => false,
            IoError::RenameError { .. } => false,
            IoError::CopyError { .. } => false,
            IoError::DirNotEmpty { .. } => true,
            IoError::ExtractionError { .. } => false,
            IoError::InvalidPath { .. } => false,
            IoError::Unknown { .. } => true,
        }
    }
}

impl From<std::io::Error> for IoError {
    fn from(err: std::io::Error) -> Self {
        use std::io::ErrorKind;

        match err.kind() {
            ErrorKind::NotFound => IoError::FileNotFound {
                path: String::new(),
            },
            ErrorKind::PermissionDenied => IoError::PermissionDenied {
                path: String::new(),
            },
            ErrorKind::AlreadyExists => IoError::AlreadyExists {
                path: String::new(),
            },
            ErrorKind::InvalidInput | ErrorKind::InvalidData => IoError::CorruptedFile {
                path: String::new(),
            },
            ErrorKind::WriteZero | ErrorKind::StorageFull => IoError::DiskFull {
                path: String::new(),
            },
            ErrorKind::NotConnected | ErrorKind::UnexpectedEof => IoError::ReadError {
                path: String::new(),
                reason: err.to_string(),
            },
            _ => IoError::Unknown {
                reason: err.to_string(),
            },
        }
    }
}



impl From<zip::result::ZipError> for IoError {
    fn from(err: zip::result::ZipError) -> Self {
        IoError::ExtractionError {
            reason: format!("ZIP error: {}", err),
        }
    }
}



impl From<toml::de::Error> for IoError {
    fn from(_err: toml::de::Error) -> Self {
        IoError::CorruptedFile {
            path: String::new(),
        }
    }
}

impl From<serde_json::Error> for IoError {
    fn from(err: serde_json::Error) -> Self {
        IoError::CorruptedFile {
            path: err.to_string(),
        }
    }
}
