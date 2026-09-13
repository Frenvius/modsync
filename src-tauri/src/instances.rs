use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Utc;
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::catalog::{supports_loader, GameId, LoaderId};
use crate::contracts::{
    CommandError, CommandErrorCode, InstanceLocation, InstanceLocationKind, InstanceManifest,
    MANIFEST_SCHEMA_VERSION,
};
use crate::persistence::atomic_write;

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);
const MANIFEST_FILE: &str = "manifest.json";
const CONTENT_DIRECTORY: &str = "content";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceInput {
    pub name: String,
    pub icon: String,
    pub game_id: GameId,
    pub loader: LoaderId,
    pub icon_color: String,
    pub game_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInstanceInput {
    pub path: String,
    #[serde(flatten)]
    pub instance: CreateInstanceInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstanceInput {
    pub id: String,
    pub name: String,
    pub memory_mb: u32,
    #[serde(default)]
    pub java_args: Option<String>,
}

#[tauri::command]
pub fn list_instances(app: AppHandle) -> Result<Vec<InstanceManifest>, CommandError> {
    list_from(&instances_root(&app)?)
}

#[tauri::command]
pub fn create_instance(
    app: AppHandle,
    input: CreateInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    create_managed(&instances_root(&app)?, input)
}

#[tauri::command]
pub fn import_instance(
    app: AppHandle,
    input: ImportInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    import_external(&instances_root(&app)?, input)
}

#[tauri::command]
pub fn update_instance(
    app: AppHandle,
    input: UpdateInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    update_at(&instances_root(&app)?, input)
}

#[tauri::command]
pub fn duplicate_instance(app: AppHandle, id: String) -> Result<InstanceManifest, CommandError> {
    duplicate_at(&instances_root(&app)?, &id)
}

#[tauri::command]
pub fn delete_instance(app: AppHandle, id: String) -> Result<(), CommandError> {
    delete_at(&instances_root(&app)?, &id)
}

pub(crate) fn instances_root(app: &AppHandle) -> Result<PathBuf, CommandError> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("instances"))
        .map_err(|error| {
            CommandError::new(
                CommandErrorCode::Io,
                format!("Could not resolve application data directory: {error}"),
            )
        })
}

fn list_from(root: &Path) -> Result<Vec<InstanceManifest>, CommandError> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(root).map_err(|error| CommandError::io("Could not read instances", &error))?;
    let mut instances = Vec::new();
    for entry in entries {
        let entry = entry
            .map_err(|error| CommandError::io("Could not read an instance directory", &error))?;
        if !entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect an instance", &error))?
            .is_dir()
        {
            continue;
        }
        let manifest_path = entry.path().join(MANIFEST_FILE);
        if manifest_path.exists() {
            let mut manifest = read_manifest(&manifest_path)?;
            crate::content::recover_instance(&entry.path(), &mut manifest)?;
            crate::content::reconcile_instance(&entry.path(), &mut manifest)?;
            instances.push(manifest);
        }
    }
    instances.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(instances)
}

fn create_managed(
    root: &Path,
    input: CreateInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    validate_input(&input)?;
    let id = new_id();
    let metadata_directory = root.join(&id);
    let content_directory = metadata_directory.join(CONTENT_DIRECTORY);
    fs::create_dir_all(&content_directory)
        .map_err(|error| CommandError::io("Could not create the instance directory", &error))?;

    let manifest = new_manifest(
        id,
        input,
        InstanceLocation {
            path: content_directory.to_string_lossy().into_owned(),
            kind: InstanceLocationKind::Managed,
        },
    );
    if let Err(error) = write_manifest(&metadata_directory, &manifest) {
        let _ = fs::remove_dir_all(metadata_directory);
        return Err(error);
    }
    Ok(manifest)
}

fn import_external(
    root: &Path,
    input: ImportInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    validate_input(&input.instance)?;
    let source = fs::canonicalize(&input.path)
        .map_err(|error| CommandError::io("Could not open the imported directory", &error))?;
    if !source.is_dir() {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "The imported path must be a directory",
        ));
    }

    let id = new_id();
    let metadata_directory = root.join(&id);
    let manifest = new_manifest(
        id,
        input.instance,
        InstanceLocation {
            path: source.to_string_lossy().into_owned(),
            kind: InstanceLocationKind::External,
        },
    );
    write_manifest(&metadata_directory, &manifest)?;
    Ok(manifest)
}

