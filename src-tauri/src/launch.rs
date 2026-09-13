use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::{Digest, Sha1};
use tauri::{AppHandle, Emitter};

use crate::catalog::{GameId, LoaderId};
use crate::contracts::{CommandError, CommandErrorCode, InstanceManifest};
use crate::{instances, persistence::atomic_write, providers, settings};

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSET_URL: &str = "https://resources.download.minecraft.net";
const MAX_CONFIGURED_ARGUMENTS: usize = 64;

struct ProcessLaunch {
    child: Child,
    cleanup: Vec<CleanupFile>,
}

struct CleanupFile {
    path: PathBuf,
    previous: Option<Vec<u8>>,
    installed: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub message: String,
    pub timestamp: String,
    pub level: LogLevel,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaRuntime {
    pub path: String,
    pub version: String,
    pub major_version: u32,
}

#[tauri::command]
pub async fn launch_instance(
    app: AppHandle,
    instance_id: String,
) -> Result<InstanceManifest, CommandError> {
    instances::validate_id(&instance_id)?;
    {
        let mut running = running_instances().lock().map_err(lock_error)?;
        if !running.insert(instance_id.clone()) {
            return Err(CommandError::new(
                CommandErrorCode::Conflict,
                "This instance is already running",
            ));
        }
    }

    let result = launch(&app, &instance_id).await;
    if let Err(error) = &result {
        if let Ok(root) = instances::instances_root(&app) {
            let _ = emit_log(
                &app,
                &root.join(&instance_id),
                &instance_id,
                LogLevel::Error,
                &error.message,
            );
        }
        if let Ok(mut running) = running_instances().lock() {
            running.remove(&instance_id);
        }
    }
    result
}

#[tauri::command]
pub fn list_java_runtimes() -> Vec<JavaRuntime> {
    find_java_runtimes()
}

#[tauri::command]
pub fn logs_directory(app: AppHandle, instance_id: String) -> Result<String, CommandError> {
    instances::validate_id(&instance_id)?;
    let directory = instances::instances_root(&app)?
        .join(instance_id)
        .join("logs");
    fs::create_dir_all(&directory)
        .map_err(|error| CommandError::io("Could not create the process log directory", &error))?;
    Ok(directory.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_process_logs(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<LogLine>, CommandError> {
    instances::validate_id(&instance_id)?;
    let path = log_path(&instances::instances_root(&app)?.join(instance_id));
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = File::open(path)
        .map_err(|error| CommandError::io("Could not read process logs", &error))?;
    let mut lines = BufReader::new(file)
        .lines()
        .filter_map(|line| {
            line.ok()
                .and_then(|value| serde_json::from_str::<LogLine>(&value).ok())
        })
        .collect::<Vec<_>>();
    if lines.len() > 5_000 {
        lines.drain(..lines.len() - 5_000);
    }
    Ok(lines)
}

async fn launch(app: &AppHandle, instance_id: &str) -> Result<InstanceManifest, CommandError> {
    let metadata = instances::instances_root(app)?.join(instance_id);
    let mut manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    let configured = settings::get_settings(app.clone())?
        .game_paths
        .into_iter()
        .find(|entry| entry.game_id == manifest.game_id && !entry.path.is_empty())
        .map(|entry| PathBuf::from(entry.path))
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::NotFound,
                "Configure the game installation folder in Settings before launching",
            )
        })?;
    let root = PathBuf::from(&manifest.location.path);
    if !root.is_dir() {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            "The instance folder does not exist",
        ));
    }

    reset_log(&metadata)?;
    emit_log(
        app,
        &metadata,
        instance_id,
        LogLevel::Info,
        "Preparing launch",
    )?;
    let process = match manifest.game_id {
        GameId::Minecraft => {
            launch_minecraft(
                app,
                &metadata,
                instance_id,
                &configured,
                &root,
                &mut manifest,
            )
            .await?
        }
        GameId::LethalCompany => launch_bepinex(&configured, &root, "Lethal Company.exe")?,
        GameId::Valheim => launch_bepinex(&configured, &root, valheim_executable())?,
        GameId::VintageStory => launch_vintage_story(&configured, &root)?,
    };

    manifest.last_played = Some(Utc::now().to_rfc3339());
    manifest.updated_at = Utc::now().to_rfc3339();
    instances::write_manifest(&metadata, &manifest)?;
    monitor_process(app.clone(), metadata, instance_id.to_owned(), process)?;
    Ok(manifest)
}

