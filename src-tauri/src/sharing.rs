use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;
use std::sync::{Arc, OnceLock};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use iroh::endpoint::{Connection, RecvStream, SendStream};
use iroh::key::SecretKey;
use iroh::{Endpoint, NodeId};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{OnceCell, RwLock};

use crate::catalog::{GameId, ProviderId};
use crate::contracts::{
    CommandError, CommandErrorCode, InstanceLocationKind, InstanceManifest, InstanceOwnership,
    OperationProgress, OperationStatus, RemoteInstance,
};
use crate::{content, downloads, instances, persistence::atomic_write};

const ALPN: &[u8] = b"modsync/share/1";
const PROTOCOL_VERSION: u32 = 1;
const MAX_REQUEST_BYTES: usize = 16 * 1024;
const MAX_MANIFEST_BYTES: usize = 16 * 1024 * 1024;
const MAX_SHARED_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_SHARED_FILES: usize = 20_000;
const MAX_TOTAL_SHARED_BYTES: u64 = 32 * 1024 * 1024 * 1024;
const REMOTE_FILE: &str = "remote.json";
const SYNC_INCOMPLETE_FILE: &str = ".sync-incomplete";
const SYNC_PUBLISH_FILE: &str = ".sync-publish";
const SYNC_BACKUP_MANIFEST: &str = ".sync-manifest-backup";

static ENDPOINT: OnceCell<Endpoint> = OnceCell::const_new();
static ACCEPT_STARTED: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
struct OwnerSession {
    app: AppHandle,
    instance_id: String,
    access_secret: String,
    code: String,
    snapshot: Arc<std::sync::RwLock<Option<SyncManifest>>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareCode {
    version: u32,
    peer_id: String,
    instance_id: String,
    access_secret: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteLink {
    version: u32,
    peer_id: String,
    instance_id: String,
    access_secret: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SharedFile {
    path: String,
    sha512: String,
    size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncManifest {
    version: u32,
    revision: String,
    instance: InstanceManifest,
    files: Vec<SharedFile>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum WireRequest {
    Manifest {
        secret: String,
        instance_id: String,
    },
    File {
        path: String,
        secret: String,
        revision: String,
        instance_id: String,
    },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireResponse {
    ok: bool,
    size: u64,
    error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharingStatus {
    pub active: bool,
    pub instance_id: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinInstanceInput {
    pub code: String,
    pub operation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInstanceInput {
    pub instance_id: String,
    pub operation_id: String,
}

struct OwnerClient {
    connection: Connection,
    link: RemoteLink,
}

struct SyncContext<'a> {
    app: &'a AppHandle,
    client: &'a OwnerClient,
    operation_id: &'a str,
}

struct ProgressUpdate<'a> {
    message: &'a str,
    operation_id: &'a str,
    status: OperationStatus,
    completed_items: u32,
    total_items: u32,
}

#[tauri::command]
pub async fn start_sharing(
    app: AppHandle,
    instance_id: String,
) -> Result<SharingStatus, CommandError> {
    instances::validate_id(&instance_id)?;
    let root = instances::instances_root(&app)?;
    let metadata = instances::metadata_directory(&root, &instance_id)?;
    let manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    instances::ensure_owned(&manifest)?;
    if manifest.game_id != GameId::Valheim {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "Friend sharing currently supports Valheim only",
        ));
    }
    let endpoint = endpoint(&app).await?;
    let mut session = owner_session().write().await;
    if let Some(active) = session.as_ref() {
        if active.instance_id == instance_id {
            return Ok(status_for(Some(active)));
        }
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "Stop the active sharing session before sharing another instance",
        ));
    }
    let access_secret = hex(&SecretKey::generate().to_bytes());
    let payload = ShareCode {
        version: PROTOCOL_VERSION,
        peer_id: endpoint.node_id().to_string(),
        instance_id: instance_id.clone(),
        access_secret: access_secret.clone(),
    };
    let encoded = serde_json::to_vec(&payload).map_err(serialization_error)?;
    let code = URL_SAFE_NO_PAD.encode(encoded);
    *session = Some(OwnerSession {
        app,
        code: code.clone(),
        instance_id: instance_id.clone(),
        access_secret,
        snapshot: Arc::new(std::sync::RwLock::new(None)),
    });
    Ok(SharingStatus {
        active: true,
        code: Some(code),
        instance_id: Some(instance_id),
    })
}

#[tauri::command]
pub async fn stop_sharing(instance_id: String) -> Result<(), CommandError> {
    instances::validate_id(&instance_id)?;
    let mut session = owner_session().write().await;
    if session
        .as_ref()
        .is_some_and(|active| active.instance_id != instance_id)
    {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "A different instance is being shared",
        ));
    }
    *session = None;
    Ok(())
}

#[tauri::command]
pub async fn get_sharing_status() -> SharingStatus {
    let session = owner_session().read().await;
    status_for(session.as_ref())
}

#[tauri::command]
pub async fn join_shared_instance(
    app: AppHandle,
    input: JoinInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    downloads::register_operation(&input.operation_id).await?;
    emit_progress(
        &app,
        ProgressUpdate {
            message: "Connecting to owner",
            operation_id: &input.operation_id,
            status: OperationStatus::Pending,
            completed_items: 0,
            total_items: 1,
        },
    );
    let result = join_inner(&app, &input).await;
    finish_progress(&app, &input.operation_id, &result);
    downloads::finish_operation(&input.operation_id).await;
    result
}

#[tauri::command]
pub async fn sync_joined_instance(
    app: AppHandle,
    input: SyncInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    downloads::register_operation(&input.operation_id).await?;
    emit_progress(
        &app,
        ProgressUpdate {
            message: "Connecting to owner",
            operation_id: &input.operation_id,
            status: OperationStatus::Pending,
            completed_items: 0,
            total_items: 1,
        },
    );
    let result = sync_inner(&app, &input).await;
    finish_progress(&app, &input.operation_id, &result);
    downloads::finish_operation(&input.operation_id).await;
    result
}

pub(crate) async fn sync_before_launch(app: &AppHandle, instance_id: &str) {
    let Ok(root) = instances::instances_root(app) else {
        return;
    };
    let Ok(metadata) = instances::metadata_directory(&root, instance_id) else {
        return;
    };
    let Ok(manifest) = instances::read_manifest(&metadata.join("manifest.json")) else {
        return;
    };
    if manifest.ownership != InstanceOwnership::Joined {
        return;
    }
    let operation_id = format!("sync-play-{}", chrono::Utc::now().timestamp_millis());
    let _ = sync_joined_instance(
        app.clone(),
        SyncInstanceInput {
            instance_id: instance_id.into(),
            operation_id,
        },
    )
    .await;
}

async fn join_inner(
    app: &AppHandle,
    input: &JoinInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    let link = decode_share_code(&input.code)?;
    if instances::list_instances(app.clone())
        .await?
        .iter()
        .any(|instance| {
            instance.remote.as_ref().is_some_and(|remote| {
                remote.peer_id == link.peer_id && remote.instance_id == link.instance_id
            })
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "This shared instance has already been joined",
        ));
    }
    let client = OwnerClient::connect(app, link).await?;
    let remote = client.manifest().await?;
    validate_remote_manifest(&remote, &client.link)?;
    let created = create_sync_candidate(app, &remote.instance)?;
    let created_id = created.id.clone();
    let result = synchronize_into(
        SyncContext {
            app,
            client: &client,
            operation_id: &input.operation_id,
        },
        remote,
        created,
    )
    .await;
    match result {
        Ok(manifest) => {
            let root = instances::instances_root(app)?;
            let metadata = instances::metadata_directory(&root, &manifest.id)?;
            if let Err(error) = fs::remove_file(metadata.join(SYNC_INCOMPLETE_FILE)) {
                let _ = instances::delete_instance(app.clone(), created_id);
                return Err(CommandError::io(
                    "Could not finalize synchronization",
                    &error,
                ));
            }
            Ok(manifest)
        }
        Err(error) => {
            let _ = instances::delete_instance(app.clone(), created_id);
            Err(error)
        }
    }
}

