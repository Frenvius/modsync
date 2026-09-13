use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::AppHandle;

use crate::catalog::GameId;
use crate::contracts::{CommandError, CommandErrorCode};
use crate::{instances, persistence::atomic_write};

const MAX_CONFIG_BYTES: u64 = 2 * 1024 * 1024;
const MAX_CONFIG_FILES: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    pub path: String,
    pub size: u64,
    pub modified_at: String,
    pub format: &'static str,
}

#[tauri::command]
pub fn list_config_files(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<ConfigFile>, CommandError> {
    let (_, root, game_id) = instance_root(&app, &instance_id)?;
    let mut files = Vec::new();
    for relative in config_roots(game_id) {
        collect_files(&root, Path::new(relative), 0, &mut files)?;
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

#[tauri::command]
pub fn read_config_file(
    app: AppHandle,
    instance_id: String,
    path: String,
) -> Result<String, CommandError> {
    let (_, root, game_id) = instance_root(&app, &instance_id)?;
    let file = config_path(&root, game_id, &path)?;
    let metadata = file
        .metadata()
        .map_err(|error| CommandError::io("Could not inspect the configuration file", &error))?;
    if !metadata.is_file() || metadata.len() > MAX_CONFIG_BYTES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Configuration file is not a supported text file",
        ));
    }
    fs::read_to_string(file).map_err(|error| {
        CommandError::io(
            "Could not read the configuration file as UTF-8 text",
            &error,
        )
    })
}

#[tauri::command]
pub fn write_config_file(
    app: AppHandle,
    instance_id: String,
    path: String,
    content: String,
) -> Result<ConfigFile, CommandError> {
    if content.len() as u64 > MAX_CONFIG_BYTES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Configuration file exceeds the 2 MB limit",
        ));
    }
    let (_, root, game_id) = instance_root(&app, &instance_id)?;
    let file = config_path(&root, game_id, &path)?;
    if !file.is_file() {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            "Configuration file was not found",
        ));
    }
    if format_for(&file) == Some("json") {
        serde_json::from_str::<serde_json::Value>(&content).map_err(|error| CommandError {
            code: CommandErrorCode::InvalidInput,
            message: "JSON configuration is invalid".into(),
            retryable: false,
            details: Some(error.to_string()),
        })?;
    }
    atomic_write(&file, content.as_bytes())
        .map_err(|error| CommandError::io("Could not save the configuration file", &error))?;
    file_info(&root, &file)
}

#[tauri::command]
pub fn config_directory(app: AppHandle, instance_id: String) -> Result<String, CommandError> {
    let (_, root, game_id) = instance_root(&app, &instance_id)?;
    let relative = config_roots(game_id)
        .iter()
        .find(|path| Path::new(path).extension().is_none())
        .copied()
        .unwrap_or("");
    let path = root.join(relative);
    fs::create_dir_all(&path).map_err(|error| {
        CommandError::io("Could not create the configuration directory", &error)
    })?;
    Ok(path.to_string_lossy().into_owned())
}

fn instance_root(
    app: &AppHandle,
    instance_id: &str,
) -> Result<(PathBuf, PathBuf, GameId), CommandError> {
    instances::validate_id(instance_id)?;
    let metadata = instances::instances_root(app)?.join(instance_id);
    let manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    let root = fs::canonicalize(&manifest.location.path)
        .map_err(|error| CommandError::io("Could not open the instance directory", &error))?;
    Ok((metadata, root, manifest.game_id))
}

fn config_roots(game_id: GameId) -> &'static [&'static str] {
    match game_id {
        GameId::Minecraft => &["config", "options.txt"],
        GameId::LethalCompany | GameId::Valheim => &["BepInEx/config"],
        GameId::VintageStory => &["clientsettings.json", "serverconfig.json", "ModConfig"],
    }
}

fn collect_files(
    root: &Path,
    relative: &Path,
    depth: usize,
    output: &mut Vec<ConfigFile>,
) -> Result<(), CommandError> {
    if depth > 8 || output.len() >= MAX_CONFIG_FILES {
        return Ok(());
    }
    let path = root.join(relative);
    if path.is_file() {
        if format_for(&path).is_some() {
            output.push(file_info(root, &path)?);
        }
        return Ok(());
    }
    if !path.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(path)
        .map_err(|error| CommandError::io("Could not read configuration files", &error))?
    {
        let entry = entry
            .map_err(|error| CommandError::io("Could not read a configuration entry", &error))?;
        let file_type = entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect a configuration entry", &error))?;
        if file_type.is_symlink() {
            continue;
        }
        let child = relative.join(entry.file_name());
        if file_type.is_dir() {
            collect_files(root, &child, depth + 1, output)?;
        } else if file_type.is_file() && format_for(&entry.path()).is_some() {
            output.push(file_info(root, &entry.path())?);
        }
        if output.len() >= MAX_CONFIG_FILES {
            break;
        }
    }
    Ok(())
}

fn config_path(root: &Path, game_id: GameId, relative: &str) -> Result<PathBuf, CommandError> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        || format_for(relative).is_none()
        || !config_roots(game_id).iter().any(|allowed| {
            let allowed = Path::new(allowed);
            relative == allowed || allowed.extension().is_none() && relative.starts_with(allowed)
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Configuration path is invalid",
        ));
    }
    let path = root.join(relative);
    let canonical = fs::canonicalize(&path)
        .map_err(|error| CommandError::io("Could not open the configuration file", &error))?;
    if !canonical.starts_with(root) {
        return Err(CommandError::new(
            CommandErrorCode::PermissionDenied,
            "Configuration path escapes the instance directory",
        ));
    }
    Ok(canonical)
}

fn file_info(root: &Path, path: &Path) -> Result<ConfigFile, CommandError> {
    let metadata = path
        .metadata()
        .map_err(|error| CommandError::io("Could not inspect a configuration file", &error))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| DateTime::<Utc>::from(UNIX_EPOCH + duration).to_rfc3339())
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    Ok(ConfigFile {
        size: metadata.len(),
        modified_at: modified,
        path: path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/"),
        format: format_for(path).unwrap_or("cfg"),
    })
}

fn format_for(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "cfg" | "conf" | "ini" => Some("cfg"),
        "json" => Some("json"),
        "toml" => Some("toml"),
        "yaml" | "yml" => Some("yaml"),
        "properties" | "txt" => Some("properties"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_path_rejects_traversal_before_touching_disk() {
        assert!(matches!(
            config_path(Path::new("instance"), GameId::Minecraft, "../outside.json")
                .unwrap_err()
                .code,
            CommandErrorCode::InvalidInput
        ));
    }
}