fn update_at(root: &Path, input: UpdateInstanceInput) -> Result<InstanceManifest, CommandError> {
    validate_id(&input.id)?;
    let name = input.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Instance name must contain between 1 and 80 characters",
        ));
    }
    if !(512..=131_072).contains(&input.memory_mb) {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Memory must be between 512 MB and 131072 MB",
        ));
    }

    let metadata_directory = root.join(&input.id);
    let mut manifest = read_manifest(&metadata_directory.join(MANIFEST_FILE))?;
    manifest.name = name.into();
    manifest.memory_mb = input.memory_mb;
    manifest.java_args = input.java_args.filter(|value| !value.trim().is_empty());
    manifest.updated_at = now();
    write_manifest(&metadata_directory, &manifest)?;
    Ok(manifest)
}

fn duplicate_at(root: &Path, id: &str) -> Result<InstanceManifest, CommandError> {
    validate_id(id)?;
    let source_directory = root.join(id);
    let mut source = read_manifest(&source_directory.join(MANIFEST_FILE))?;
    crate::content::recover_instance(&source_directory, &mut source)?;
    crate::content::reconcile_instance(&source_directory, &mut source)?;
    let copy_id = new_id();
    let copy_directory = root.join(&copy_id);
    let location = match source.location.kind {
        InstanceLocationKind::Managed => {
            let destination = copy_directory.join(CONTENT_DIRECTORY);
            copy_directory_contents(Path::new(&source.location.path), &destination)?;
            InstanceLocation {
                path: destination.to_string_lossy().into_owned(),
                kind: InstanceLocationKind::Managed,
            }
        }
        InstanceLocationKind::External => source.location.clone(),
    };
    let timestamp = now();
    let mut copy = source;
    copy.id = copy_id;
    copy.name = format!("{} (copy)", copy.name);
    copy.created_at = timestamp.clone();
    copy.updated_at = timestamp;
    copy.last_played = None;
    copy.playtime_minutes = 0;
    copy.location = location;
    if let Err(error) = write_manifest(&copy_directory, &copy) {
        let _ = fs::remove_dir_all(copy_directory);
        return Err(error);
    }
    Ok(copy)
}

fn delete_at(root: &Path, id: &str) -> Result<(), CommandError> {
    validate_id(id)?;
    let metadata_directory = root.join(id);
    let manifest = read_manifest(&metadata_directory.join(MANIFEST_FILE))?;
    if manifest.id != id {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Instance identifier does not match its directory",
        ));
    }
    fs::remove_dir_all(metadata_directory)
        .map_err(|error| CommandError::io("Could not delete the instance", &error))
}

fn new_manifest(
    id: String,
    input: CreateInstanceInput,
    location: InstanceLocation,
) -> InstanceManifest {
    let timestamp = now();
    InstanceManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        id,
        name: input.name.trim().into(),
        icon: input.icon,
        icon_color: input.icon_color,
        description: format!("{} {}", game_name(input.game_id), input.game_version),
        game_id: input.game_id,
        game_version: input.game_version,
        loader: input.loader,
        loader_version: "latest".into(),
        memory_mb: 4096,
        java_args: None,
        location,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        last_played: None,
        playtime_minutes: 0,
        mods: Vec::new(),
        last_operation_id: None,
    }
}

fn validate_input(input: &CreateInstanceInput) -> Result<(), CommandError> {
    if input.name.trim().is_empty() || input.name.trim().len() > 80 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Instance name must contain between 1 and 80 characters",
        ));
    }
    if input.game_version.trim().is_empty() || input.game_version.len() > 40 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Game version is invalid",
        ));
    }
    if !supports_loader(input.game_id, input.loader) {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "The selected loader is not supported for this game",
        ));
    }
    Ok(())
}

pub(crate) fn validate_id(id: &str) -> Result<(), CommandError> {
    if id.is_empty()
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Instance identifier is invalid",
        ));
    }
    Ok(())
}