async fn launch_minecraft(
    app: &AppHandle,
    metadata: &Path,
    instance_id: &str,
    minecraft_directory: &Path,
    game_directory: &Path,
    manifest: &mut InstanceManifest,
) -> Result<ProcessLaunch, CommandError> {
    let runtime = game_directory.join(".modsync-runtime");
    fs::create_dir_all(&runtime).map_err(|error| {
        CommandError::io("Could not create the Minecraft runtime directory", &error)
    })?;
    emit_log(
        app,
        metadata,
        instance_id,
        LogLevel::Info,
        "Preparing Minecraft files",
    )?;
    let base = prepare_minecraft_version(&runtime, &manifest.game_version).await?;
    let loader = prepare_loader_profile(minecraft_directory, &runtime, manifest).await?;
    let required_java = base
        .pointer("/javaVersion/majorVersion")
        .and_then(Value::as_u64)
        .map_or_else(
            || java_for_minecraft(&manifest.game_version),
            |value| value as u32,
        );
    let java = select_java(required_java)?;
    emit_log(
        app,
        metadata,
        instance_id,
        LogLevel::Info,
        &format!("Using Java {} from {}", java.version, java.path),
    )?;

    let libraries = runtime.join("libraries");
    let assets = runtime.join("assets");
    let natives = runtime.join("natives");
    fs::create_dir_all(&natives).map_err(|error| {
        CommandError::io("Could not create the native library directory", &error)
    })?;
    let mut classpath = prepare_libraries(&runtime, &base, &natives).await?;
    if let Some(profile) = &loader {
        classpath.extend(prepare_profile_libraries(&libraries, profile).await?);
    }
    classpath.push(
        runtime
            .join("versions")
            .join(&manifest.game_version)
            .join(format!("{}.jar", manifest.game_version)),
    );
    let classpath = std::env::join_paths(classpath).map_err(|error| CommandError {
        code: CommandErrorCode::InvalidInput,
        message: "Could not build the Minecraft classpath".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    let main_class = loader
        .as_ref()
        .and_then(|profile| profile.get("mainClass"))
        .and_then(Value::as_str)
        .or_else(|| base.get("mainClass").and_then(Value::as_str))
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::CorruptedData,
                "Minecraft metadata has no main class",
            )
        })?;

    let placeholders = MinecraftPlaceholders {
        assets: &assets,
        natives: &natives,
        libraries: &libraries,
        classpath: &classpath.to_string_lossy(),
        game_directory,
        version: &manifest.game_version,
        assets_index: base
            .get("assets")
            .and_then(Value::as_str)
            .unwrap_or("legacy"),
    };
    let mut arguments = vec![format!("-Xmx{}M", manifest.memory_mb)];
    if let Some(custom) = &manifest.java_args {
        arguments.extend(parse_arguments(custom)?);
    }
    arguments.extend(metadata_arguments(&base, "jvm", &placeholders));
    if let Some(profile) = &loader {
        arguments.extend(metadata_arguments(profile, "jvm", &placeholders));
    }
    arguments.push(main_class.to_owned());
    if let Some(legacy) = base.get("minecraftArguments").and_then(Value::as_str) {
        arguments.extend(
            parse_arguments(legacy)?
                .into_iter()
                .map(|value| resolve_argument(&value, &placeholders)),
        );
    } else {
        arguments.extend(metadata_arguments(&base, "game", &placeholders));
    }
    if let Some(profile) = &loader {
        arguments.extend(metadata_arguments(profile, "game", &placeholders));
    }

    let mut command = Command::new(&java.path);
    command
        .args(arguments)
        .current_dir(game_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    spawn(&mut command, "Could not launch Minecraft").map(|child| ProcessLaunch {
        child,
        cleanup: Vec::new(),
    })
}

async fn prepare_minecraft_version(runtime: &Path, version: &str) -> Result<Value, CommandError> {
    let manifest: Value =
        providers::http::get_json(providers::http::client()?.get(VERSION_MANIFEST_URL)).await?;
    let version_url = manifest
        .get("versions")
        .and_then(Value::as_array)
        .and_then(|versions| {
            versions
                .iter()
                .find(|entry| entry.get("id").and_then(Value::as_str) == Some(version))
        })
        .and_then(|entry| entry.get("url"))
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::NotFound,
                "Minecraft version metadata was not found",
            )
        })?;
    let metadata: Value =
        providers::http::get_json(providers::http::client()?.get(version_url)).await?;
    let version_directory = runtime.join("versions").join(version);
    fs::create_dir_all(&version_directory).map_err(|error| {
        CommandError::io("Could not create the Minecraft version directory", &error)
    })?;
    write_json(
        &version_directory.join(format!("{version}.json")),
        &metadata,
    )?;
    download_artifact(
        metadata
            .get("downloads")
            .and_then(|value| value.get("client")),
        &version_directory.join(format!("{version}.jar")),
    )
    .await?;
    prepare_assets(runtime, &metadata).await?;
    Ok(metadata)
}

