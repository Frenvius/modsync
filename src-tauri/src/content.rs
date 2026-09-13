use std::{
    collections::{HashSet, VecDeque},
    fs,
    io::{self, Write},
    path::{Component, Path, PathBuf},
    sync::OnceLock,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    catalog::{GameId, LoaderId, ProjectType},
    contracts::{
        CommandError, CommandErrorCode, InstalledFile, InstalledMod, InstanceLocationKind,
        InstanceManifest, OperationProgress, OperationStatus, UpdateStatus,
    },
    downloads::{self, ProgressContext},
    instances,
    persistence::atomic_write,
    providers::{self, DependencyType, Project, ProjectVersion},
};

const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_EXTRACTED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const TRANSACTIONS_DIRECTORY: &str = ".modsync-transactions";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallContentInput {
    pub operation_id: String,
    pub instance_id: String,
    pub project_id: String,
    pub version_id: Option<String>,
    #[serde(default)]
    pub optional_dependencies: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInstallInput {
    pub instance_id: String,
    pub project_id: String,
    pub version_id: Option<String>,
    #[serde(default)]
    pub optional_dependencies: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlanItem {
    pub project_id: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveContentInput {
    pub instance_id: String,
    pub project_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetContentEnabledInput {
    pub instance_id: String,
    pub project_id: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMutationResult {
    pub instance: InstanceManifest,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnmanagedContent {
    pub path: String,
    pub name: String,
    pub r#type: ProjectType,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalContentInput {
    pub instance_id: String,
    pub path: String,
}

struct PlanItem {
    project: Project,
    version: ProjectVersion,
}

struct PreparedFile {
    project_id: String,
    relative: PathBuf,
    source: PathBuf,
    sha512: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionJournal {
    project_ids: Vec<String>,
    files: Vec<TransactionFile>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransactionFile {
    relative: String,
    had_original: bool,
}

#[tauri::command]
pub fn list_unmanaged_content(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<UnmanagedContent>, CommandError> {
    instances::validate_id(&instance_id)?;
    let (_, manifest, root) = load_instance(&app, &instance_id)?;
    unmanaged_at(&root, &manifest)
}

#[tauri::command]
pub async fn import_local_content(
    app: AppHandle,
    input: ImportLocalContentInput,
) -> Result<InstanceManifest, CommandError> {
    let _guard = mutation_lock().lock().await;
    import_local_at(&app, input)
}

#[tauri::command]
pub async fn refresh_content(
    app: AppHandle,
    instance_id: String,
) -> Result<InstanceManifest, CommandError> {
    let _guard = mutation_lock().lock().await;
    instances::validate_id(&instance_id)?;
    let (metadata, mut manifest, root) = load_instance(&app, &instance_id)?;
    let before = manifest.mods.clone();
    reconcile_at(&root, &mut manifest);
    if manifest.mods != before {
        manifest.updated_at = chrono::Utc::now().to_rfc3339();
        instances::write_manifest(&metadata, &manifest)?;
    }
    Ok(manifest)
}

#[tauri::command]
pub async fn remove_content(
    app: AppHandle,
    input: RemoveContentInput,
) -> Result<ContentMutationResult, CommandError> {
    let _guard = mutation_lock().lock().await;
    remove_at(&app, input)
}

#[tauri::command]
pub async fn set_content_enabled(
    app: AppHandle,
    input: SetContentEnabledInput,
) -> Result<InstanceManifest, CommandError> {
    let _guard = mutation_lock().lock().await;
    set_enabled_at(&app, input)
}

#[tauri::command]
pub async fn preview_install(
    app: AppHandle,
    input: PreviewInstallInput,
) -> Result<Vec<InstallPlanItem>, CommandError> {
    instances::validate_id(&input.instance_id)?;
    if input.optional_dependencies.len() > 100 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Installation request is invalid",
        ));
    }
    let metadata = instances::instances_root(&app)?.join(&input.instance_id);
    let mut manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    let content_root = validate_content_root(&metadata, &manifest)?;
    recover_at(&content_root, &mut manifest, &metadata)?;
    let request = InstallContentInput {
        operation_id: "preview".into(),
        instance_id: input.instance_id,
        project_id: input.project_id,
        version_id: input.version_id,
        optional_dependencies: input.optional_dependencies,
    };
    resolve_plan(&app, &manifest, &request, false)
        .await
        .map(|items| {
            items
                .into_iter()
                .map(|item| InstallPlanItem {
                    project_id: item.project.id,
                    name: item.project.name,
                    version: item.version.number,
                })
                .collect()
        })
}

#[tauri::command]
pub async fn install_content(
    app: AppHandle,
    input: InstallContentInput,
) -> Result<InstanceManifest, CommandError> {
    execute_install(app, input, false).await
}

#[tauri::command]
pub async fn repair_content(
    app: AppHandle,
    input: InstallContentInput,
) -> Result<InstanceManifest, CommandError> {
    execute_install(app, input, true).await
}

async fn execute_install(
    app: AppHandle,
    input: InstallContentInput,
    replace: bool,
) -> Result<InstanceManifest, CommandError> {
    validate_input(&input)?;
    downloads::register_operation(&input.operation_id).await?;
    emit(
        &app,
        OperationProgress {
            message: "Waiting to install".into(),
            operation_id: input.operation_id.clone(),
            status: OperationStatus::Pending,
            completed_items: 0,
            total_items: 0,
            downloaded_bytes: 0,
            total_bytes: 0,
        },
    );
    let _guard = mutation_lock().lock().await;
    let result = run_install(&app, &input, replace).await;
    match &result {
        Ok(_) => emit(
            &app,
            OperationProgress {
                message: "Installed".into(),
                operation_id: input.operation_id.clone(),
                status: OperationStatus::Completed,
                completed_items: 1,
                total_items: 1,
                downloaded_bytes: 0,
                total_bytes: 0,
            },
        ),
        Err(error) => emit(
            &app,
            OperationProgress {
                message: error.message.clone(),
                operation_id: input.operation_id.clone(),
                status: if matches!(error.code, CommandErrorCode::Cancelled) {
                    OperationStatus::Cancelled
                } else {
                    OperationStatus::Failed
                },
                completed_items: 0,
                total_items: 1,
                downloaded_bytes: 0,
                total_bytes: 0,
            },
        ),
    }
    downloads::finish_operation(&input.operation_id).await;
    result
}

async fn run_install(
    app: &AppHandle,
    input: &InstallContentInput,
    replace: bool,
) -> Result<InstanceManifest, CommandError> {
    if downloads::is_cancelled(&input.operation_id).await {
        return Err(CommandError::new(
            CommandErrorCode::Cancelled,
            "Installation cancelled",
        ));
    }
    let root = instances::instances_root(app)?;
    let metadata = root.join(&input.instance_id);
    let mut manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    let content_root = validate_content_root(&metadata, &manifest)?;
    recover_at(&content_root, &mut manifest, &metadata)?;

    let already_installed = manifest
        .mods
        .iter()
        .any(|installed| installed.project_id == input.project_id);
    if already_installed != replace {
        return Err(CommandError::new(
            if replace {
                CommandErrorCode::NotFound
            } else {
                CommandErrorCode::Conflict
            },
            if replace {
                "Project is not installed in this instance"
            } else {
                "Project is already installed in this instance"
            },
        ));
    }

    emit(
        app,
        OperationProgress {
            message: "Resolving dependencies".into(),
            operation_id: input.operation_id.clone(),
            status: OperationStatus::Running,
            completed_items: 0,
            total_items: 1,
            downloaded_bytes: 0,
            total_bytes: 0,
        },
    );
    let plan = resolve_plan(app, &manifest, input, replace).await?;
    let total_bytes = plan.iter().map(|item| item.version.file_size).sum();
    let total_items = u32::try_from(plan.len()).unwrap_or(u32::MAX);
    let transaction = content_root
        .join(TRANSACTIONS_DIRECTORY)
        .join(&input.operation_id);
    let staging = app
        .path()
        .app_cache_dir()
        .map_err(|error| CommandError::new(CommandErrorCode::Io, error.to_string()))?
        .join("install-staging")
        .join(&input.operation_id);
    fs::create_dir_all(&staging).map_err(|error| {
        CommandError::io("Could not create the installation staging area", &error)
    })?;

    let mut prepared = Vec::new();
    let mut downloaded_bytes = 0_u64;
    for (index, item) in plan.iter().enumerate() {
        let context = ProgressContext {
            completed_items: index as u32,
            total_items,
            downloaded_bytes,
            total_bytes,
        };
        let archive = downloads::download(app, &input.operation_id, &item.version, context).await?;
        if downloads::is_cancelled(&input.operation_id).await {
            let _ = fs::remove_dir_all(&staging);
            return Err(CommandError::new(
                CommandErrorCode::Cancelled,
                "Installation cancelled",
            ));
        }
        prepare_artifact(
            item,
            &archive,
            &staging.join(index.to_string()),
            &mut prepared,
        )?;
        downloaded_bytes = downloaded_bytes.saturating_add(item.version.file_size);
    }
    let preserved_files = if replace {
        manifest
            .mods
            .iter()
            .find(|installed| installed.project_id == input.project_id)
            .map(|installed| {
                installed
                    .files
                    .iter()
                    .filter(|file| file.mutable)
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    if !preserved_files.is_empty() {
        let preserved_paths = preserved_files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<HashSet<_>>();
        prepared.retain(|file| !preserved_paths.contains(path_string(&file.relative).as_str()));
    }
    reject_duplicate_targets(&prepared)?;

    let mut transaction_files = prepared
        .iter()
        .map(|file| TransactionFile {
            relative: path_string(&file.relative),
            had_original: content_root.join(&file.relative).exists(),
        })
        .collect::<Vec<_>>();
    if replace {
        if let Some(installed) = manifest
            .mods
            .iter()
            .find(|installed| installed.project_id == input.project_id)
        {
            for file in &installed.files {
                let relative = path_string(&installed_file_path(installed, file));
                if !transaction_files
                    .iter()
                    .any(|candidate| candidate.relative == relative)
                    && content_root.join(&relative).exists()
                {
                    transaction_files.push(TransactionFile {
                        relative,
                        had_original: true,
                    });
                }
            }
        }
    }
    let journal = TransactionJournal {
        project_ids: plan.iter().map(|item| item.project.id.clone()).collect(),
        files: transaction_files,
    };
    create_safe_directories(&content_root, &transaction)?;
    write_journal(&transaction, &journal)?;
    if downloads::is_cancelled(&input.operation_id).await {
        let _ = fs::remove_dir_all(&transaction);
        let _ = fs::remove_dir_all(&staging);
        return Err(CommandError::new(
            CommandErrorCode::Cancelled,
            "Installation cancelled",
        ));
    }
    if let Err(error) = commit_files(&content_root, &transaction, &prepared).and_then(|_| {
        remove_transaction_extras(&content_root, &transaction, &journal, prepared.len())
    }) {
        let _ = rollback(&content_root, &transaction, &journal);
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    if replace {
        manifest
            .mods
            .retain(|installed| installed.project_id != input.project_id);
    }
    for item in plan {
        let is_target = item.project.id == input.project_id;
        let mut installed = installed_mod(item, &prepared);
        if is_target {
            installed.files.extend(preserved_files.clone());
        }
        manifest.mods.push(installed);
    }
    manifest.updated_at = chrono::Utc::now().to_rfc3339();
    manifest.last_operation_id = Some(input.operation_id.clone());
    if let Err(error) = instances::write_manifest(&metadata, &manifest) {
        let _ = rollback(&content_root, &transaction, &journal);
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&transaction);
    let _ = fs::remove_dir_all(&staging);
    Ok(manifest)
}

async fn resolve_plan(
    app: &AppHandle,
    instance: &InstanceManifest,
    input: &InstallContentInput,
    replace: bool,
) -> Result<Vec<PlanItem>, CommandError> {
    let optional = input
        .optional_dependencies
        .iter()
        .cloned()
        .collect::<HashSet<_>>();
    let mut queue = VecDeque::from([(input.project_id.clone(), input.version_id.clone())]);
    let loader_project = bepinex_project(instance);
    if let Some(loader_project) = loader_project {
        queue.push_back((loader_project.into(), None));
    }
    let installed = instance
        .mods
        .iter()
        .map(|item| item.project_id.as_str())
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    let mut plan = Vec::new();

    while let Some((project_id, version_hint)) = queue.pop_front() {
        let replacing_target = replace && project_id == input.project_id;
        if (installed.contains(project_id.as_str()) && !replacing_target)
            || !seen.insert(project_id.clone())
        {
            continue;
        }
        if seen.len() > 100 {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Dependency graph exceeds 100 projects",
            ));
        }
        let project = providers::resolve_project(app, &project_id).await?;
        validate_project(instance, &project)?;
        let versions = providers::resolve_versions(app, &project_id).await?;
        let mut version = select_version(instance, versions, version_hint.as_deref())?;
        providers::resolve_download_url(&project_id, &mut version).await?;
        if project_id == input.project_id {
            if let Some(loader_id) = loader_project.filter(|loader| *loader != project_id) {
                if !version
                    .dependencies
                    .iter()
                    .any(|dependency| dependency.project_id == loader_id)
                {
                    version.dependencies.push(providers::Dependency {
                        name: "BepInEx".into(),
                        project_id: loader_id.into(),
                        r#type: DependencyType::Required,
                        version_range: None,
                    });
                }
            }
        }
        for dependency in &version.dependencies {
            match dependency.r#type {
                DependencyType::Required => queue.push_back((
                    dependency.project_id.clone(),
                    dependency.version_range.clone(),
                )),
                DependencyType::Optional if optional.contains(&dependency.project_id) => queue
                    .push_back((
                        dependency.project_id.clone(),
                        dependency.version_range.clone(),
                    )),
                DependencyType::Incompatible
                    if installed.contains(dependency.project_id.as_str())
                        || seen.contains(&dependency.project_id) =>
                {
                    return Err(CommandError::new(
                        CommandErrorCode::Incompatible,
                        format!("{} conflicts with installed content", dependency.name),
                    ));
                }
                DependencyType::Optional | DependencyType::Incompatible => {}
            }
        }
        plan.push(PlanItem { project, version });
    }
    Ok(plan)
}

fn select_version(
    instance: &InstanceManifest,
    versions: Vec<ProjectVersion>,
    hint: Option<&str>,
) -> Result<ProjectVersion, CommandError> {
    versions
        .into_iter()
        .find(|version| {
            let selected = match hint {
                Some(hint) => version.id == hint || version.number == hint,
                None => true,
            };
            let game = version.game_versions.is_empty()
                || version.game_versions.contains(&instance.game_version);
            let loader = version.loaders.is_empty() || version.loaders.contains(&instance.loader);
            selected && game && loader
        })
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::Incompatible,
                "No downloadable version is compatible with this instance",
            )
        })
}

fn validate_project(instance: &InstanceManifest, project: &Project) -> Result<(), CommandError> {
    if project.game_id != instance.game_id {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "Project does not support this instance's game",
        ));
    }
    if !project.loaders.is_empty() && !project.loaders.contains(&instance.loader) {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "Project does not support this instance's loader",
        ));
    }
    if project.r#type == ProjectType::DataPack {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "Data packs require a world selection and cannot be installed yet",
        ));
    }
    Ok(())
}

