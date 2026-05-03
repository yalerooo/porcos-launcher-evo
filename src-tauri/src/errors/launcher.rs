use thiserror::Error;

#[derive(Debug, Error)]
pub enum LaunchError {
    #[error("Versión de Minecraft no encontrada: {version}")]
    VersionNotFound { version: String },

    #[error("Java no encontrado. Instala Java {required} o superior")]
    JavaNotFound { required: String },

    #[error("No se pudo iniciar el proceso de Minecraft: {reason}")]
    ProcessSpawnFailed { reason: String },

    #[error("Error al descargar librería '{name}': {cause}")]
    LibraryDownloadFailed {
        name: String,
        cause: super::super::errors::NetworkError,
    },

    #[error("Error al descargar assets: {cause}")]
    AssetDownloadFailed {
        cause: super::super::errors::NetworkError,
    },

    #[error("Error al descargar cliente: {cause}")]
    ClientDownloadFailed {
        cause: super::super::errors::NetworkError,
    },

    #[error("No se encontró el manifiesto de versiones de Mojang")]
    VersionManifestFailed,

    #[error("Error al leer detalles de versión: {reason}")]
    VersionDetailsFailed { reason: String },

    #[error("Perfil de mod loader no encontrado: {loader} {version}")]
    ModLoaderProfileNotFound { loader: String, version: String },

    #[error("Instalador de {loader} falló: {reason}")]
    ModLoaderInstallFailed { loader: String, reason: String },

    #[error("Instalación de NeoForge corrupta: {reason}")]
    NeoForgeInstallCorrupted { reason: String },

    #[error("No se pudo procesar argumento de versión: {reason}")]
    ArgumentProcessingFailed { reason: String },

    #[error("Error de extracción de nativa: {reason}")]
    NativeExtractionFailed { reason: String },

    #[error("Error al crear directorio de versión: {path}: {cause}")]
    VersionDirCreationFailed {
        path: String,
        cause: String,
    },

    #[error("Directorio de juego inválido: {path}")]
    InvalidGameDir { path: String },

    #[error("El juego crasheó. Revisa el reporte en: {path}")]
    GameCrashed { path: String },

    #[error("Error desconocido al iniciar: {0}")]
    Unknown(String),
}

impl LaunchError {
    pub fn version_not_found(version: impl Into<String>) -> Self {
        LaunchError::VersionNotFound {
            version: version.into(),
        }
    }

    pub fn java_not_found(required: impl Into<String>) -> Self {
        LaunchError::JavaNotFound {
            required: required.into(),
        }
    }

    pub fn spawn_failed(reason: impl Into<String>) -> Self {
        LaunchError::ProcessSpawnFailed {
            reason: reason.into(),
        }
    }

    pub fn library_failed(name: impl Into<String>, err: impl Into<String>) -> Self {
        LaunchError::LibraryDownloadFailed {
            name: name.into(),
            cause: super::super::errors::NetworkError::connection_failed("library", err),
        }
    }

    pub fn mod_loader_profile_not_found(loader: impl Into<String>, version: impl Into<String>) -> Self {
        LaunchError::ModLoaderProfileNotFound {
            loader: loader.into(),
            version: version.into(),
        }
    }

    pub fn mod_loader_install_failed(loader: impl Into<String>, reason: impl Into<String>) -> Self {
        LaunchError::ModLoaderInstallFailed {
            loader: loader.into(),
            reason: reason.into(),
        }
    }

    pub fn neoforge_corrupted(reason: impl Into<String>) -> Self {
        LaunchError::NeoForgeInstallCorrupted {
            reason: reason.into(),
        }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            LaunchError::VersionNotFound { .. } => false,
            LaunchError::JavaNotFound { .. } => false,
            LaunchError::ProcessSpawnFailed { .. } => false,
            LaunchError::LibraryDownloadFailed { .. } => true,
            LaunchError::AssetDownloadFailed { .. } => true,
            LaunchError::ClientDownloadFailed { .. } => true,
            LaunchError::VersionManifestFailed { .. } => true,
            LaunchError::VersionDetailsFailed { .. } => true,
            LaunchError::ModLoaderProfileNotFound { .. } => true,
            LaunchError::ModLoaderInstallFailed { .. } => false,
            LaunchError::NeoForgeInstallCorrupted { .. } => false,
            LaunchError::ArgumentProcessingFailed { .. } => false,
            LaunchError::NativeExtractionFailed { .. } => false,
            LaunchError::VersionDirCreationFailed { .. } => false,
            LaunchError::InvalidGameDir { .. } => false,
            LaunchError::GameCrashed { .. } => false,
            LaunchError::Unknown(_) => true,
        }
    }
}