async fn prepare_assets(runtime: &Path, metadata: &Value) -> Result<(), CommandError> {
    let index = metadata.get("assetIndex").ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::CorruptedData,
            "Minecraft metadata has no asset index",
        )
    })?;
    let id = index.get("id").and_then(Value::as_str).ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::CorruptedData,
            "Minecraft asset index has no identifier",
        )
    })?;
    let index_path = runtime.join("assets/indexes").join(format!("{id}.json"));
    download_artifact(Some(index), &index_path).await?;
    let index_data: Value =
        serde_json::from_slice(&fs::read(&index_path).map_err(|error| {
            CommandError::io("Could not read the Minecraft asset index", &error)
        })?)
        .map_err(|error| data_error("The Minecraft asset index is invalid", error))?;
    for object in index_data
        .get("objects")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(_, value)| value)
    {
        let Some(hash) = object.get("hash").and_then(Value::as_str) else {
            continue;
        };
        if hash.len() < 2 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Minecraft asset hash is invalid",
            ));
        }
        let path = runtime.join("assets/objects").join(&hash[..2]).join(hash);
        if path.is_file() {
            continue;
        }
        let bytes = providers::http::get_bytes(
            providers::http::client()?.get(format!("{ASSET_URL}/{}/{hash}", &hash[..2])),
        )
        .await?;
        write_verified(&path, &bytes, Some(hash))?;
    }
    Ok(())
}

async fn prepare_libraries(
    runtime: &Path,
    metadata: &Value,
    natives: &Path,
) -> Result<Vec<PathBuf>, CommandError> {
    let mut classpath = Vec::new();
    for library in metadata
        .get("libraries")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if !rules_allow(library.get("rules")) {
            continue;
        }
        if let Some(artifact) = library.pointer("/downloads/artifact") {
            let path = artifact_path(runtime, artifact)?;
            download_artifact(Some(artifact), &path).await?;
            classpath.push(path);
        }
        let Some(classifier) = native_classifier(library) else {
            continue;
        };
        let Some(artifact) = library.pointer(&format!("/downloads/classifiers/{classifier}"))
        else {
            continue;
        };
        let path = artifact_path(runtime, artifact)?;
        download_artifact(Some(artifact), &path).await?;
        extract_natives(&path, natives, library)?;
    }
    Ok(classpath)
}

async fn prepare_loader_profile(
    minecraft_directory: &Path,
    runtime: &Path,
    manifest: &mut InstanceManifest,
) -> Result<Option<Value>, CommandError> {
    match manifest.loader {
        LoaderId::Vanilla => Ok(None),
        LoaderId::Fabric => {
            let versions: Value =
                providers::http::get_json(providers::http::client()?.get(format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{}",
                    manifest.game_version
                )))
                .await?;
            let version = versions
                .as_array()
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| {
                            item.pointer("/loader/stable").and_then(Value::as_bool) == Some(true)
                        })
                        .or_else(|| items.first())
                })
                .and_then(|item| item.pointer("/loader/version"))
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    CommandError::new(
                        CommandErrorCode::Incompatible,
                        "No Fabric loader supports this Minecraft version",
                    )
                })?;
            let profile: Value =
                providers::http::get_json(providers::http::client()?.get(format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{}/{version}/profile/json",
                    manifest.game_version
                )))
                .await?;
            manifest.loader_version = version.to_owned();
            write_json(&runtime.join("loader-profile.json"), &profile)?;
            Ok(Some(profile))
        }
        LoaderId::Forge | LoaderId::NeoForge => {
            let profile = find_installed_loader_profile(
                minecraft_directory,
                &manifest.game_version,
                manifest.loader,
            )?;
            manifest.loader_version = profile
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("installed")
                .to_owned();
            write_json(&runtime.join("loader-profile.json"), &profile)?;
            Ok(Some(profile))
        }
        LoaderId::BepInEx => Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "BepInEx cannot launch Minecraft",
        )),
    }
}

async fn prepare_profile_libraries(
    directory: &Path,
    profile: &Value,
) -> Result<Vec<PathBuf>, CommandError> {
    let mut classpath = Vec::new();
    for library in profile
        .get("libraries")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if !rules_allow(library.get("rules")) {
            continue;
        }
        if let Some(artifact) = library.pointer("/downloads/artifact") {
            let relative = artifact
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    CommandError::new(
                        CommandErrorCode::CorruptedData,
                        "Loader library path is missing",
                    )
                })?;
            let path = safe_join(directory, relative)?;
            download_artifact(Some(artifact), &path).await?;
            classpath.push(path);
            continue;
        }
        let Some(name) = library.get("name").and_then(Value::as_str) else {
            continue;
        };
        let relative = maven_path(name)?;
        let path = safe_join(directory, &relative)?;
        if !path.exists() {
            let base = library
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or("https://libraries.minecraft.net/");
            let bytes = providers::http::get_bytes(providers::http::client()?.get(format!(
                "{}{relative}",
                base.trim_end_matches('/').to_owned() + "/"
            )))
            .await?;
            write_verified(&path, &bytes, None)?;
        }
        classpath.push(path);
    }
    Ok(classpath)
}