fn prepare_artifact(
    item: &PlanItem,
    archive: &Path,
    staging: &Path,
    output: &mut Vec<PreparedFile>,
) -> Result<(), CommandError> {
    match item.project.provider.id {
        crate::catalog::ProviderId::Thunderstore => extract_thunderstore(
            (&item.project.id, &item.project.slug),
            archive,
            staging,
            output,
        ),
        crate::catalog::ProviderId::Modrinth | crate::catalog::ProviderId::CurseForge => {
            let directory = match item.project.r#type {
                ProjectType::Mod => "mods",
                ProjectType::ResourcePack => "resourcepacks",
                ProjectType::ShaderPack => "shaderpacks",
                ProjectType::DataPack => unreachable!(),
            };
            output.push(prepare_single(item, archive, staging, directory)?);
            Ok(())
        }
        crate::catalog::ProviderId::VintageStoryDb => {
            output.push(prepare_single(item, archive, staging, "Mods")?);
            Ok(())
        }
        crate::catalog::ProviderId::Local => Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Local content cannot be downloaded from a provider",
        )),
    }
}

fn prepare_single(
    item: &PlanItem,
    archive: &Path,
    staging: &Path,
    directory: &str,
) -> Result<PreparedFile, CommandError> {
    let file_name = safe_file_name(&item.version.file_name)?;
    fs::create_dir_all(staging).map_err(|error| {
        CommandError::io("Could not create the installation staging area", &error)
    })?;
    let source = staging.join(file_name);
    fs::copy(archive, &source)
        .map_err(|error| CommandError::io("Could not stage the downloaded file", &error))?;
    Ok(PreparedFile {
        project_id: item.project.id.clone(),
        relative: PathBuf::from(directory).join(file_name),
        sha512: downloads::sha512(&source)?,
        source,
    })
}