async fn sync_inner(
    app: &AppHandle,
    input: &SyncInstanceInput,
) -> Result<InstanceManifest, CommandError> {
    instances::validate_id(&input.instance_id)?;
    let root = instances::instances_root(app)?;
    let metadata = instances::metadata_directory(&root, &input.instance_id)?;
    let current = instances::read_manifest(&metadata.join("manifest.json"))?;
    if current.ownership != InstanceOwnership::Joined {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "Only joined instances synchronize from an owner",
        ));
    }
    let link = read_remote_link(&metadata)?;
    if link.version != PROTOCOL_VERSION
        || current.remote.as_ref().map_or(true, |remote| {
            remote.peer_id != link.peer_id || remote.instance_id != link.instance_id
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Remote instance link does not match its manifest",
        ));
    }
    let client = OwnerClient::connect(app, link).await?;
    let remote = client.manifest().await?;
    validate_remote_manifest(&remote, &client.link)?;
    if current
        .remote
        .as_ref()
        .is_some_and(|state| state.revision == remote.revision)
    {
        return Ok(current);
    }
    let staging = create_sync_candidate(app, &remote.instance)?;
    let staging_id = staging.id.clone();
    let staged = synchronize_into(
        SyncContext {
            app,
            client: &client,
            operation_id: &input.operation_id,
        },
        remote,
        staging,
    )
    .await;
    let staged = match staged {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = instances::delete_instance(app.clone(), staging_id);
            return Err(error);
        }
    };
    let result = replace_joined(app, &current, &staged, &client.link);
    if result.is_err() {
        let _ = instances::delete_instance(app.clone(), staging_id);
    }
    result
}