fn find_installed_loader_profile(
    directory: &Path,
    game_version: &str,
    loader: LoaderId,
) -> Result<Value, CommandError> {
    let needle = match loader {
        LoaderId::Forge => "forge",
        LoaderId::NeoForge => "neoforge",
        _ => unreachable!(),
    };
    let versions = directory.join("versions");
    let entries = fs::read_dir(&versions).map_err(|error| {
        CommandError::io("Could not inspect installed Minecraft profiles", &error)
    })?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if !name.contains(needle) || !name.contains(&game_version.to_lowercase()) {
            continue;
        }
        let path = entry
            .path()
            .join(format!("{}.json", entry.file_name().to_string_lossy()));
        if let Ok(bytes) = fs::read(path) {
            if let Ok(profile) = serde_json::from_slice(&bytes) {
                return Ok(profile);
            }
        }
    }
    Err(CommandError::new(
        CommandErrorCode::NotFound,
        format!("Install the {needle} profile for Minecraft {game_version} with its official installer before launching"),
    ))
}

fn launch_bepinex(
    game_directory: &Path,
    instance_directory: &Path,
    executable: &str,
) -> Result<ProcessLaunch, CommandError> {
    let executable = game_directory.join(executable);
    if !executable.is_file() {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            format!("Game executable was not found at {}", executable.display()),
        ));
    }
    let preloader = [
        "BepInEx/core/BepInEx.Preloader.dll",
        "BepInEx/core/BepInEx.Preloader.Core.dll",
    ]
    .into_iter()
    .map(|path| instance_directory.join(path))
    .find(|path| path.is_file())
    .ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::NotFound,
            "BepInEx is not installed or is damaged",
        )
    })?;
    let bootstrap = ["winhttp.dll", "version.dll"]
        .into_iter()
        .map(|name| instance_directory.join(name))
        .find(|path| path.is_file())
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::NotFound,
                "BepInEx Doorstop bootstrap is missing; repair the loader before launching",
            )
        })?;
    let mut cleanup = vec![install_launch_file(
        &fs::read(&bootstrap)
            .map_err(|error| CommandError::io("Could not read the Doorstop bootstrap", &error))?,
        &game_directory.join(bootstrap.file_name().unwrap_or_default()),
    )?];
    let doorstop_config = format!(
        "[UnityDoorstop]\r\nenabled=true\r\ntargetAssembly={}\r\n",
        preloader
            .canonicalize()
            .unwrap_or_else(|_| preloader.clone())
            .display()
    );
    match install_launch_file(
        doorstop_config.as_bytes(),
        &game_directory.join("doorstop_config.ini"),
    ) {
        Ok(file) => cleanup.push(file),
        Err(error) => {
            restore_launch_files(cleanup);
            return Err(error);
        }
    }

    let mut command = Command::new(executable);
    command
        .args(["--doorstop-enable", "true", "--doorstop-target"])
        .arg(&preloader)
        .env("DOORSTOP_ENABLED", "TRUE")
        .env("DOORSTOP_TARGET_ASSEMBLY", &preloader)
        .env("BEPINEX_ROOT_PATH", instance_directory)
        .current_dir(game_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    match spawn(&mut command, "Could not launch the game") {
        Ok(child) => Ok(ProcessLaunch { child, cleanup }),
        Err(error) => {
            restore_launch_files(cleanup);
            Err(error)
        }
    }
}

fn install_launch_file(bytes: &[u8], path: &Path) -> Result<CleanupFile, CommandError> {
    let previous = if path.exists() {
        Some(fs::read(path).map_err(|error| {
            CommandError::io("Could not back up an existing game launch file", &error)
        })?)
    } else {
        None
    };
    atomic_write(path, bytes).map_err(|error| {
        CommandError::io(
            "Could not prepare the selected instance environment",
            &error,
        )
    })?;
    Ok(CleanupFile {
        path: path.to_path_buf(),
        previous,
        installed: bytes.to_vec(),
    })
}

fn restore_launch_files(files: Vec<CleanupFile>) {
    for file in files.into_iter().rev() {
        if fs::read(&file.path).ok().as_deref() != Some(file.installed.as_slice()) {
            continue;
        }
        if let Some(previous) = file.previous {
            let _ = atomic_write(&file.path, &previous);
        } else {
            let _ = fs::remove_file(file.path);
        }
    }
}