fn extract_thunderstore(
    project: (&str, &str),
    archive: &Path,
    staging: &Path,
    output: &mut Vec<PreparedFile>,
) -> Result<(), CommandError> {
    let file = fs::File::open(archive)
        .map_err(|error| CommandError::io("Could not open the package archive", &error))?;
    let mut archive = zip::ZipArchive::new(file).map_err(archive_error)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Package archive contains too many files",
        ));
    }
    let initial_files = output.len();
    let mut extracted_bytes = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(archive_error)?;
        if entry.is_dir() {
            continue;
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Package archive contains a symbolic link",
            ));
        }
        let enclosed = entry.enclosed_name().ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::InvalidInput,
                "Package archive contains an unsafe path",
            )
        })?;
        let relative = enclosed.strip_prefix(project.1).unwrap_or(&enclosed);
        if relative.as_os_str().is_empty()
            || relative
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(is_package_metadata)
                && relative.components().count() == 1
        {
            continue;
        }
        extracted_bytes = extracted_bytes.saturating_add(entry.size());
        if extracted_bytes > MAX_EXTRACTED_BYTES {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Package archive exceeds the 2 GB extraction limit",
            ));
        }
        let source = staging.join(relative);
        if let Some(parent) = source.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                CommandError::io("Could not create an extracted package directory", &error)
            })?;
        }
        let mut destination = fs::File::create(&source)
            .map_err(|error| CommandError::io("Could not extract a package file", &error))?;
        io::copy(&mut entry, &mut destination)
            .map_err(|error| CommandError::io("Could not extract a package file", &error))?;
        destination.flush().map_err(|error| {
            CommandError::io("Could not flush an extracted package file", &error)
        })?;
        output.push(PreparedFile {
            project_id: project.0.into(),
            relative: relative.to_path_buf(),
            sha512: downloads::sha512(&source)?,
            source,
        });
    }
    if output.len() == initial_files {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Package archive contains no installable files",
        ));
    }
    Ok(())
}

