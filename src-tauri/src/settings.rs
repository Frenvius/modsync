use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::catalog::GameId;
use crate::contracts::{
    CommandError, CommandErrorCode, GamePathSetting, SettingsManifest, MANIFEST_SCHEMA_VERSION,
};
use crate::persistence::atomic_write;

const SETTINGS_FILE: &str = "settings.json";

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<SettingsManifest, CommandError> {
    let app_data = app_data_directory(&app)?;
    let path = app_data.join(SETTINGS_FILE);
    if !path.exists() {
        return Ok(default_settings());
    }
    read_settings(&path)
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    mut settings: SettingsManifest,
) -> Result<SettingsManifest, CommandError> {
    validate_settings(&settings)?;
    normalize_game_paths(&mut settings)?;
    let path = app_data_directory(&app)?.join(SETTINGS_FILE);
    write_settings(&path, &settings)?;
    Ok(settings)
}

fn app_data_directory(app: &AppHandle) -> Result<PathBuf, CommandError> {
    app.path().app_data_dir().map_err(|error| {
        CommandError::new(
            CommandErrorCode::Io,
            format!("Could not resolve application data directory: {error}"),
        )
    })
}

fn default_settings() -> SettingsManifest {
    SettingsManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        game_paths: default_game_paths(),
    }
}

fn default_game_paths() -> Vec<GamePathSetting> {
    [
        (GameId::Minecraft, minecraft_path()),
        (GameId::Valheim, steam_game_path("Valheim")),
        (GameId::VintageStory, vintage_story_path()),
        (GameId::LethalCompany, steam_game_path("Lethal Company")),
    ]
    .into_iter()
    .map(|(game_id, path)| {
        let detected = path.as_ref().is_some_and(|path| path.is_dir());
        GamePathSetting {
            game_id,
            detected,
            path: path
                .filter(|path| path.is_dir())
                .map_or_else(String::new, |path| path.to_string_lossy().into_owned()),
        }
    })
    .collect()
}

#[cfg(windows)]
fn minecraft_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|path| path.join(".minecraft"))
}

#[cfg(target_os = "linux")]
fn minecraft_path() -> Option<PathBuf> {
    home_directory().map(|path| path.join(".minecraft"))
}

#[cfg(target_os = "macos")]
fn minecraft_path() -> Option<PathBuf> {
    home_directory().map(|path| path.join("Library/Application Support/minecraft"))
}

#[cfg(windows)]
fn vintage_story_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("Vintagestory"))
}

#[cfg(target_os = "linux")]
fn vintage_story_path() -> Option<PathBuf> {
    home_directory().map(|path| path.join(".config/VintagestoryData"))
}

#[cfg(target_os = "macos")]
fn vintage_story_path() -> Option<PathBuf> {
    home_directory().map(|path| path.join("Library/Application Support/VintagestoryData"))
}

#[cfg(windows)]
fn steam_game_path(game: &str) -> Option<PathBuf> {
    let mut roots = steam_registry_path().into_iter().collect::<Vec<_>>();
    if let Some(program_files) = std::env::var_os("ProgramFiles(x86)") {
        roots.push(PathBuf::from(program_files).join("Steam"));
    }
    for root in roots {
        let libraries = fs::read_to_string(root.join("steamapps/libraryfolders.vdf")).map_or_else(
            |_| vec![root.clone()],
            |value| steam_library_paths(&root, &value),
        );
        for library in libraries {
            let candidate = library.join("steamapps/common").join(game);
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(windows)]
fn steam_registry_path() -> Option<PathBuf> {
    [
        (r"HKCU\Software\Valve\Steam", "SteamPath"),
        (r"HKLM\SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (r"HKLM\SOFTWARE\Valve\Steam", "InstallPath"),
    ]
    .into_iter()
    .find_map(|(key, value)| {
        let output = std::process::Command::new("reg")
            .args(["query", key, "/v", value])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| {
                line.split_once("REG_SZ")
                    .map(|(_, path)| PathBuf::from(path.trim()))
            })
    })
}

#[cfg(windows)]
fn steam_library_paths(root: &Path, contents: &str) -> Vec<PathBuf> {
    let mut paths = vec![root.to_path_buf()];
    paths.extend(contents.lines().filter_map(|line| {
        let fields = line.split('"').collect::<Vec<_>>();
        (fields.get(1) == Some(&"path"))
            .then(|| fields.get(3))
            .flatten()
            .map(|path| PathBuf::from(path.replace(r"\\", r"\")))
    }));
    paths.sort();
    paths.dedup();
    paths
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn steam_game_path(game: &str) -> Option<PathBuf> {
    let relative = if cfg!(target_os = "macos") {
        "Library/Application Support/Steam/steamapps/common"
    } else {
        ".steam/steam/steamapps/common"
    };
    home_directory().map(|path| path.join(relative).join(game))
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn validate_settings(settings: &SettingsManifest) -> Result<(), CommandError> {
    if settings.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            format!("Unsupported settings version {}", settings.schema_version),
        ));
    }
    for game_path in &settings.game_paths {
        if !game_path.path.is_empty() && !Path::new(&game_path.path).is_absolute() {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Game paths must be absolute",
            ));
        }
    }
    Ok(())
}

fn normalize_game_paths(settings: &mut SettingsManifest) -> Result<(), CommandError> {
    for game_path in &mut settings.game_paths {
        if game_path.path.is_empty() {
            continue;
        }
        let path = fs::canonicalize(&game_path.path).map_err(|error| {
            CommandError::io("Could not open a configured game directory", &error)
        })?;
        if !path.is_dir() {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "A configured game path is not a directory",
            ));
        }
        game_path.path = path.to_string_lossy().into_owned();
    }
    Ok(())
}

fn read_settings(path: &Path) -> Result<SettingsManifest, CommandError> {
    let contents =
        fs::read(path).map_err(|error| CommandError::io("Could not read settings", &error))?;
    let settings: SettingsManifest =
        serde_json::from_slice(&contents).map_err(|error| CommandError {
            code: CommandErrorCode::CorruptedData,
            message: "The settings file is corrupted".into(),
            retryable: false,
            details: Some(error.to_string()),
        })?;
    validate_settings(&settings)?;
    Ok(settings)
}

fn write_settings(path: &Path, settings: &SettingsManifest) -> Result<(), CommandError> {
    let json = serde_json::to_vec_pretty(settings).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize settings".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    atomic_write(path, &json).map_err(|error| CommandError::io("Could not save settings", &error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn write_settings_replaces_the_previous_valid_file() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("modsync-settings-{nonce}"));
        let path = directory.join(SETTINGS_FILE);
        let mut settings = default_settings();
        write_settings(&path, &settings).unwrap();
        settings.game_paths[0].detected = true;

        write_settings(&path, &settings).unwrap();

        assert!(read_settings(&path).unwrap().game_paths[0].detected);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn steam_libraries_include_registry_root_and_vdf_paths() {
        let root = Path::new(r"F:\Program Files (x86)\Steam");
        let paths = steam_library_paths(
            root,
            r#"
                "path" "F:\\Program Files (x86)\\Steam"
                "path" "D:\\SteamLibrary"
            "#,
        );

        assert_eq!(
            paths,
            vec![PathBuf::from(r"D:\SteamLibrary"), root.to_path_buf()]
        );
    }

    #[test]
    fn validate_settings_rejects_relative_game_paths() {
        let mut settings = default_settings();
        settings.game_paths[0].path = "relative/path".into();

        let error = validate_settings(&settings).unwrap_err();

        assert!(matches!(error.code, CommandErrorCode::InvalidInput));
    }
}