fn launch_vintage_story(
    game_directory: &Path,
    data_directory: &Path,
) -> Result<ProcessLaunch, CommandError> {
    let executable = game_directory.join(vintage_story_executable());
    if !executable.is_file() {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            format!(
                "Vintage Story executable was not found at {}",
                executable.display()
            ),
        ));
    }
    let mut command = Command::new(executable);
    command
        .arg("--dataPath")
        .arg(data_directory)
        .current_dir(game_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    spawn(&mut command, "Could not launch Vintage Story").map(|child| ProcessLaunch {
        child,
        cleanup: Vec::new(),
    })
}

fn monitor_process(
    app: AppHandle,
    metadata: PathBuf,
    instance_id: String,
    process: ProcessLaunch,
) -> Result<(), CommandError> {
    let ProcessLaunch { mut child, cleanup } = process;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    std::thread::Builder::new()
        .name(format!("modsync-process-{instance_id}"))
        .spawn(move || {
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path(&metadata));
            let writer = file.ok().map(|file| Arc::new(Mutex::new(file)));
            let mut readers = Vec::new();
            if let Some(stdout) = stdout {
                readers.push(stream_output(
                    app.clone(),
                    instance_id.clone(),
                    writer.clone(),
                    stdout,
                ));
            }
            if let Some(stderr) = stderr {
                readers.push(stream_output(
                    app.clone(),
                    instance_id.clone(),
                    writer.clone(),
                    stderr,
                ));
            }
            let status = child.wait();
            for reader in readers {
                let _ = reader.join();
            }
            let message = match status {
                Ok(status) if status.success() => "Game process exited".to_owned(),
                Ok(status) => format!("Game process exited with {status}"),
                Err(ref error) => format!("Could not wait for the game process: {error}"),
            };
            let level = if status.is_ok_and(|value| value.success()) {
                LogLevel::Info
            } else {
                LogLevel::Error
            };
            let line = LogLine {
                message,
                timestamp: Utc::now().to_rfc3339(),
                level,
            };
            persist_and_emit(&app, &instance_id, writer.as_ref(), &line);
            restore_launch_files(cleanup);
            if let Ok(mut running) = running_instances().lock() {
                running.remove(&instance_id);
            }
        })
        .map_err(|error| CommandError::io("Could not monitor the game process", &error))?;
    Ok(())
}

fn stream_output<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    instance_id: String,
    writer: Option<Arc<Mutex<File>>>,
    stream: R,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for message in BufReader::new(stream).lines().map_while(Result::ok) {
            let line = LogLine {
                level: classify_log(&message),
                message,
                timestamp: Utc::now().to_rfc3339(),
            };
            persist_and_emit(&app, &instance_id, writer.as_ref(), &line);
        }
    })
}

fn persist_and_emit(
    app: &AppHandle,
    instance_id: &str,
    writer: Option<&Arc<Mutex<File>>>,
    line: &LogLine,
) {
    if let Some(writer) = writer {
        if let (Ok(mut file), Ok(json)) = (writer.lock(), serde_json::to_string(line)) {
            let _ = writeln!(file, "{json}");
        }
    }
    let _ = app.emit("launch-log", LaunchLogEvent { instance_id, line });
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchLogEvent<'a> {
    instance_id: &'a str,
    line: &'a LogLine,
}

fn emit_log(
    app: &AppHandle,
    metadata: &Path,
    instance_id: &str,
    level: LogLevel,
    message: &str,
) -> Result<(), CommandError> {
    let line = LogLine {
        level,
        message: message.to_owned(),
        timestamp: Utc::now().to_rfc3339(),
    };
    fs::create_dir_all(metadata.join("logs"))
        .map_err(|error| CommandError::io("Could not create the process log directory", &error))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path(metadata))
        .map_err(|error| CommandError::io("Could not write the process log", &error))?;
    serde_json::to_writer(&mut file, &line)
        .map_err(|error| data_error("Could not serialize a process log", error))?;
    writeln!(file).map_err(|error| CommandError::io("Could not write the process log", &error))?;
    let _ = app.emit(
        "launch-log",
        LaunchLogEvent {
            instance_id,
            line: &line,
        },
    );
    Ok(())
}

fn reset_log(metadata: &Path) -> Result<(), CommandError> {
    let directory = metadata.join("logs");
    fs::create_dir_all(&directory)
        .map_err(|error| CommandError::io("Could not create the process log directory", &error))?;
    File::create(log_path(metadata))
        .map_err(|error| CommandError::io("Could not reset the process log", &error))?;
    Ok(())
}