fn commit_files(
    root: &Path,
    transaction: &Path,
    files: &[PreparedFile],
) -> Result<(), CommandError> {
    let backups = transaction.join("backups");
    fs::create_dir_all(&backups)
        .map_err(|error| CommandError::io("Could not create the installation backup", &error))?;
    for (index, file) in files.iter().enumerate() {
        let destination = safe_destination(root, &file.relative)?;
        let parent = destination.parent().ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::InvalidInput,
                "Installed file has no directory",
            )
        })?;
        create_safe_directories(root, parent)?;
        if destination.is_dir() {
            return Err(CommandError::new(
                CommandErrorCode::Conflict,
                "An installation target is an existing directory",
            ));
        }
        if destination.exists() {
            fs::rename(&destination, backups.join(index.to_string())).map_err(|error| {
                CommandError::io("Could not back up an existing installed file", &error)
            })?;
        }
        let next = parent.join(format!(".modsync-{}-{index}.next", std::process::id()));
        if let Err(error) = fs::copy(&file.source, &next) {
            let _ = fs::remove_file(&next);
            return Err(CommandError::io("Could not copy an installed file", &error));
        }
        if let Err(error) = fs::rename(&next, &destination) {
            let _ = fs::remove_file(&next);
            return Err(CommandError::io(
                "Could not finalize an installed file",
                &error,
            ));
        }
    }
    Ok(())
}

fn remove_transaction_extras(
    root: &Path,
    transaction: &Path,
    journal: &TransactionJournal,
    start: usize,
) -> Result<(), CommandError> {
    for (index, file) in journal.files.iter().enumerate().skip(start) {
        let source = safe_destination(root, Path::new(&file.relative))?;
        fs::rename(&source, transaction.join("backups").join(index.to_string())).map_err(
            |error| CommandError::io("Could not replace an obsolete installed file", &error),
        )?;
    }
    Ok(())
}

fn rollback(root: &Path, transaction: &Path, journal: &TransactionJournal) -> io::Result<()> {
    let backups = transaction.join("backups");
    for (index, file) in journal.files.iter().enumerate().rev() {
        let destination = root.join(&file.relative);
        let backup = backups.join(index.to_string());
        if backup.exists() {
            let _ = fs::remove_file(&destination);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::rename(backup, destination)?;
        } else if !file.had_original {
            let _ = fs::remove_file(destination);
        }
    }
    fs::remove_dir_all(transaction)
}

fn unmanaged_at(
    root: &Path,
    manifest: &InstanceManifest,
) -> Result<Vec<UnmanagedContent>, CommandError> {
    let tracked = manifest
        .mods
        .iter()
        .flat_map(|installed| {
            installed
                .files
                .iter()
                .map(move |file| path_string(&installed_file_path(installed, file)))
        })
        .collect::<HashSet<_>>();
    let mut items = Vec::new();
    for (directory, project_type, extensions, recursive) in unmanaged_directories(manifest.game_id)
    {
        let base = root.join(directory);
        collect_unmanaged(
            &base,
            &mut UnmanagedScan {
                root,
                project_type,
                extensions,
                recursive,
                tracked: &tracked,
                output: &mut items,
            },
        )?;
    }
    items.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(items)
}

struct UnmanagedScan<'a> {
    root: &'a Path,
    project_type: ProjectType,
    extensions: &'a [&'a str],
    recursive: bool,
    tracked: &'a HashSet<String>,
    output: &'a mut Vec<UnmanagedContent>,
}

fn collect_unmanaged(directory: &Path, scan: &mut UnmanagedScan<'_>) -> Result<(), CommandError> {
    let Ok(entries) = fs::read_dir(directory) else {
        return Ok(());
    };
    for entry in entries {
        let entry =
            entry.map_err(|error| CommandError::io("Could not scan local content", &error))?;
        let file_type = entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect local content", &error))?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() && scan.recursive {
            collect_unmanaged(&entry.path(), scan)?;
        } else if file_type.is_file()
            && scan.extensions.iter().any(|extension| {
                entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case(extension))
            })
        {
            let entry_path = entry.path();
            let relative = entry_path.strip_prefix(scan.root).map_err(|_| {
                CommandError::new(
                    CommandErrorCode::InvalidInput,
                    "Local content escapes the instance",
                )
            })?;
            let path = path_string(relative);
            if !scan.tracked.contains(&path) {
                scan.output.push(UnmanagedContent {
                    name: entry
                        .path()
                        .file_stem()
                        .map_or_else(String::new, |value| value.to_string_lossy().into_owned()),
                    path,
                    r#type: scan.project_type,
                });
            }
        }
        if scan.output.len() > MAX_ARCHIVE_ENTRIES {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Instance contains too many unmanaged files",
            ));
        }
    }
    Ok(())
}

fn import_local_at(
    app: &AppHandle,
    input: ImportLocalContentInput,
) -> Result<InstanceManifest, CommandError> {
    instances::validate_id(&input.instance_id)?;
    if input.path.is_empty() || input.path.len() > 1_024 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Local content path is invalid",
        ));
    }
    let (metadata, mut manifest, root) = load_instance(app, &input.instance_id)?;
    let unmanaged = unmanaged_at(&root, &manifest)?;
    let candidate = unmanaged
        .into_iter()
        .find(|candidate| candidate.path == input.path)
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::NotFound,
                "Unmanaged content file not found",
            )
        })?;
    let path = safe_existing_file(&root, Path::new(&candidate.path))?.ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::NotFound,
            "Unmanaged content file not found",
        )
    })?;
    let sha512 = downloads::sha512(&path)?;
    let project_id = format!("local:{}", &sha512[..16]);
    if manifest
        .mods
        .iter()
        .any(|installed| installed.project_id == project_id)
    {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "This local file is already imported",
        ));
    }
    manifest.mods.push(InstalledMod {
        name: candidate.name,
        author: "Local file".into(),
        enabled: true,
        r#type: candidate.r#type,
        project_id,
        icon_color: "#8b8f98".into(),
        provider: crate::catalog::ProviderId::Local,
        status: UpdateStatus::UpToDate,
        installed_version: "local".into(),
        version_id: String::new(),
        files: vec![InstalledFile {
            path: candidate.path,
            mutable: false,
            sha512: Some(sha512),
        }],
        missing_dependency: None,
        latest_compatible_version: "local".into(),
        dependencies: Vec::new(),
        loaders: vec![manifest.loader],
        game_versions: vec![manifest.game_version.clone()],
    });
    manifest.updated_at = chrono::Utc::now().to_rfc3339();
    manifest.last_operation_id = Some(management_id());
    instances::write_manifest(&metadata, &manifest)?;
    Ok(manifest)
}