async fn synchronize_into(
    context: SyncContext<'_>,
    remote: SyncManifest,
    mut local: InstanceManifest,
) -> Result<InstanceManifest, CommandError> {
    let SyncContext {
        app,
        client,
        operation_id,
    } = context;
    let root = PathBuf::from(&local.location.path);
    let metadata = instances::metadata_directory(&instances::instances_root(app)?, &local.id)?;
    let total = remote
        .instance
        .mods
        .len()
        .saturating_add(remote.files.len()) as u32;
    let mut completed = 0_u32;
    let mut mods = remote.instance.mods.clone();
    mods.sort_by_key(|item| !item.project_id.contains(":BepInExPack"));
    for desired in &mods {
        check_cancelled(operation_id).await?;
        let message = format!("Downloading {} from Thunderstore", desired.name);
        emit_progress(
            app,
            ProgressUpdate {
                message: &message,
                operation_id,
                status: OperationStatus::Running,
                completed_items: completed,
                total_items: total,
            },
        );
        if desired.provider == ProviderId::Thunderstore {
            let _ = content::install_synced_content(app, &local.id, operation_id, desired).await;
        }
        completed = completed.saturating_add(1);
    }
    for shared in &remote.files {
        check_cancelled(operation_id).await?;
        let target = safe_target(&root, &shared.path)?;
        let valid = target.is_file()
            && downloads::sha512(&target)
                .is_ok_and(|hash| hash.eq_ignore_ascii_case(&shared.sha512));
        if !valid {
            let message = format!("Downloading {} from owner", shared.path);
            emit_progress(
                app,
                ProgressUpdate {
                    message: &message,
                    operation_id,
                    status: OperationStatus::Running,
                    completed_items: completed,
                    total_items: total,
                },
            );
            client
                .download_file(shared, &target, &remote.revision, operation_id)
                .await?;
        }
        completed = completed.saturating_add(1);
    }
    prune_unlisted(&root, &remote.files)?;
    let confirmed = client.manifest().await?;
    if confirmed.revision != remote.revision {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "The owner changed the instance during synchronization. Try again.",
        ));
    }
    let timestamp = chrono::Utc::now().to_rfc3339();
    let local_id = local.id.clone();
    let local_location = local.location.clone();
    let local_created_at = local.created_at.clone();
    local = remote.instance;
    local.id = local_id;
    local.location = local_location;
    local.created_at = local_created_at;
    local.updated_at = timestamp.clone();
    local.last_played = None;
    local.playtime_minutes = 0;
    local.schema_version = crate::contracts::MANIFEST_SCHEMA_VERSION;
    local.ownership = InstanceOwnership::Joined;
    local.remote = Some(RemoteInstance {
        peer_id: client.link.peer_id.clone(),
        instance_id: client.link.instance_id.clone(),
        revision: remote.revision,
        last_synced_at: timestamp,
    });
    local.last_operation_id = Some(operation_id.into());
    instances::write_manifest(&metadata, &local)?;
    write_remote_link(&metadata, &client.link)?;
    Ok(local)
}

fn replace_joined(
    app: &AppHandle,
    current: &InstanceManifest,
    staged: &InstanceManifest,
    link: &RemoteLink,
) -> Result<InstanceManifest, CommandError> {
    let root = instances::instances_root(app)?;
    let current_metadata = instances::metadata_directory(&root, &current.id)?;
    let staged_metadata = instances::metadata_directory(&root, &staged.id)?;
    let current_content = PathBuf::from(&current.location.path);
    let staged_content = PathBuf::from(&staged.location.path);
    let backup = current_metadata.join(".sync-backup");
    let marker = current_metadata.join(SYNC_PUBLISH_FILE);
    let backup_manifest = current_metadata.join(SYNC_BACKUP_MANIFEST);
    if backup.exists() {
        fs::remove_dir_all(&backup).map_err(|error| {
            CommandError::io("Could not clear synchronization recovery data", &error)
        })?;
    }
    fs::copy(current_metadata.join("manifest.json"), &backup_manifest)
        .map_err(|error| CommandError::io("Could not back up the instance manifest", &error))?;
    if let Err(error) = fs::write(&marker, []) {
        let _ = fs::remove_file(&backup_manifest);
        return Err(CommandError::io(
            "Could not create synchronization recovery data",
            &error,
        ));
    }
    fs::rename(&current_content, &backup)
        .map_err(|error| CommandError::io("Could not stage the previous instance", &error))?;
    if let Err(error) = fs::rename(&staged_content, &current_content) {
        let _ = fs::rename(&backup, &current_content);
        let _ = fs::remove_file(&marker);
        let _ = fs::remove_file(&backup_manifest);
        return Err(CommandError::io(
            "Could not publish the synchronized instance",
            &error,
        ));
    }
    let mut next = staged.clone();
    next.id = current.id.clone();
    next.location = current.location.clone();
    next.created_at = current.created_at.clone();
    next.last_played = current.last_played.clone();
    next.playtime_minutes = current.playtime_minutes;
    if let Err(error) = instances::write_manifest(&current_metadata, &next)
        .and_then(|_| write_remote_link(&current_metadata, link))
    {
        let _ = fs::remove_dir_all(&current_content);
        let _ = fs::rename(&backup, &current_content);
        let _ = fs::copy(&backup_manifest, current_metadata.join("manifest.json"));
        let _ = fs::remove_file(&marker);
        let _ = fs::remove_file(&backup_manifest);
        return Err(error);
    }
    if let Err(error) = fs::remove_file(&marker) {
        let _ = fs::remove_dir_all(&current_content);
        let _ = fs::rename(&backup, &current_content);
        let _ = fs::copy(&backup_manifest, current_metadata.join("manifest.json"));
        let _ = fs::remove_file(&marker);
        let _ = fs::remove_file(&backup_manifest);
        return Err(CommandError::io(
            "Could not finalize synchronization",
            &error,
        ));
    }
    let _ = fs::remove_dir_all(&backup);
    let _ = fs::remove_file(&backup_manifest);
    let _ = fs::remove_dir_all(staged_metadata);
    Ok(next)
}

