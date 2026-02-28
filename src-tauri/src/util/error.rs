use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error at '{path}': {message}")]
    Io {
        path: PathBuf,
        message: String,
        #[source]
        source: std::io::Error,
    },

    #[error("File not found: {0}")]
    FileNotFound(PathBuf),

    #[error("Directory not found: {0}")]
    DirectoryNotFound(PathBuf),

    #[error("JSON error: {message}")]
    Json {
        message: String,
        #[source]
        source: serde_json::Error,
    },

    #[error("Network error: {message}")]
    Network {
        message: String,
        #[source]
        source: Option<reqwest::Error>,
    },

    #[error("Server error: {0}")]
    Server(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Profile error: {0}")]
    Profile(String),

    #[error("Sync error: {0}")]
    Sync(String),

    #[error("Cache error: {0}")]
    Cache(String),

    #[error("Thunderstore error: {0}")]
    Thunderstore(String),

    #[error("Game error: {0}")]
    Game(String),

    #[error("BepInEx error: {0}")]
    BepInEx(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn io(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        let path = path.as_ref().to_path_buf();
        let message = source.to_string();
        Self::Io { path, message, source }
    }

    pub fn network(message: impl Into<String>) -> Self {
        Self::Network {
            message: message.into(),
            source: None,
        }
    }

    pub fn network_with_source(message: impl Into<String>, source: reqwest::Error) -> Self {
        Self::Network {
            message: message.into(),
            source: Some(source),
        }
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Io { .. } => "IO_ERROR",
            Self::FileNotFound(_) => "FILE_NOT_FOUND",
            Self::DirectoryNotFound(_) => "DIR_NOT_FOUND",
            Self::Json { .. } => "JSON_ERROR",
            Self::Network { .. } => "NETWORK_ERROR",
            Self::Server(_) => "SERVER_ERROR",
            Self::Config(_) => "CONFIG_ERROR",
            Self::Profile(_) => "PROFILE_ERROR",
            Self::Sync(_) => "SYNC_ERROR",
            Self::Cache(_) => "CACHE_ERROR",
            Self::Thunderstore(_) => "THUNDERSTORE_ERROR",
            Self::Game(_) => "GAME_ERROR",
            Self::BepInEx(_) => "BEPINEX_ERROR",
            Self::Other(_) => "UNKNOWN_ERROR",
        }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            Self::Network { .. } => true,
            Self::Server(_) => true,
            Self::Sync(_) => true,
            _ => false,
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", self.error_code())?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("recoverable", &self.is_recoverable())?;
        state.end()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::Io {
            path: PathBuf::new(),
            message: e.to_string(),
            source: e,
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json {
            message: e.to_string(),
            source: e,
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        Self::network_with_source(e.to_string(), e)
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::Other(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self::Other(s.to_string())
    }
}

pub trait IoResultExt<T> {
    fn with_path(self, path: impl AsRef<Path>) -> Result<T, AppError>;

    fn with_path_context(self, path: impl AsRef<Path>, context: impl Into<String>) -> Result<T, AppError>;
}

impl<T> IoResultExt<T> for Result<T, std::io::Error> {
    fn with_path(self, path: impl AsRef<Path>) -> Result<T, AppError> {
        self.map_err(|e| AppError::io(path, e))
    }

    fn with_path_context(self, path: impl AsRef<Path>, context: impl Into<String>) -> Result<T, AppError> {
        self.map_err(|e| AppError::Io {
            path: path.as_ref().to_path_buf(),
            message: format!("{}: {}", context.into(), e),
            source: e,
        })
    }
}

pub trait OptionExt<T> {
    fn ok_or_file_not_found(self, path: impl AsRef<Path>) -> Result<T, AppError>;
    fn ok_or_dir_not_found(self, path: impl AsRef<Path>) -> Result<T, AppError>;
    fn ok_or_config(self, message: impl Into<String>) -> Result<T, AppError>;
}

impl<T> OptionExt<T> for Option<T> {
    fn ok_or_file_not_found(self, path: impl AsRef<Path>) -> Result<T, AppError> {
        self.ok_or_else(|| AppError::FileNotFound(path.as_ref().to_path_buf()))
    }

    fn ok_or_dir_not_found(self, path: impl AsRef<Path>) -> Result<T, AppError> {
        self.ok_or_else(|| AppError::DirectoryNotFound(path.as_ref().to_path_buf()))
    }

    fn ok_or_config(self, message: impl Into<String>) -> Result<T, AppError> {
        self.ok_or_else(|| AppError::Config(message.into()))
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let error = AppError::FileNotFound(PathBuf::from("/test/path"));
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("FILE_NOT_FOUND"));
        assert!(json.contains("/test/path"));
    }

    #[test]
    fn test_io_result_ext() {
        let result: Result<(), std::io::Error> = Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "file not found"
        ));
        let app_result = result.with_path("/test/path");
        assert!(app_result.is_err());
        let err = app_result.unwrap_err();
        assert_eq!(err.error_code(), "IO_ERROR");
    }
}