fn unmanaged_directories(
    game_id: GameId,
) -> Vec<(&'static str, ProjectType, &'static [&'static str], bool)> {
    match game_id {
        GameId::Minecraft => vec![
            ("mods", ProjectType::Mod, &["jar"], false),
            ("resourcepacks", ProjectType::ResourcePack, &["zip"], false),
            ("shaderpacks", ProjectType::ShaderPack, &["zip"], false),
        ],
        GameId::VintageStory => vec![("Mods", ProjectType::Mod, &["zip"], false)],
        GameId::Valheim | GameId::LethalCompany => {
            vec![("BepInEx/plugins", ProjectType::Mod, &["dll"], true)]
        }
    }
}

fn remove_at(
    app: &AppHandle,
    input: RemoveContentInput,
) -> Result<ContentMutationResult, CommandError> {
    instances::validate_id(&input.instance_id)?;
    if input.project_ids.is_empty()
        || input.project_ids.len() > 100
        || input
            .project_ids
            .iter()
            .any(|project_id| !valid_project_reference(project_id))
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Select between 1 and 100 installed projects",
        ));
    }
    let selected = input.project_ids.into_iter().collect::<HashSet<_>>();
    let (metadata, mut manifest, root) = load_instance(app, &input.instance_id)?;
    if bepinex_project(&manifest).is_some_and(|loader| selected.contains(loader)) {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "The instance loader cannot be removed",
        ));
    }
    for installed in &manifest.mods {
        if !selected.contains(&installed.project_id)
            && installed.enabled
            && installed
                .dependencies
                .iter()
                .any(|dependency| selected.contains(dependency))
        {
            return Err(CommandError::new(
                CommandErrorCode::Conflict,
                format!("{} still requires selected content", installed.name),
            ));
        }
    }
    let targets = manifest
        .mods
        .iter()
        .filter(|installed| selected.contains(&installed.project_id))
        .collect::<Vec<_>>();
    if targets.len() != selected.len() {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            "One or more installed projects were not found",
        ));
    }

    let operation_id = management_id();
    let transaction = root.join(TRANSACTIONS_DIRECTORY).join(&operation_id);
    create_safe_directories(&root, &transaction)?;
    let (files, warnings) = removal_files(&root, &targets)?;
    let journal = TransactionJournal {
        project_ids: selected.iter().cloned().collect(),
        files,
    };
    write_journal(&transaction, &journal)?;
    let backups = transaction.join("backups");
    fs::create_dir_all(&backups)
        .map_err(|error| CommandError::io("Could not create the removal backup", &error))?;
    for (index, file) in journal.files.iter().enumerate() {
        let source = root.join(&file.relative);
        if let Err(error) = fs::rename(&source, backups.join(index.to_string())) {
            let _ = rollback(&root, &transaction, &journal);
            return Err(CommandError::io(
                "Could not remove an installed file",
                &error,
            ));
        }
    }
    manifest
        .mods
        .retain(|installed| !selected.contains(&installed.project_id));
    manifest.updated_at = chrono::Utc::now().to_rfc3339();
    manifest.last_operation_id = Some(operation_id);
    if let Err(error) = instances::write_manifest(&metadata, &manifest) {
        let _ = rollback(&root, &transaction, &journal);
        return Err(error);
    }
    let _ = fs::remove_dir_all(transaction);
    Ok(ContentMutationResult {
        instance: manifest,
        warnings,
    })
}

fn removal_files(
    root: &Path,
    targets: &[&InstalledMod],
) -> Result<(Vec<TransactionFile>, Vec<String>), CommandError> {
    let mut files = Vec::new();
    let mut warnings = Vec::new();
    for installed in targets {
        for file in &installed.files {
            let relative = installed_file_path(installed, file);
            let Some(path) = safe_existing_file(root, &relative)? else {
                if !file.mutable {
                    warnings.push(format!("{} was already missing", file.path));
                }
                continue;
            };
            if file.mutable {
                warnings.push(format!(
                    "{} is configuration data and was preserved",
                    file.path
                ));
                continue;
            }
            if file
                .sha512
                .as_ref()
                .is_some_and(|expected| file_hash_mismatch(&path, expected))
            {
                warnings.push(format!("{} was modified and was preserved", file.path));
                continue;
            }
            files.push(TransactionFile {
                relative: path_string(&relative),
                had_original: true,
            });
        }
    }
    Ok((files, warnings))
}

fn set_enabled_at(
    app: &AppHandle,
    input: SetContentEnabledInput,
) -> Result<InstanceManifest, CommandError> {
    instances::validate_id(&input.instance_id)?;
    if !valid_project_reference(&input.project_id) {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Installed project identifier is invalid",
        ));
    }
    let (metadata, mut manifest, root) = load_instance(app, &input.instance_id)?;
    let index = manifest
        .mods
        .iter()
        .position(|installed| installed.project_id == input.project_id)
        .ok_or_else(|| {
            CommandError::new(CommandErrorCode::NotFound, "Installed project not found")
        })?;
    if manifest.mods[index].enabled == input.enabled {
        return Ok(manifest);
    }
    if !input.enabled && manifest.mods[index].project_id.contains(":BepInExPack") {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "The instance loader cannot be disabled",
        ));
    }
    if !input.enabled {
        if let Some(dependent) = manifest.mods.iter().find(|installed| {
            installed.enabled
                && installed
                    .dependencies
                    .contains(&manifest.mods[index].project_id)
        }) {
            return Err(CommandError::new(
                CommandErrorCode::Conflict,
                format!("{} requires this content", dependent.name),
            ));
        }
    }

    let moved = move_content_files(&root, &manifest.mods[index], input.enabled)?;
    manifest.mods[index].enabled = input.enabled;
    manifest.mods[index].status = if input.enabled {
        UpdateStatus::UpToDate
    } else {
        UpdateStatus::Disabled
    };
    manifest.updated_at = chrono::Utc::now().to_rfc3339();
    manifest.last_operation_id = Some(management_id());
    if let Err(error) = instances::write_manifest(&metadata, &manifest) {
        rollback_moves(&moved);
        return Err(error);
    }
    reconcile_at(&root, &mut manifest);
    instances::write_manifest(&metadata, &manifest)?;
    Ok(manifest)
}