fn log_path(metadata: &Path) -> PathBuf {
    metadata.join("logs/latest.jsonl")
}

fn running_instances() -> &'static Mutex<HashSet<String>> {
    static RUNNING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> CommandError {
    CommandError {
        code: CommandErrorCode::Io,
        message: "Process state is unavailable".into(),
        retryable: true,
        details: Some(error.to_string()),
    }
}

fn classify_log(message: &str) -> LogLevel {
    let lowercase = message.to_lowercase();
    if lowercase.contains("error") || lowercase.contains("exception") || lowercase.contains("fatal")
    {
        LogLevel::Error
    } else if lowercase.contains("warn") {
        LogLevel::Warn
    } else if lowercase.contains("debug") || lowercase.contains("trace") {
        LogLevel::Debug
    } else {
        LogLevel::Info
    }
}

fn find_java_runtimes() -> Vec<JavaRuntime> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("JAVA_HOME") {
        candidates.push(PathBuf::from(home).join("bin").join(java_executable()));
    }
    #[cfg(windows)]
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(variable) {
            for vendor in ["Java", "Eclipse Adoptium", "Microsoft", "Zulu", "BellSoft"] {
                if let Ok(entries) = fs::read_dir(PathBuf::from(&root).join(vendor)) {
                    candidates.extend(
                        entries
                            .flatten()
                            .map(|entry| entry.path().join("bin/java.exe")),
                    );
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    if let Ok(entries) = fs::read_dir("/usr/lib/jvm") {
        candidates.extend(entries.flatten().map(|entry| entry.path().join("bin/java")));
    }
    #[cfg(target_os = "macos")]
    if let Ok(entries) = fs::read_dir("/Library/Java/JavaVirtualMachines") {
        candidates.extend(
            entries
                .flatten()
                .map(|entry| entry.path().join("Contents/Home/bin/java")),
        );
    }
    candidates.push(PathBuf::from("java"));

    let mut seen = HashSet::new();
    let mut runtimes = candidates
        .into_iter()
        .filter_map(|path| {
            let output = Command::new(&path).arg("-version").output().ok()?;
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stderr),
                String::from_utf8_lossy(&output.stdout)
            );
            let version = parse_java_version(&text)?;
            let major_version = java_major(&version)?;
            let key = path.to_string_lossy().to_lowercase();
            seen.insert(key).then_some(JavaRuntime {
                path: path.to_string_lossy().into_owned(),
                version,
                major_version,
            })
        })
        .collect::<Vec<_>>();
    runtimes.sort_by_key(|runtime| std::cmp::Reverse(runtime.major_version));
    runtimes
}

fn select_java(required: u32) -> Result<JavaRuntime, CommandError> {
    let runtimes = find_java_runtimes();
    runtimes
        .iter()
        .find(|runtime| runtime.major_version == required)
        .or_else(|| {
            runtimes
                .iter()
                .filter(|runtime| runtime.major_version > required)
                .min_by_key(|runtime| runtime.major_version)
        })
        .cloned()
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::NotFound,
                format!("Java {required} or newer is required for this Minecraft version"),
            )
        })
}

fn parse_java_version(output: &str) -> Option<String> {
    let start = output.find('"')? + 1;
    let end = output[start..].find('"')? + start;
    Some(output[start..end].to_owned())
}

fn java_major(version: &str) -> Option<u32> {
    let version = version.strip_prefix("1.").unwrap_or(version);
    version.split(['.', '_', '-']).next()?.parse().ok()
}

fn java_for_minecraft(version: &str) -> u32 {
    let mut parts = version
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());
    let major = parts.next().unwrap_or(1);
    let minor = parts.next().unwrap_or(0);
    if major > 1 || minor >= 21 {
        21
    } else if minor >= 17 {
        17
    } else {
        8
    }
}

fn metadata_arguments(
    metadata: &Value,
    kind: &str,
    placeholders: &MinecraftPlaceholders<'_>,
) -> Vec<String> {
    metadata
        .pointer(&format!("/arguments/{kind}"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|argument| rules_allow(argument.get("rules")))
        .flat_map(|argument| {
            argument
                .get("value")
                .unwrap_or(argument)
                .as_array()
                .cloned()
                .unwrap_or_else(|| vec![argument.get("value").unwrap_or(argument).clone()])
        })
        .filter_map(|argument| {
            argument
                .as_str()
                .map(|value| resolve_argument(value, placeholders))
        })
        .filter(|argument| !argument.is_empty())
        .collect()
}

struct MinecraftPlaceholders<'a> {
    assets: &'a Path,
    natives: &'a Path,
    libraries: &'a Path,
    classpath: &'a str,
    game_directory: &'a Path,
    version: &'a str,
    assets_index: &'a str,
}