impl OwnerClient {
    async fn connect(app: &AppHandle, link: RemoteLink) -> Result<Self, CommandError> {
        let node = NodeId::from_str(&link.peer_id).map_err(|_| {
            CommandError::new(
                CommandErrorCode::InvalidInput,
                "Share code contains an invalid owner",
            )
        })?;
        let endpoint = endpoint(app).await?;
        let connection = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            endpoint.connect(node, ALPN),
        )
        .await
        .map_err(|_| CommandError::new(CommandErrorCode::Network, "Owner connection timed out"))?
        .map_err(|error| network_error("Could not connect to the owner", error))?;
        Ok(Self { connection, link })
    }

    async fn manifest(&self) -> Result<SyncManifest, CommandError> {
        let request = WireRequest::Manifest {
            secret: self.link.access_secret.clone(),
            instance_id: self.link.instance_id.clone(),
        };
        let bytes = self
            .request_bytes(request, MAX_MANIFEST_BYTES as u64)
            .await?;
        serde_json::from_slice(&bytes).map_err(|error| CommandError {
            code: CommandErrorCode::CorruptedData,
            message: "Owner returned an invalid synchronization manifest".into(),
            retryable: false,
            details: Some(error.to_string()),
        })
    }

    async fn download_file(
        &self,
        shared: &SharedFile,
        target: &Path,
        revision: &str,
        operation_id: &str,
    ) -> Result<(), CommandError> {
        if shared.size > MAX_SHARED_FILE_BYTES {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Shared file exceeds the safe size limit",
            ));
        }
        let request = WireRequest::File {
            path: shared.path.clone(),
            secret: self.link.access_secret.clone(),
            revision: revision.into(),
            instance_id: self.link.instance_id.clone(),
        };
        let (recv, response) = self.open_request(request).await?;
        if response.size != shared.size || response.size > MAX_SHARED_FILE_BYTES {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Owner returned an unexpected file size",
            ));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                CommandError::io("Could not create a synchronized directory", &error)
            })?;
        }
        let temporary = target.with_extension("modsync-sync-part");
        let mut file = tokio::fs::File::create(&temporary)
            .await
            .map_err(|error| CommandError::io("Could not create a synchronized file", &error))?;
        let copied = {
            let mut limited = recv.take(shared.size.saturating_add(1));
            let transfer = tokio::io::copy(&mut limited, &mut file);
            tokio::pin!(transfer);
            loop {
                tokio::select! {
                    result = &mut transfer => {
                        break result.map_err(|error| network_error("Could not receive a shared file", error))?;
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                        if downloads::is_cancelled(operation_id).await {
                            let _ = fs::remove_file(&temporary);
                            return Err(CommandError::new(CommandErrorCode::Cancelled, "Synchronization cancelled"));
                        }
                    }
                }
            }
        };
        file.flush()
            .await
            .map_err(|error| CommandError::io("Could not flush a synchronized file", &error))?;
        drop(file);
        if copied != shared.size
            || !downloads::sha512(&temporary)
                .is_ok_and(|hash| hash.eq_ignore_ascii_case(&shared.sha512))
        {
            let _ = fs::remove_file(&temporary);
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Shared file failed integrity verification",
            ));
        }
        if target.exists() {
            fs::remove_file(target).map_err(|error| {
                CommandError::io("Could not replace a synchronized file", &error)
            })?;
        }
        fs::rename(&temporary, target)
            .map_err(|error| CommandError::io("Could not publish a synchronized file", &error))
    }

    async fn request_bytes(
        &self,
        request: WireRequest,
        limit: u64,
    ) -> Result<Vec<u8>, CommandError> {
        let (mut recv, response) = self.open_request(request).await?;
        if response.size > limit {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Owner response exceeds the safe size limit",
            ));
        }
        recv.read_to_end(response.size as usize)
            .await
            .map_err(|error| network_error("Could not read the owner response", error))
    }

    async fn open_request(
        &self,
        request: WireRequest,
    ) -> Result<(RecvStream, WireResponse), CommandError> {
        let (mut send, mut recv) = self
            .connection
            .open_bi()
            .await
            .map_err(|error| network_error("Could not open an owner request", error))?;
        let payload = serde_json::to_vec(&request).map_err(serialization_error)?;
        send.write_all(&payload)
            .await
            .map_err(|error| network_error("Could not send an owner request", error))?;
        send.finish()
            .map_err(|error| network_error("Could not finish an owner request", error))?;
        let mut size = [0_u8; 4];
        recv.read_exact(&mut size)
            .await
            .map_err(|error| network_error("Could not read the owner response", error))?;
        let header_size = u32::from_be_bytes(size) as usize;
        if header_size == 0 || header_size > MAX_REQUEST_BYTES {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Owner returned an invalid response header",
            ));
        }
        let mut header = vec![0_u8; header_size];
        recv.read_exact(&mut header)
            .await
            .map_err(|error| network_error("Could not read the owner response", error))?;
        let response: WireResponse =
            serde_json::from_slice(&header).map_err(|error| CommandError {
                code: CommandErrorCode::CorruptedData,
                message: "Owner returned an invalid response".into(),
                retryable: false,
                details: Some(error.to_string()),
            })?;
        if !response.ok {
            return Err(CommandError::new(
                CommandErrorCode::PermissionDenied,
                response
                    .error
                    .unwrap_or_else(|| "Owner rejected the request".into()),
            ));
        }
        Ok((recv, response))
    }
}