fn move_content_files(
    root: &Path,
    installed: &InstalledMod,
    enabled: bool,
) -> Result<Vec<(PathBuf, PathBuf)>, CommandError> {
    let mut moved = Vec::new();
    for file in &installed.files {
        if !toggle_file(installed, file) {
            continue;
        }
        let base = safe_destination(root, Path::new(&file.path))?;
        let disabled = disabled_path(&base);
        let (source, destination) = if enabled {
            (&disabled, &base)
        } else {
            (&base, &disabled)
        };
        if !source.is_file() || destination.exists() {
            rollback_moves(&moved);
            return Err(CommandError::new(
                CommandErrorCode::Conflict,
                "Content files do not match the expected enabled state",
            ));
        }
        if let Err(error) = fs::rename(source, destination) {
            rollback_moves(&moved);
            return Err(CommandError::io(
                "Could not change the content state",
                &error,
            ));
        }
        moved.push((destination.to_path_buf(), source.to_path_buf()));
    }
    Ok(moved)
}

fn rollback_moves(moved: &[(PathBuf, PathBuf)]) {
    for (source, destination) in moved.iter().rev() {
        let _ = fs::rename(source, destination);
    }
}

pub(crate) fn reconcile_instance(
    metadata: &Path,
    manifest: &mut InstanceManifest,
) -> Result<(), CommandError> {
    let root = validate_content_root(metadata, manifest)?;
    let before = manifest.mods.clone();
    reconcile_at(&root, manifest);
    if manifest.mods != before {
        manifest.updated_at = chrono::Utc::now().to_rfc3339();
        instances::write_manifest(metadata, manifest)?;
    }
    Ok(())
}

fn reconcile_at(root: &Path, manifest: &mut InstanceManifest) {
    let enabled = manifest
        .mods
        .iter()
        .filter(|installed| installed.enabled)
        .map(|installed| installed.project_id.clone())
        .collect::<HashSet<_>>();
    for installed in &mut manifest.mods {
        let damaged = installed.files.iter().any(|file| {
            if file.mutable {
                return false;
            }
            let relative = installed_file_path(installed, file);
            match safe_existing_file(root, &relative) {
                Ok(Some(path)) => file
                    .sha512
                    .as_ref()
                    .is_some_and(|expected| file_hash_mismatch(&path, expected)),
                Ok(None) | Err(_) => true,
            }
        });
        let missing = installed
            .dependencies
            .iter()
            .find(|dependency| !enabled.contains(*dependency));
        let incompatible = (!installed.game_versions.is_empty()
            && !installed.game_versions.contains(&manifest.game_version))
            || (!installed.loaders.is_empty() && !installed.loaders.contains(&manifest.loader));
        installed.missing_dependency = missing.cloned();
        installed.status = if damaged {
            UpdateStatus::Damaged
        } else if missing.is_some() {
            UpdateStatus::DependencyMissing
        } else if incompatible {
            UpdateStatus::Incompatible
        } else if !installed.enabled {
            UpdateStatus::Disabled
        } else {
            UpdateStatus::UpToDate
        };
    }
}

fn load_instance(
    app: &AppHandle,
    instance_id: &str,
) -> Result<(PathBuf, InstanceManifest, PathBuf), CommandError> {
    let metadata = instances::instances_root(app)?.join(instance_id);
    let mut manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    let root = validate_content_root(&metadata, &manifest)?;
    recover_at(&root, &mut manifest, &metadata)?;
    Ok((metadata, manifest, root))
}

fn safe_existing_file(root: &Path, relative: &Path) -> Result<Option<PathBuf>, CommandError> {
    let path = safe_destination(root, relative)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(CommandError::new(
                    CommandErrorCode::InvalidInput,
                    "Installed file path crosses a symbolic link",
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(CommandError::io(
                    "Could not inspect an installed file",
                    &error,
                ));
            }
        }
    }
    Ok(path.is_file().then_some(path))
}

fn is_mutable_path(path: &Path) -> bool {
    let value = path_string(path).to_ascii_lowercase();
    value.contains("/config/")
        || value.starts_with("config/")
        || [".cfg", ".toml", ".yaml", ".yml", ".properties"]
            .iter()
            .any(|extension| value.ends_with(extension))
}

fn file_hash_mismatch(path: &Path, expected: &str) -> bool {
    downloads::sha512(path).map_or(true, |actual| !actual.eq_ignore_ascii_case(expected))
}

fn installed_file_path(installed: &InstalledMod, file: &InstalledFile) -> PathBuf {
    let path = PathBuf::from(&file.path);
    if installed.enabled || !toggle_file(installed, file) {
        path
    } else {
        disabled_path(&path)
    }
}

fn toggle_file(installed: &InstalledMod, file: &InstalledFile) -> bool {
    if installed.provider != crate::catalog::ProviderId::Thunderstore {
        return true;
    }
    let path = path_string(Path::new(&file.path));
    !file.mutable && (path.starts_with("BepInEx/plugins/") || path.starts_with("BepInEx/patchers/"))
}

fn disabled_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".disabled");
    value.into()
}

fn valid_project_reference(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':')
        })
}

fn mutation_lock() -> &'static tokio::sync::Mutex<()> {
    static LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

fn management_id() -> String {
    format!("manage-{}", chrono::Utc::now().timestamp_millis())
}

pub(crate) fn recover_instance(
    metadata: &Path,
    manifest: &mut InstanceManifest,
) -> Result<(), CommandError> {
    let root = validate_content_root(metadata, manifest)?;
    recover_at(&root, manifest, metadata)
}