fn resolve_argument(argument: &str, values: &MinecraftPlaceholders<'_>) -> String {
    argument
        .replace("${auth_player_name}", "Player")
        .replace("${version_name}", values.version)
        .replace(
            "${game_directory}",
            &values.game_directory.to_string_lossy(),
        )
        .replace("${assets_root}", &values.assets.to_string_lossy())
        .replace("${game_assets}", &values.assets.to_string_lossy())
        .replace("${assets_index_name}", values.assets_index)
        .replace("${auth_uuid}", "00000000000000000000000000000000")
        .replace("${auth_access_token}", "0")
        .replace("${clientid}", "")
        .replace("${auth_xuid}", "")
        .replace("${user_type}", "legacy")
        .replace("${version_type}", "release")
        .replace("${natives_directory}", &values.natives.to_string_lossy())
        .replace("${library_directory}", &values.libraries.to_string_lossy())
        .replace(
            "${classpath_separator}",
            if cfg!(windows) { ";" } else { ":" },
        )
        .replace("${launcher_name}", "ModSync")
        .replace("${launcher_version}", env!("CARGO_PKG_VERSION"))
        .replace("${classpath}", values.classpath)
}

fn rules_allow(rules: Option<&Value>) -> bool {
    let Some(rules) = rules.and_then(Value::as_array) else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let os_matches = rule.get("os").map_or(true, |os| {
            os.get("name")
                .and_then(Value::as_str)
                .map_or(true, |name| name == minecraft_os())
                && os
                    .get("arch")
                    .and_then(Value::as_str)
                    .map_or(true, |arch| arch == minecraft_arch())
        });
        let features_match =
            rule.get("features")
                .and_then(Value::as_object)
                .map_or(true, |features| {
                    features
                        .values()
                        .all(|value| value.as_bool() == Some(false))
                });
        if os_matches && features_match {
            allowed = rule.get("action").and_then(Value::as_str) == Some("allow");
        }
    }
    allowed
}

fn native_classifier(library: &Value) -> Option<String> {
    library
        .pointer(&format!("/natives/{}", minecraft_os()))
        .and_then(Value::as_str)
        .map(|value| {
            value.replace(
                "${arch}",
                if cfg!(target_pointer_width = "64") {
                    "64"
                } else {
                    "32"
                },
            )
        })
}

fn artifact_path(runtime: &Path, artifact: &Value) -> Result<PathBuf, CommandError> {
    let relative = artifact
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::CorruptedData,
                "Minecraft library path is missing",
            )
        })?;
    safe_join(&runtime.join("libraries"), relative)
}

async fn download_artifact(
    artifact: Option<&Value>,
    destination: &Path,
) -> Result<(), CommandError> {
    let artifact = artifact.ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::CorruptedData,
            "Download metadata is missing",
        )
    })?;
    let url = artifact.get("url").and_then(Value::as_str).ok_or_else(|| {
        CommandError::new(CommandErrorCode::CorruptedData, "Download URL is missing")
    })?;
    let expected_size = artifact.get("size").and_then(Value::as_u64);
    if destination.is_file()
        && expected_size.map_or(true, |size| {
            destination
                .metadata()
                .is_ok_and(|metadata| metadata.len() == size)
        })
    {
        return Ok(());
    }
    let bytes = providers::http::get_bytes(providers::http::client()?.get(url)).await?;
    if expected_size.is_some_and(|size| size != bytes.len() as u64) {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Downloaded file size does not match provider metadata",
        ));
    }
    write_verified(
        destination,
        &bytes,
        artifact.get("sha1").and_then(Value::as_str),
    )
}

fn write_verified(path: &Path, bytes: &[u8], sha1: Option<&str>) -> Result<(), CommandError> {
    if let Some(expected) = sha1 {
        let actual = format!("{:x}", Sha1::digest(bytes));
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Downloaded file failed its integrity check",
            ));
        }
    }
    atomic_write(path, bytes)
        .map_err(|error| CommandError::io("Could not commit a runtime file", &error))
}

fn write_json(path: &Path, value: &Value) -> Result<(), CommandError> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| data_error("Could not serialize runtime metadata", error))?;
    write_verified(path, &bytes, None)
}