#[derive(Debug, Error)]
pub enum ModLoaderError {
    #[error("Versión de Fabric no encontrada para Minecraft {mc_version}")]
    FabricNotFound { mc_version: String },

    #[error("Versión de Quilt no encontrada para Minecraft {mc_version}")]
    QuiltNotFound { mc_version: String },

    #[error("Versión de Forge no encontrada para Minecraft {mc_version}")]
    ForgeNotFound { mc_version: String },

    #[error("Versión de NeoForge no encontrada para Minecraft {mc_version}")]
    NeoForgeNotFound { mc_version: String },

    #[error("Error de red al obtener versiones de {loader}: {cause}")]
    NetworkError {
        loader: String,
        cause: super::super::errors::NetworkError,
    },

    #[error("Respuesta inválida del servidor de {loader}")]
    InvalidResponse { loader: String },

    #[error("Descarga de instalador fallida: {reason}")]
    InstallerDownloadFailed { reason: String },

    #[error("Instalador no encontrado o corrupto: {path}")]
    InstallerCorrupted { path: String },

    #[error("Error interno del instalador: {reason}")]
    InstallerInternalError { reason: String },

    #[error("Versión no soportada: {version}")]
    UnsupportedVersion { version: String },
}

impl ModLoaderError {
    pub fn fabric_not_found(mc_version: impl Into<String>) -> Self {
        ModLoaderError::FabricNotFound {
            mc_version: mc_version.into(),
        }
    }

    pub fn quilt_not_found(mc_version: impl Into<String>) -> Self {
        ModLoaderError::QuiltNotFound {
            mc_version: mc_version.into(),
        }
    }

    pub fn forge_not_found(mc_version: impl Into<String>) -> Self {
        ModLoaderError::ForgeNotFound {
            mc_version: mc_version.into(),
        }
    }

    pub fn neoforge_not_found(mc_version: impl Into<String>) -> Self {
        ModLoaderError::NeoForgeNotFound {
            mc_version: mc_version.into(),
        }
    }

    pub fn network_error(loader: &str, err: impl Into<String>) -> Self {
        ModLoaderError::NetworkError {
            loader: loader.to_string(),
            cause: super::super::errors::NetworkError::connection_failed(loader, err),
        }
    }

    pub fn invalid_response(loader: impl Into<String>) -> Self {
        ModLoaderError::InvalidResponse {
            loader: loader.into(),
        }
    }

    pub fn installer_download_failed(reason: impl Into<String>) -> Self {
        ModLoaderError::InstallerDownloadFailed {
            reason: reason.into(),
        }
    }

    pub fn installer_corrupted(path: impl Into<String>) -> Self {
        ModLoaderError::InstallerCorrupted {
            path: path.into(),
        }
    }

    pub fn installer_internal_error(reason: impl Into<String>) -> Self {
        ModLoaderError::InstallerInternalError {
            reason: reason.into(),
        }
    }

    pub fn unsupported_version(version: impl Into<String>) -> Self {
        ModLoaderError::UnsupportedVersion {
            version: version.into(),
        }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            ModLoaderError::FabricNotFound { .. } => false,
            ModLoaderError::QuiltNotFound { .. } => false,
            ModLoaderError::ForgeNotFound { .. } => false,
            ModLoaderError::NeoForgeNotFound { .. } => false,
            ModLoaderError::NetworkError { .. } => true,
            ModLoaderError::InvalidResponse { .. } => true,
            ModLoaderError::InstallerDownloadFailed { .. } => true,
            ModLoaderError::InstallerCorrupted { .. } => false,
            ModLoaderError::InstallerInternalError { .. } => false,
            ModLoaderError::UnsupportedVersion { .. } => false,
        }
    }
}