fn recover_at(
    root: &Path,
    manifest: &mut InstanceManifest,
    metadata: &Path,
) -> Result<(), CommandError> {
    let transactions = root.join(TRANSACTIONS_DIRECTORY);
    let Ok(entries) = fs::read_dir(&transactions) else {
        return Ok(());
    };
    for entry in entries {
        let entry = entry.map_err(|error| {
            CommandError::io("Could not inspect an interrupted installation", &error)
        })?;
        if !entry
            .file_type()
            .map_err(|error| {
                CommandError::io("Could not inspect an interrupted installation", &error)
            })?
            .is_dir()
        {
            continue;
        }
        let journal_path = entry.path().join("journal.json");
        let contents = fs::read(&journal_path).map_err(|error| {
            CommandError::io("Could not read an interrupted installation", &error)
        })?;
        let journal: TransactionJournal =
            serde_json::from_slice(&contents).map_err(|error| CommandError {
                code: CommandErrorCode::CorruptedData,
                message: "Installation recovery data is corrupted".into(),
                retryable: false,
                details: Some(error.to_string()),
            })?;
        let operation_id = entry.file_name();
        let committed = manifest.last_operation_id.as_deref() == operation_id.to_str();
        if committed {
            fs::remove_dir_all(entry.path()).map_err(|error| {
                CommandError::io("Could not finalize an interrupted installation", &error)
            })?;
        } else {
            rollback(root, &entry.path(), &journal).map_err(|error| {
                CommandError::io("Could not roll back an interrupted installation", &error)
            })?;
            *manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
        }
    }
    Ok(())
}

fn installed_mod(item: PlanItem, files: &[PreparedFile]) -> InstalledMod {
    let file_paths = files
        .iter()
        .filter(|file| file.project_id == item.project.id)
        .map(|file| InstalledFile {
            path: path_string(&file.relative),
            mutable: is_mutable_path(&file.relative),
            sha512: Some(file.sha512.clone()),
        })
        .collect();
    InstalledMod {
        name: item.project.name,
        author: item.project.author,
        enabled: true,
        r#type: item.project.r#type,
        project_id: item.project.id,
        icon_color: item.project.icon_color,
        provider: item.project.provider.id,
        status: UpdateStatus::UpToDate,
        installed_version: item.version.number.clone(),
        version_id: item.version.id,
        files: file_paths,
        missing_dependency: None,
        latest_compatible_version: item.version.number,
        dependencies: item
            .version
            .dependencies
            .into_iter()
            .filter(|dependency| matches!(dependency.r#type, DependencyType::Required))
            .map(|dependency| dependency.project_id)
            .collect(),
        loaders: item.version.loaders,
        game_versions: item.version.game_versions,
    }
}

fn validate_content_root(
    metadata: &Path,
    manifest: &InstanceManifest,
) -> Result<PathBuf, CommandError> {
    let root = fs::canonicalize(&manifest.location.path)
        .map_err(|error| CommandError::io("Could not open the instance directory", &error))?;
    if manifest.location.kind == InstanceLocationKind::Managed {
        let expected = fs::canonicalize(metadata.join("content")).map_err(|error| {
            CommandError::io("Could not validate the managed instance directory", &error)
        })?;
        if root != expected {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Managed instance path does not match its metadata",
            ));
        }
    }
    Ok(root)
}

fn safe_destination(root: &Path, relative: &Path) -> Result<PathBuf, CommandError> {
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Installed file path is unsafe",
        ));
    }
    Ok(root.join(relative))
}

fn create_safe_directories(root: &Path, parent: &Path) -> Result<(), CommandError> {
    let relative = parent.strip_prefix(root).map_err(|_| {
        CommandError::new(
            CommandErrorCode::InvalidInput,
            "Installed file escapes the instance",
        )
    })?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(CommandError::new(
                    CommandErrorCode::InvalidInput,
                    "Installed file path crosses a link or non-directory",
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(&current).map_err(|error| {
                    CommandError::io("Could not create an installation directory", &error)
                })?;
            }
            Err(error) => {
                return Err(CommandError::io(
                    "Could not inspect an installation directory",
                    &error,
                ));
            }
        }
    }
    Ok(())
}

fn reject_duplicate_targets(files: &[PreparedFile]) -> Result<(), CommandError> {
    let mut paths = HashSet::new();
    if files.iter().any(|file| !paths.insert(&file.relative)) {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "Installation contains conflicting file paths",
        ));
    }
    Ok(())
}

fn safe_file_name(value: &str) -> Result<&str, CommandError> {
    let path = Path::new(value);
    if value.is_empty()
        || value.len() > 255
        || path.file_name().and_then(|name| name.to_str()) != Some(value)
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Provider supplied an unsafe file name",
        ));
    }
    Ok(value)
}

fn is_package_metadata(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "manifest.json" | "icon.png" | "readme.md" | "changelog.md"
    )
}

fn write_journal(transaction: &Path, journal: &TransactionJournal) -> Result<(), CommandError> {
    let contents = serde_json::to_vec_pretty(journal).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize installation recovery data".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    atomic_write(&transaction.join("journal.json"), &contents)
        .map_err(|error| CommandError::io("Could not save installation recovery data", &error))
}

fn archive_error(error: zip::result::ZipError) -> CommandError {
    CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Package archive is malformed".into(),
        retryable: false,
        details: Some(error.to_string()),
    }
}

fn bepinex_project(instance: &InstanceManifest) -> Option<&'static str> {
    match (instance.game_id, instance.loader) {
        (GameId::Valheim, LoaderId::BepInEx) => {
            Some("thunderstore:valheim:denikson:BepInExPack_Valheim")
        }
        (GameId::LethalCompany, LoaderId::BepInEx) => {
            Some("thunderstore:lethal-company:BepInEx:BepInExPack")
        }
        _ => None,
    }
}

fn validate_input(input: &InstallContentInput) -> Result<(), CommandError> {
    instances::validate_id(&input.instance_id)?;
    if input.operation_id.is_empty()
        || input.operation_id.len() > 100
        || !input
            .operation_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        || input.optional_dependencies.len() > 100
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Installation request is invalid",
        ));
    }
    Ok(())
}