async fn endpoint(app: &AppHandle) -> Result<Endpoint, CommandError> {
    let endpoint = ENDPOINT
        .get_or_try_init(|| async {
            let secret = load_or_create_key(app)?;
            Endpoint::builder()
                .secret_key(secret)
                .alpns(vec![ALPN.to_vec()])
                .discovery_n0()
                .bind()
                .await
                .map_err(|error| network_error("Could not start peer-to-peer networking", error))
        })
        .await?
        .clone();
    if ACCEPT_STARTED.set(()).is_ok() {
        tauri::async_runtime::spawn(accept_loop(endpoint.clone()));
    }
    Ok(endpoint)
}

async fn accept_loop(endpoint: Endpoint) {
    while let Some(incoming) = endpoint.accept().await {
        tauri::async_runtime::spawn(async move {
            let Ok(connection) = incoming.await else {
                return;
            };
            while let Ok((send, recv)) = connection.accept_bi().await {
                tauri::async_runtime::spawn(handle_request(send, recv));
            }
        });
    }
}

async fn handle_request(mut send: SendStream, mut recv: RecvStream) {
    let request = recv.read_to_end(MAX_REQUEST_BYTES).await;
    let response = match request {
        Ok(bytes) => serde_json::from_slice::<WireRequest>(&bytes)
            .map_err(|_| "Invalid request".to_string())
            .and_then(authorize_request),
        Err(_) => Err("Request exceeds the safe size limit".into()),
    };
    match response {
        Ok(AuthorizedRequest::Manifest(session)) => {
            let snapshot = session.snapshot.clone();
            let generated = tauri::async_runtime::spawn_blocking(move || build_manifest(&session))
                .await
                .map_err(|error| CommandError::new(CommandErrorCode::Io, error.to_string()))
                .and_then(|result| result)
                .and_then(|manifest| {
                    let body = serde_json::to_vec(&manifest).map_err(serialization_error)?;
                    Ok((manifest, body))
                });
            match generated {
                Ok((manifest, body)) => {
                    if let Ok(mut current) = snapshot.write() {
                        *current = Some(manifest);
                    }
                    send_bytes(&mut send, &body).await;
                }
                Err(error) => send_error(&mut send, &error.message).await,
            }
        }
        Ok(AuthorizedRequest::File(session, path, revision)) => {
            let allowed = tauri::async_runtime::spawn_blocking(move || {
                let manifest = session
                    .snapshot
                    .read()
                    .map_err(|_| {
                        CommandError::new(CommandErrorCode::Io, "Sharing snapshot is unavailable")
                    })?
                    .clone()
                    .filter(|manifest| manifest.revision == revision)
                    .ok_or_else(|| {
                        CommandError::new(CommandErrorCode::Conflict, "Sharing revision expired")
                    })?;
                manifest
                    .files
                    .into_iter()
                    .find(|file| file.path == path)
                    .ok_or_else(|| {
                        CommandError::new(CommandErrorCode::NotFound, "Shared file was not found")
                    })
                    .and_then(|file| {
                        let root = shared_root(&session.app, &session.instance_id)?;
                        Ok((safe_existing_target(&root, &file.path)?, file.size))
                    })
            })
            .await;
            match allowed {
                Ok(Ok((path, size))) => send_file(&mut send, &path, size).await,
                Ok(Err(error)) => send_error(&mut send, &error.message).await,
                Err(_) => send_error(&mut send, "Could not prepare the shared file").await,
            }
        }
        Err(error) => send_error(&mut send, &error).await,
    }
    let _ = send.finish();
}

enum AuthorizedRequest {
    Manifest(OwnerSession),
    File(OwnerSession, String, String),
}

fn authorize_request(request: WireRequest) -> Result<AuthorizedRequest, String> {
    let session = owner_session()
        .try_read()
        .map_err(|_| "Sharing session is busy".to_string())?
        .clone()
        .ok_or_else(|| "Sharing is not active".to_string())?;
    match request {
        WireRequest::Manifest {
            secret,
            instance_id,
        } => {
            authorize(&session, &secret, &instance_id)?;
            Ok(AuthorizedRequest::Manifest(session))
        }
        WireRequest::File {
            path,
            secret,
            revision,
            instance_id,
        } => {
            authorize(&session, &secret, &instance_id)?;
            validate_relative_path(&path).map_err(|error| error.message)?;
            Ok(AuthorizedRequest::File(session, path, revision))
        }
    }
}

fn authorize(session: &OwnerSession, secret: &str, instance_id: &str) -> Result<(), String> {
    if session.instance_id != instance_id || !constant_time_eq(&session.access_secret, secret) {
        return Err("Share code is invalid or expired".into());
    }
    Ok(())
}

async fn send_bytes(send: &mut SendStream, body: &[u8]) {
    let response = WireResponse {
        ok: true,
        size: body.len() as u64,
        error: None,
    };
    if send_header(send, &response).await.is_ok() {
        let _ = send.write_all(body).await;
    }
}