pub(crate) fn read_manifest(path: &Path) -> Result<InstanceManifest, CommandError> {
    let contents = fs::read(path)
        .map_err(|error| CommandError::io("Could not read the instance manifest", &error))?;
    let manifest: InstanceManifest =
        serde_json::from_slice(&contents).map_err(|error| CommandError {
            code: CommandErrorCode::CorruptedData,
            message: "The instance manifest is corrupted".into(),
            retryable: false,
            details: Some(error.to_string()),
        })?;
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            format!(
                "Unsupported instance manifest version {}",
                manifest.schema_version
            ),
        ));
    }
    Ok(manifest)
}

pub(crate) fn write_manifest(
    directory: &Path,
    manifest: &InstanceManifest,
) -> Result<(), CommandError> {
    let json = serde_json::to_vec_pretty(manifest).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize the instance manifest".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    atomic_write(&directory.join(MANIFEST_FILE), &json)
        .map_err(|error| CommandError::io("Could not save the instance manifest", &error))
}

fn copy_directory_contents(source: &Path, destination: &Path) -> Result<(), CommandError> {
    fs::create_dir_all(destination)
        .map_err(|error| CommandError::io("Could not create the duplicate directory", &error))?;
    for entry in fs::read_dir(source)
        .map_err(|error| CommandError::io("Could not read the source instance", &error))?
    {
        let entry = entry
            .map_err(|error| CommandError::io("Could not read the source instance", &error))?;
        let file_type = entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect the source instance", &error))?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_contents(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)
                .map_err(|error| CommandError::io("Could not copy an instance file", &error))?;
        } else {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Instance directories cannot contain symbolic links",
            ));
        }
    }
    Ok(())
}

fn game_name(game_id: GameId) -> &'static str {
    match game_id {
        GameId::Minecraft => "Minecraft",
        GameId::LethalCompany => "Lethal Company",
        GameId::Valheim => "Valheim",
        GameId::VintageStory => "Vintage Story",
    }
}

fn new_id() -> String {
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("inst-{}-{counter}", Utc::now().timestamp_millis())
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("modsync-{name}-{nonce}"))
    }

    fn input(name: &str) -> CreateInstanceInput {
        CreateInstanceInput {
            name: name.into(),
            icon: "sparkles".into(),
            game_id: GameId::Minecraft,
            loader: LoaderId::Fabric,
            icon_color: "#1bd96a".into(),
            game_version: "1.21.4".into(),
        }
    }

    #[test]
    fn create_managed_persists_a_manifest_that_can_be_listed() {
        let root = test_root("create");
        let created = create_managed(&root, input("Vanilla+")).unwrap();
        let listed = list_from(&root).unwrap();

        assert_eq!(listed, vec![created]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn update_persists_instance_settings() {
        let root = test_root("update");
        let created = create_managed(&root, input("Before")).unwrap();

        update_at(
            &root,
            UpdateInstanceInput {
                id: created.id.clone(),
                name: "After".into(),
                memory_mb: 8192,
                java_args: Some("-Xms2G".into()),
            },
        )
        .unwrap();

        assert_eq!(list_from(&root).unwrap()[0].name, "After");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_external_removes_metadata_without_removing_linked_directory() {
        let root = test_root("delete-external");
        let external = test_root("external-content");
        fs::create_dir_all(&external).unwrap();
        fs::write(external.join("keep.txt"), "keep").unwrap();
        let imported = import_external(
            &root,
            ImportInstanceInput {
                path: external.to_string_lossy().into_owned(),
                instance: input("Imported"),
            },
        )
        .unwrap();

        delete_at(&root, &imported.id).unwrap();

        assert!(external.join("keep.txt").exists());
        fs::remove_dir_all(external).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn delete_rejects_path_traversal_identifiers() {
        let root = test_root("traversal");

        let error = delete_at(&root, "../outside").unwrap_err();

        assert!(matches!(error.code, CommandErrorCode::InvalidInput));
    }

    #[test]
    fn duplicate_managed_copies_content_without_sharing_its_path() {
        let root = test_root("duplicate");
        let source = create_managed(&root, input("Source")).unwrap();
        fs::write(Path::new(&source.location.path).join("mod.jar"), "content").unwrap();

        let copy = duplicate_at(&root, &source.id).unwrap();

        assert!(
            Path::new(&copy.location.path).join("mod.jar").exists()
                && copy.location.path != source.location.path
        );
        fs::remove_dir_all(root).unwrap();
    }
}