fn extract_natives(
    archive_path: &Path,
    destination: &Path,
    library: &Value,
) -> Result<(), CommandError> {
    let file = File::open(archive_path)
        .map_err(|error| CommandError::io("Could not open a native library", &error))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "A native library archive is invalid".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    let excluded = library
        .pointer("/extract/exclude")
        .and_then(Value::as_array);
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| CommandError {
            code: CommandErrorCode::CorruptedData,
            message: "Could not inspect a native library archive".into(),
            retryable: false,
            details: Some(error.to_string()),
        })?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let name = relative.to_string_lossy();
        if entry.is_dir()
            || name.starts_with("META-INF/")
            || excluded.is_some_and(|values| {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .any(|prefix| name.starts_with(prefix))
            })
        {
            continue;
        }
        let output = destination.join(relative);
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                CommandError::io("Could not create a native library directory", &error)
            })?;
        }
        let mut file = File::create(output)
            .map_err(|error| CommandError::io("Could not create a native library", &error))?;
        std::io::copy(&mut entry, &mut file)
            .map_err(|error| CommandError::io("Could not extract a native library", &error))?;
    }
    Ok(())
}

fn maven_path(name: &str) -> Result<String, CommandError> {
    let parts = name.split(':').collect::<Vec<_>>();
    if !(3..=4).contains(&parts.len())
        || parts
            .iter()
            .any(|part| part.is_empty() || part.contains(['/', '\\']))
    {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Loader library coordinate is invalid",
        ));
    }
    let classifier = parts
        .get(3)
        .map_or(String::new(), |value| format!("-{value}"));
    Ok(format!(
        "{}/{}/{}/{}-{}{}.jar",
        parts[0].replace('.', "/"),
        parts[1],
        parts[2],
        parts[1],
        parts[2],
        classifier
    ))
}

fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, CommandError> {
    let relative = Path::new(relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Runtime path is unsafe",
        ));
    }
    Ok(root.join(relative))
}

fn parse_arguments(input: &str) -> Result<Vec<String>, CommandError> {
    let mut arguments = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    let mut characters = input.chars().peekable();
    while let Some(character) = characters.next() {
        if character == '\\'
            && characters
                .peek()
                .is_some_and(|next| next.is_whitespace() || matches!(next, '\\' | '\'' | '"'))
        {
            current.push(characters.next().unwrap_or('\\'));
        } else if quote == Some(character) {
            quote = None;
        } else if quote.is_none() && matches!(character, '\'' | '"') {
            quote = Some(character);
        } else if quote.is_none() && character.is_whitespace() {
            if !current.is_empty() {
                arguments.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }
    if quote.is_some() {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "JVM arguments contain an unfinished quote",
        ));
    }
    if !current.is_empty() {
        arguments.push(current);
    }
    if arguments.len() > MAX_CONFIGURED_ARGUMENTS {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Too many JVM arguments were configured",
        ));
    }
    Ok(arguments)
}

fn data_error(message: &str, error: serde_json::Error) -> CommandError {
    CommandError {
        code: CommandErrorCode::CorruptedData,
        message: message.into(),
        retryable: false,
        details: Some(error.to_string()),
    }
}

fn spawn(command: &mut Command, message: &str) -> Result<Child, CommandError> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
        .spawn()
        .map_err(|error| CommandError::io(message, &error))
}

fn minecraft_os() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn minecraft_arch() -> &'static str {
    if cfg!(target_arch = "x86") {
        "x86"
    } else {
        "x86_64"
    }
}

fn java_executable() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

fn vintage_story_executable() -> &'static str {
    if cfg!(windows) {
        "Vintagestory.exe"
    } else {
        "Vintagestory"
    }
}

fn valheim_executable() -> &'static str {
    if cfg!(windows) {
        "valheim.exe"
    } else {
        "valheim.x86_64"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argument_parser_preserves_quoted_values_and_rejects_unfinished_quotes() {
        assert_eq!(
            parse_arguments(r#"-Xms1G "-Dname=Mod Sync" -Dpath=C:\games"#).unwrap(),
            vec!["-Xms1G", "-Dname=Mod Sync", r"-Dpath=C:\games"]
        );
        assert!(parse_arguments("\"unfinished").is_err());
    }

    #[test]
    fn safe_join_rejects_runtime_path_traversal() {
        assert!(safe_join(Path::new("runtime"), "../outside.jar").is_err());
    }

    #[test]
    fn java_version_parser_handles_legacy_and_modern_versions() {
        assert_eq!(java_major("1.8.0_402"), Some(8));
        assert_eq!(java_major("21.0.2"), Some(21));
    }

    #[test]
    fn temporary_launch_files_restore_existing_game_files() {
        let directory = std::env::temp_dir().join(format!(
            "modsync-launch-cleanup-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let path = directory.join("doorstop_config.ini");
        atomic_write(&path, b"original").unwrap();
        let cleanup = install_launch_file(b"temporary", &path).unwrap();

        restore_launch_files(vec![cleanup]);

        assert_eq!(fs::read(&path).unwrap(), b"original");
        fs::remove_dir_all(directory).unwrap();
    }
}
