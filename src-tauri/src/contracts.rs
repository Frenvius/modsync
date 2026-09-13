use serde::{Deserialize, Serialize};

use crate::catalog::{GameId, LoaderId, ProjectType, ProviderId};

pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateStatus {
    Disabled,
    UpToDate,
    Incompatible,
    UpdateAvailable,
    DependencyMissing,
    Damaged,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFile {
    pub path: String,
    #[serde(default)]
    pub mutable: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha512: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub name: String,
    pub author: String,
    pub enabled: bool,
    pub r#type: ProjectType,
    pub project_id: String,
    pub icon_color: String,
    pub provider: ProviderId,
    pub status: UpdateStatus,
    #[serde(default)]
    pub update_available: bool,
    pub installed_version: String,
    #[serde(default)]
    pub version_id: String,
    #[serde(default)]
    pub files: Vec<InstalledFile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missing_dependency: Option<String>,
    pub latest_compatible_version: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<LoaderId>,
    #[serde(default)]
    pub game_versions: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstanceLocationKind {
    Managed,
    External,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceLocation {
    pub path: String,
    pub kind: InstanceLocationKind,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub icon: String,
    pub icon_color: String,
    pub description: String,
    pub game_id: GameId,
    pub game_version: String,
    pub loader: LoaderId,
    pub loader_version: String,
    pub memory_mb: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub java_args: Option<String>,
    pub location: InstanceLocation,
    pub created_at: String,
    pub updated_at: String,
    pub last_played: Option<String>,
    pub playtime_minutes: u64,
    pub mods: Vec<InstalledMod>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_operation_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePathSetting {
    pub path: String,
    pub game_id: GameId,
    pub detected: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsManifest {
    pub schema_version: u32,
    pub game_paths: Vec<GamePathSetting>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CommandErrorCode {
    Cancelled,
    Conflict,
    CorruptedData,
    DiskFull,
    Incompatible,
    InvalidInput,
    Io,
    Network,
    NotFound,
    PermissionDenied,
    ProviderUnavailable,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: CommandErrorCode,
    pub message: String,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl CommandError {
    pub fn new(code: CommandErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retryable: false,
            details: None,
        }
    }

    pub fn io(message: impl Into<String>, error: &std::io::Error) -> Self {
        let code = io_error_code(error);

        Self {
            code,
            message: message.into(),
            retryable: matches!(
                error.kind(),
                std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock
            ),
            details: Some(error.to_string()),
        }
    }
}

fn io_error_code(error: &std::io::Error) -> CommandErrorCode {
    #[cfg(windows)]
    match error.raw_os_error() {
        Some(112) => return CommandErrorCode::DiskFull,
        Some(32) | Some(33) => return CommandErrorCode::Conflict,
        _ => {}
    }
    #[cfg(unix)]
    if error.raw_os_error() == Some(28) {
        return CommandErrorCode::DiskFull;
    }
    match error.kind() {
        std::io::ErrorKind::NotFound => CommandErrorCode::NotFound,
        std::io::ErrorKind::PermissionDenied => CommandErrorCode::PermissionDenied,
        _ => CommandErrorCode::Io,
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OperationStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationProgress {
    pub message: String,
    pub operation_id: String,
    pub status: OperationStatus,
    pub completed_items: u32,
    pub total_items: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_manifest_round_trips() {
        let manifest = InstanceManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            id: "instance-1".into(),
            name: "Vanilla+".into(),
            icon: "sparkles".into(),
            icon_color: "#1bd96a".into(),
            description: "Performance mods".into(),
            game_id: GameId::Minecraft,
            game_version: "1.21.4".into(),
            loader: LoaderId::Fabric,
            loader_version: "0.16.10".into(),
            memory_mb: 4096,
            java_args: None,
            location: InstanceLocation {
                path: "instances/instance-1".into(),
                kind: InstanceLocationKind::Managed,
            },
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            last_played: None,
            playtime_minutes: 0,
            mods: Vec::new(),
            last_operation_id: None,
        };
        let json = serde_json::to_string(&manifest).unwrap();
        let decoded = serde_json::from_str::<InstanceManifest>(&json).unwrap();

        assert_eq!(decoded, manifest);
    }

    #[test]
    fn io_errors_identify_disk_full_and_locked_files() {
        let disk_full = std::io::Error::from_raw_os_error(if cfg!(windows) { 112 } else { 28 });
        assert!(matches!(
            CommandError::io("write failed", &disk_full).code,
            CommandErrorCode::DiskFull
        ));

        #[cfg(windows)]
        assert!(matches!(
            CommandError::io("write failed", &std::io::Error::from_raw_os_error(32)).code,
            CommandErrorCode::Conflict
        ));
    }

    #[test]
    fn settings_manifest_round_trips() {
        let manifest = SettingsManifest {
            schema_version: MANIFEST_SCHEMA_VERSION,
            game_paths: vec![GamePathSetting {
                path: ".minecraft".into(),
                game_id: GameId::Minecraft,
                detected: true,
            }],
        };
        let json = serde_json::to_string(&manifest).unwrap();
        let decoded = serde_json::from_str::<SettingsManifest>(&json).unwrap();

        assert_eq!(decoded, manifest);
    }
}