async fn send_file(send: &mut SendStream, path: &Path, size: u64) {
    let response = WireResponse {
        ok: true,
        size,
        error: None,
    };
    if send_header(send, &response).await.is_err() {
        return;
    }
    let Ok(mut file) = tokio::fs::File::open(path).await else {
        return;
    };
    let _ = tokio::io::copy(&mut file, send).await;
}

async fn send_error(send: &mut SendStream, message: &str) {
    let _ = send_header(
        send,
        &WireResponse {
            ok: false,
            size: 0,
            error: Some(message.into()),
        },
    )
    .await;
}

async fn send_header(send: &mut SendStream, response: &WireResponse) -> Result<(), ()> {
    let header = serde_json::to_vec(response).map_err(|_| ())?;
    let size = u32::try_from(header.len()).map_err(|_| ())?.to_be_bytes();
    send.write_all(&size).await.map_err(|_| ())?;
    send.write_all(&header).await.map_err(|_| ())
}

fn build_manifest(session: &OwnerSession) -> Result<SyncManifest, CommandError> {
    let root = instances::instances_root(&session.app)?;
    let metadata = instances::metadata_directory(&root, &session.instance_id)?;
    let mut instance = instances::read_manifest(&metadata.join("manifest.json"))?;
    instances::ensure_owned(&instance)?;
    if instance.game_id != GameId::Valheim {
        return Err(CommandError::new(
            CommandErrorCode::Incompatible,
            "Only Valheim instances can be shared",
        ));
    }
    let content_root = shared_root(&session.app, &session.instance_id)?;
    let mut files = HashMap::new();
    for installed in &instance.mods {
        for file in &installed.files {
            let path = installed_disk_path(installed, file);
            insert_shared_file(&content_root, &path, &mut files)?;
        }
    }
    collect_config_files(&content_root, Path::new("BepInEx/config"), 0, &mut files)?;
    if files.len() > MAX_SHARED_FILES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Instance contains too many shared files",
        ));
    }
    let mut files = files.into_values().collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    if files
        .iter()
        .try_fold(0_u64, |total, file| total.checked_add(file.size))
        .map_or(true, |size| size > MAX_TOTAL_SHARED_BYTES)
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Instance exceeds the shared size limit",
        ));
    }
    instance.location.path.clear();
    instance.location.kind = InstanceLocationKind::Managed;
    instance.remote = None;
    instance.ownership = InstanceOwnership::Owned;
    let revision_source =
        serde_json::to_vec(&(PROTOCOL_VERSION, &instance, &files)).map_err(serialization_error)?;
    let revision = hex(&Sha256::digest(revision_source));
    Ok(SyncManifest {
        version: PROTOCOL_VERSION,
        revision,
        instance,
        files,
    })
}

fn insert_shared_file(
    root: &Path,
    relative: &Path,
    output: &mut HashMap<String, SharedFile>,
) -> Result<(), CommandError> {
    let path = relative.to_string_lossy().replace('\\', "/");
    validate_relative_path(&path)?;
    if output.contains_key(&path) {
        return Ok(());
    }
    let file = safe_existing_target(root, &path)?;
    let metadata = file
        .metadata()
        .map_err(|error| CommandError::io("Could not inspect a shared file", &error))?;
    if metadata.len() > MAX_SHARED_FILE_BYTES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Shared file exceeds the safe size limit",
        ));
    }
    output.insert(
        path.clone(),
        SharedFile {
            path,
            size: metadata.len(),
            sha512: downloads::sha512(&file)?,
        },
    );
    Ok(())
}

fn collect_config_files(
    root: &Path,
    relative: &Path,
    depth: usize,
    output: &mut HashMap<String, SharedFile>,
) -> Result<(), CommandError> {
    if depth > 8 || output.len() >= MAX_SHARED_FILES {
        return Ok(());
    }
    let directory = root.join(relative);
    if !directory.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(directory)
        .map_err(|error| CommandError::io("Could not read shared configuration", &error))?
    {
        let entry = entry
            .map_err(|error| CommandError::io("Could not read shared configuration", &error))?;
        let kind = entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect shared configuration", &error))?;
        if kind.is_symlink() {
            continue;
        }
        let child = relative.join(entry.file_name());
        if kind.is_dir() {
            collect_config_files(root, &child, depth + 1, output)?;
        } else if kind.is_file() {
            insert_shared_file(root, &child, output)?;
        }
    }
    Ok(())
}

fn installed_disk_path(
    installed: &crate::contracts::InstalledMod,
    file: &crate::contracts::InstalledFile,
) -> PathBuf {
    let path = PathBuf::from(&file.path);
    let toggleable = installed.provider == ProviderId::Thunderstore
        && !file.mutable
        && (file.path.starts_with("BepInEx/plugins/")
            || file.path.starts_with("BepInEx/patchers/"));
    if installed.enabled || !toggleable {
        path
    } else {
        let mut disabled = path.into_os_string();
        disabled.push(".disabled");
        disabled.into()
    }
}

fn shared_root(app: &AppHandle, instance_id: &str) -> Result<PathBuf, CommandError> {
    let root = instances::instances_root(app)?;
    let metadata = instances::metadata_directory(&root, instance_id)?;
    let manifest = instances::read_manifest(&metadata.join("manifest.json"))?;
    fs::canonicalize(&manifest.location.path)
        .map_err(|error| CommandError::io("Could not open the shared instance", &error))
}