fn path_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn emit(app: &AppHandle, progress: OperationProgress) {
    let _ = app.emit("operation-progress", progress);
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
        std::env::temp_dir().join(format!("modsync-content-{name}-{nonce}"))
    }

    fn manifest(root: &Path, mods: Vec<InstalledMod>) -> InstanceManifest {
        InstanceManifest {
            schema_version: crate::contracts::MANIFEST_SCHEMA_VERSION,
            id: "instance".into(),
            name: "Test".into(),
            icon: "box".into(),
            icon_color: "#000000".into(),
            description: String::new(),
            game_id: GameId::Minecraft,
            game_version: "1.21.4".into(),
            loader: LoaderId::Fabric,
            loader_version: "latest".into(),
            memory_mb: 4096,
            java_args: None,
            location: crate::contracts::InstanceLocation {
                path: root.to_string_lossy().into_owned(),
                kind: InstanceLocationKind::Managed,
            },
            created_at: String::new(),
            updated_at: String::new(),
            last_played: None,
            playtime_minutes: 0,
            mods,
            last_operation_id: None,
        }
    }

    fn installed(project_id: &str) -> InstalledMod {
        InstalledMod {
            name: project_id.into(),
            author: "Author".into(),
            enabled: true,
            r#type: ProjectType::Mod,
            project_id: project_id.into(),
            icon_color: "#000000".into(),
            provider: crate::catalog::ProviderId::Modrinth,
            status: UpdateStatus::UpToDate,
            installed_version: "1.0".into(),
            version_id: "version".into(),
            files: Vec::new(),
            missing_dependency: None,
            latest_compatible_version: "1.0".into(),
            dependencies: Vec::new(),
            loaders: vec![LoaderId::Fabric],
            game_versions: vec!["1.21.4".into()],
        }
    }

    #[test]
    fn reconciliation_reports_missing_dependencies() {
        let root = test_root("missing-dependency");
        fs::create_dir_all(&root).unwrap();
        let mut item = installed("modrinth:main");
        item.dependencies.push("modrinth:missing".into());
        let mut manifest = manifest(&root, vec![item]);

        reconcile_at(&root, &mut manifest);

        assert_eq!(manifest.mods[0].status, UpdateStatus::DependencyMissing);
        assert_eq!(
            manifest.mods[0].missing_dependency.as_deref(),
            Some("modrinth:missing")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unmanaged_scan_excludes_tracked_files() {
        let root = test_root("unmanaged");
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(root.join("mods/local.jar"), "mod").unwrap();
        let mut state = manifest(&root, Vec::new());
        assert_eq!(unmanaged_at(&root, &state).unwrap().len(), 1);
        let mut item = installed("local:test");
        item.files.push(InstalledFile {
            path: "mods/local.jar".into(),
            mutable: false,
            sha512: None,
        });
        state.mods.push(item);

        assert!(unmanaged_at(&root, &state).unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn archive_paths_cannot_escape_staging() {
        let root = test_root("archive");
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("bad.zip");
        let file = fs::File::create(&archive_path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        archive
            .start_file("../outside.dll", zip::write::SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"bad").unwrap();
        archive.finish().unwrap();

        let error = extract_thunderstore(
            ("thunderstore:test", "test"),
            &archive_path,
            &root.join("staging"),
            &mut Vec::new(),
        )
        .unwrap_err();
        assert!(matches!(error.code, CommandErrorCode::InvalidInput));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn thunderstore_package_root_is_removed_before_installation() {
        let root = test_root("package-root");
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("package.zip");
        let file = fs::File::create(&archive_path).unwrap();
        let mut archive = zip::ZipWriter::new(file);
        archive
            .start_file(
                "TestPackage/BepInEx/plugins/mod.dll",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        archive.write_all(b"mod").unwrap();
        archive.finish().unwrap();
        let mut files = Vec::new();

        extract_thunderstore(
            ("thunderstore:test", "TestPackage"),
            &archive_path,
            &root.join("staging"),
            &mut files,
        )
        .unwrap();

        assert_eq!(files[0].relative, PathBuf::from("BepInEx/plugins/mod.dll"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn content_files_are_renamed_when_disabled_and_enabled() {
        let root = test_root("toggle");
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(root.join("mods/test.jar"), "mod").unwrap();
        let mut item = installed("modrinth:test");
        item.files.push(InstalledFile {
            path: "mods/test.jar".into(),
            mutable: false,
            sha512: None,
        });

        move_content_files(&root, &item, false).unwrap();
        assert!(root.join("mods/test.jar.disabled").is_file());
        move_content_files(&root, &item, true).unwrap();
        assert!(root.join("mods/test.jar").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn removal_preserves_modified_files() {
        let root = test_root("modified-removal");
        fs::create_dir_all(root.join("mods")).unwrap();
        fs::write(root.join("mods/test.jar"), "changed").unwrap();
        let mut item = installed("modrinth:test");
        item.files.push(InstalledFile {
            path: "mods/test.jar".into(),
            mutable: false,
            sha512: Some("original-hash".into()),
        });

        let (files, warnings) = removal_files(&root, &[&item]).unwrap();

        assert!(files.is_empty());
        assert_eq!(
            warnings,
            vec!["mods/test.jar was modified and was preserved"]
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn commit_files_installs_staged_content_under_the_instance_root() {
        let root = test_root("commit");
        let transaction = root.join(TRANSACTIONS_DIRECTORY).join("operation");
        let staged = test_root("staged");
        fs::create_dir_all(&root).unwrap();
        fs::write(&staged, "content").unwrap();
        let files = [PreparedFile {
            project_id: "modrinth:test".into(),
            relative: PathBuf::from("mods/test.jar"),
            source: staged.clone(),
            sha512: "hash".into(),
        }];

        commit_files(&root, &transaction, &files).unwrap();

        assert_eq!(
            fs::read_to_string(root.join("mods/test.jar")).unwrap(),
            "content"
        );
        fs::remove_file(staged).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rollback_restores_replaced_files_and_removes_new_files() {
        let root = test_root("rollback");
        let transaction = root.join(TRANSACTIONS_DIRECTORY).join("operation");
        fs::create_dir_all(transaction.join("backups")).unwrap();
        fs::write(root.join("existing.txt"), "new").unwrap();
        fs::write(transaction.join("backups/0"), "old").unwrap();
        fs::write(root.join("added.txt"), "added").unwrap();
        let journal = TransactionJournal {
            project_ids: vec!["project".into()],
            files: vec![
                TransactionFile {
                    relative: "existing.txt".into(),
                    had_original: true,
                },
                TransactionFile {
                    relative: "added.txt".into(),
                    had_original: false,
                },
            ],
        };

        rollback(&root, &transaction, &journal).unwrap();

        assert_eq!(
            fs::read_to_string(root.join("existing.txt")).unwrap(),
            "old"
        );
        assert!(!root.join("added.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