fn safe_existing_target(root: &Path, relative: &str) -> Result<PathBuf, CommandError> {
    let target = safe_target(root, relative)?;
    let canonical = fs::canonicalize(&target)
        .map_err(|error| CommandError::io("Could not open a shared file", &error))?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err(CommandError::new(
            CommandErrorCode::PermissionDenied,
            "Shared path escapes the instance directory",
        ));
    }
    Ok(canonical)
}

fn safe_target(root: &Path, relative: &str) -> Result<PathBuf, CommandError> {
    validate_relative_path(relative)?;
    Ok(root.join(relative))
}

fn validate_relative_path(path: &str) -> Result<(), CommandError> {
    let path = Path::new(path);
    if path.as_os_str().is_empty()
        || path.as_os_str().len() > 1_024
        || path.to_string_lossy().ends_with(".modsync-sync-part")
        || path.is_absolute()
        || path.components().count() > 16
        || path.components().any(|component| {
            !matches!(component, Component::Normal(_))
                || component
                    .as_os_str()
                    .to_string_lossy()
                    .starts_with(".modsync-")
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Shared file path is invalid",
        ));
    }
    Ok(())
}

fn prune_unlisted(root: &Path, files: &[SharedFile]) -> Result<(), CommandError> {
    let expected = files
        .iter()
        .map(|file| file.path.as_str())
        .collect::<HashSet<_>>();
    prune_directory(root, root, &expected)
}

fn prune_directory(
    root: &Path,
    directory: &Path,
    expected: &HashSet<&str>,
) -> Result<(), CommandError> {
    for entry in fs::read_dir(directory)
        .map_err(|error| CommandError::io("Could not inspect synchronized files", &error))?
    {
        let entry = entry
            .map_err(|error| CommandError::io("Could not inspect synchronized files", &error))?;
        let kind = entry
            .file_type()
            .map_err(|error| CommandError::io("Could not inspect synchronized files", &error))?;
        if kind.is_symlink() {
            return Err(CommandError::new(
                CommandErrorCode::InvalidInput,
                "Synchronized instances cannot contain symbolic links",
            ));
        }
        if kind.is_dir() {
            prune_directory(root, &entry.path(), expected)?;
            if fs::read_dir(entry.path()).is_ok_and(|mut entries| entries.next().is_none()) {
                let _ = fs::remove_dir(entry.path());
            }
        } else if kind.is_file() {
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(|_| {
                    CommandError::new(CommandErrorCode::InvalidInput, "Invalid synchronized path")
                })?
                .to_string_lossy()
                .replace('\\', "/");
            if !expected.contains(relative.as_str()) {
                fs::remove_file(entry.path()).map_err(|error| {
                    CommandError::io("Could not remove an obsolete synchronized file", &error)
                })?;
            }
        }
    }
    Ok(())
}

fn create_sync_candidate(
    app: &AppHandle,
    remote: &InstanceManifest,
) -> Result<InstanceManifest, CommandError> {
    let root = instances::instances_root(app)?;
    let created = instances::create_managed(&root, create_input(remote))?;
    let metadata = instances::metadata_directory(&root, &created.id)?;
    if let Err(error) = fs::write(metadata.join(SYNC_INCOMPLETE_FILE), []) {
        let _ = instances::delete_instance(app.clone(), created.id.clone());
        return Err(CommandError::io(
            "Could not create synchronization recovery data",
            &error,
        ));
    }
    Ok(created)
}

fn create_input(remote: &InstanceManifest) -> instances::CreateInstanceInput {
    instances::CreateInstanceInput {
        name: remote.name.clone(),
        icon: remote.icon.clone(),
        game_id: remote.game_id,
        loader: remote.loader,
        icon_color: remote.icon_color.clone(),
        game_version: remote.game_version.clone(),
    }
}

fn validate_remote_manifest(
    manifest: &SyncManifest,
    link: &RemoteLink,
) -> Result<(), CommandError> {
    let mut paths = HashSet::new();
    let total_size = manifest
        .files
        .iter()
        .try_fold(0_u64, |total, file| total.checked_add(file.size));
    if manifest.version != PROTOCOL_VERSION
        || manifest.instance.game_id != GameId::Valheim
        || manifest.instance.id != link.instance_id
        || manifest.instance.ownership != InstanceOwnership::Owned
        || manifest.instance.remote.is_some()
        || manifest.files.len() > MAX_SHARED_FILES
        || total_size.map_or(true, |size| size > MAX_TOTAL_SHARED_BYTES)
        || manifest.files.iter().any(|file| {
            file.size > MAX_SHARED_FILE_BYTES
                || file.sha512.len() != 128
                || !file.sha512.bytes().all(|byte| byte.is_ascii_hexdigit())
                || validate_relative_path(&file.path).is_err()
                || !paths.insert(file.path.as_str())
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Owner returned an unsupported or unsafe synchronization manifest",
        ));
    }
    Ok(())
}

fn decode_share_code(code: &str) -> Result<RemoteLink, CommandError> {
    if code.is_empty() || code.len() > 4_096 {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Share code is invalid",
        ));
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(code.trim())
        .map_err(|_| CommandError::new(CommandErrorCode::InvalidInput, "Share code is invalid"))?;
    let code: ShareCode = serde_json::from_slice(&bytes)
        .map_err(|_| CommandError::new(CommandErrorCode::InvalidInput, "Share code is invalid"))?;
    if code.version != PROTOCOL_VERSION
        || instances::validate_id(&code.instance_id).is_err()
        || code.access_secret.len() != 64
        || !code
            .access_secret
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || NodeId::from_str(&code.peer_id).is_err()
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Share code is unsupported or invalid",
        ));
    }
    Ok(RemoteLink {
        version: code.version,
        peer_id: code.peer_id,
        instance_id: code.instance_id,
        access_secret: code.access_secret,
    })
}

fn write_remote_link(metadata: &Path, link: &RemoteLink) -> Result<(), CommandError> {
    let bytes = serde_json::to_vec(link).map_err(serialization_error)?;
    atomic_write(&metadata.join(REMOTE_FILE), &bytes)
        .map_err(|error| CommandError::io("Could not save the remote instance link", &error))
}

fn read_remote_link(metadata: &Path) -> Result<RemoteLink, CommandError> {
    let bytes = fs::read(metadata.join(REMOTE_FILE))
        .map_err(|error| CommandError::io("Could not read the remote instance link", &error))?;
    serde_json::from_slice(&bytes).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Remote instance link is corrupted".into(),
        retryable: false,
        details: Some(error.to_string()),
    })
}

fn load_or_create_key(app: &AppHandle) -> Result<SecretKey, CommandError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new(CommandErrorCode::Io, error.to_string()))?;
    fs::create_dir_all(&directory).map_err(|error| {
        CommandError::io("Could not create the application data directory", &error)
    })?;
    let path = directory.join("sharing.key");
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(array) = <[u8; 32]>::try_from(bytes.as_slice()) {
            return Ok(SecretKey::from_bytes(&array));
        }
    }
    let secret = SecretKey::generate();
    atomic_write(&path, &secret.to_bytes())
        .map_err(|error| CommandError::io("Could not save the peer identity", &error))?;
    Ok(secret)
}

fn owner_session() -> &'static RwLock<Option<OwnerSession>> {
    static SESSION: OnceLock<RwLock<Option<OwnerSession>>> = OnceLock::new();
    SESSION.get_or_init(|| RwLock::new(None))
}

fn status_for(session: Option<&OwnerSession>) -> SharingStatus {
    SharingStatus {
        active: session.is_some(),
        instance_id: session.map(|active| active.instance_id.clone()),
        code: session.map(|active| active.code.clone()),
    }
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.bytes()
        .zip(right.bytes())
        .fold(0_u8, |difference, (left, right)| difference | left ^ right)
        == 0
}

fn hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

async fn check_cancelled(operation_id: &str) -> Result<(), CommandError> {
    if downloads::is_cancelled(operation_id).await {
        return Err(CommandError::new(
            CommandErrorCode::Cancelled,
            "Synchronization cancelled",
        ));
    }
    Ok(())
}

fn emit_progress(app: &AppHandle, update: ProgressUpdate<'_>) {
    let _ = app.emit(
        "operation-progress",
        OperationProgress {
            message: update.message.into(),
            operation_id: update.operation_id.into(),
            status: update.status,
            completed_items: update.completed_items,
            total_items: update.total_items,
            downloaded_bytes: update.completed_items as u64,
            total_bytes: update.total_items as u64,
        },
    );
}

fn finish_progress(
    app: &AppHandle,
    operation_id: &str,
    result: &Result<InstanceManifest, CommandError>,
) {
    match result {
        Ok(_) => emit_progress(
            app,
            ProgressUpdate {
                message: "Synchronization complete",
                operation_id,
                status: OperationStatus::Completed,
                completed_items: 1,
                total_items: 1,
            },
        ),
        Err(error) => emit_progress(
            app,
            ProgressUpdate {
                message: &error.message,
                operation_id,
                status: if matches!(error.code, CommandErrorCode::Cancelled) {
                    OperationStatus::Cancelled
                } else {
                    OperationStatus::Failed
                },
                completed_items: 0,
                total_items: 1,
            },
        ),
    }
}

fn serialization_error(error: serde_json::Error) -> CommandError {
    CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize sharing data".into(),
        retryable: false,
        details: Some(error.to_string()),
    }
}

fn network_error(message: &str, error: impl std::fmt::Display) -> CommandError {
    CommandError {
        code: CommandErrorCode::Network,
        message: message.into(),
        retryable: true,
        details: Some(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn share_code_round_trips_without_exposing_invalid_versions() {
        let code = ShareCode {
            version: PROTOCOL_VERSION,
            peer_id: SecretKey::generate().public().to_string(),
            instance_id: "inst-1".into(),
            access_secret: "a".repeat(64),
        };
        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&code).unwrap());

        assert_eq!(decode_share_code(&encoded).unwrap().instance_id, "inst-1");
    }

    #[test]
    fn shared_paths_reject_traversal() {
        assert!(matches!(
            validate_relative_path("../outside.dll").unwrap_err().code,
            CommandErrorCode::InvalidInput
        ));
    }

    #[test]
    fn access_secrets_compare_without_early_content_exit() {
        assert!(constant_time_eq(&"a".repeat(64), &"a".repeat(64)));
    }
}
