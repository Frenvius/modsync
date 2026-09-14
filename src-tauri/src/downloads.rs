use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use md5::Md5;
use sha1::Sha1;
use sha2::{Digest, Sha512};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::{
    contracts::{CommandError, CommandErrorCode, OperationProgress, OperationStatus},
    providers::{ArtifactHash, HashAlgorithm, ProjectVersion},
};

const MAX_DOWNLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Copy)]
pub struct ProgressContext {
    pub completed_items: u32,
    pub total_items: u32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[tauri::command]
pub async fn cancel_operation(operation_id: String) -> Result<(), CommandError> {
    validate_operation_id(&operation_id)?;
    if !active().lock().await.contains(&operation_id) {
        return Err(CommandError::new(
            CommandErrorCode::NotFound,
            "Download operation is no longer active",
        ));
    }
    cancelled().lock().await.insert(operation_id);
    Ok(())
}

pub async fn register_operation(operation_id: &str) -> Result<(), CommandError> {
    validate_operation_id(operation_id)?;
    if !active().lock().await.insert(operation_id.into()) {
        return Err(CommandError::new(
            CommandErrorCode::Conflict,
            "Download operation identifier is already active",
        ));
    }
    Ok(())
}

pub async fn download(
    app: &AppHandle,
    operation_id: &str,
    version: &ProjectVersion,
    progress: ProgressContext,
) -> Result<PathBuf, CommandError> {
    validate_operation_id(operation_id)?;
    let url = reqwest::Url::parse(&version.download_url).map_err(|_| {
        CommandError::new(
            CommandErrorCode::ProviderUnavailable,
            "Provider did not supply a valid download URL",
        )
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Download URL must use HTTP or HTTPS",
        ));
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| CommandError::new(CommandErrorCode::Io, error.to_string()))?
        .join("downloads");
    fs::create_dir_all(&cache)
        .map_err(|error| CommandError::io("Could not create the download cache", &error))?;
    let path = cache.join(format!("{:016x}.bin", hash(&version.download_url)));
    if valid_cached_file(&path, version)? {
        let size = fs::metadata(&path).map_or(0, |metadata| metadata.len());
        emit(
            app,
            operation_id,
            "Using cached file",
            ProgressContext {
                downloaded_bytes: progress.downloaded_bytes.saturating_add(size),
                total_bytes: if progress.total_bytes == 0 {
                    size
                } else {
                    progress.total_bytes
                },
                ..progress
            },
        );
        return Ok(path);
    }

    let part = cache.join(format!(".{operation_id}.part"));
    let result = download_file(
        app,
        DownloadRequest {
            operation_id,
            version,
            destination: &part,
            progress,
        },
    )
    .await;
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(error);
    }
    verify(&part, &version.hashes, version.file_size)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| CommandError::io("Could not replace the download cache", &error))?;
    }
    fs::rename(&part, &path)
        .map_err(|error| CommandError::io("Could not finalize the downloaded file", &error))?;
    Ok(path)
}

pub async fn finish_operation(operation_id: &str) {
    cancelled().lock().await.remove(operation_id);
    active().lock().await.remove(operation_id);
}

pub async fn is_cancelled(operation_id: &str) -> bool {
    cancelled().lock().await.contains(operation_id)
}

struct DownloadRequest<'a> {
    operation_id: &'a str,
    version: &'a ProjectVersion,
    destination: &'a Path,
    progress: ProgressContext,
}

async fn download_file(app: &AppHandle, request: DownloadRequest<'_>) -> Result<(), CommandError> {
    let DownloadRequest {
        operation_id,
        version,
        destination,
        progress,
    } = request;
    let mut response = crate::providers::http::send(
        crate::providers::http::client()?
            .get(&version.download_url)
            .timeout(std::time::Duration::from_secs(30 * 60)),
    )
    .await?;
    let response_size = response.content_length().unwrap_or(version.file_size);
    let total_bytes = if progress.total_bytes == 0 {
        response_size
    } else {
        progress.total_bytes
    };
    if response_size > MAX_DOWNLOAD_BYTES {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Download exceeds the 2 GB safety limit",
        ));
    }
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|error| CommandError::io("Could not create the download file", &error))?;
    let mut received = 0_u64;
    while let Some(chunk) = response.chunk().await.map_err(|error| CommandError {
        code: CommandErrorCode::Network,
        message: "Download was interrupted".into(),
        retryable: true,
        details: Some(error.to_string()),
    })? {
        if is_cancelled(operation_id).await {
            return Err(CommandError::new(
                CommandErrorCode::Cancelled,
                "Installation cancelled",
            ));
        }
        received = received.saturating_add(chunk.len() as u64);
        if received > MAX_DOWNLOAD_BYTES || (version.file_size > 0 && received > version.file_size)
        {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Downloaded file is larger than the provider metadata",
            ));
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| CommandError::io("Could not write the download file", &error))?;
        emit(
            app,
            operation_id,
            "Downloading file",
            ProgressContext {
                downloaded_bytes: progress.downloaded_bytes.saturating_add(received),
                total_bytes,
                ..progress
            },
        );
    }
    file.sync_all()
        .await
        .map_err(|error| CommandError::io("Could not flush the download file", &error))
}

fn valid_cached_file(path: &Path, version: &ProjectVersion) -> Result<bool, CommandError> {
    if !path.is_file() {
        return Ok(false);
    }
    match verify(path, &version.hashes, version.file_size) {
        Ok(()) => Ok(true),
        Err(_) => {
            fs::remove_file(path).map_err(|error| {
                CommandError::io("Could not remove an invalid cached file", &error)
            })?;
            Ok(false)
        }
    }
}

pub fn sha512(path: &Path) -> Result<String, CommandError> {
    let mut file = fs::File::open(path)
        .map_err(|error| CommandError::io("Could not verify the downloaded file", &error))?;
    let mut hash = Sha512::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| CommandError::io("Could not verify the downloaded file", &error))?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn verify(path: &Path, hashes: &[ArtifactHash], expected_size: u64) -> Result<(), CommandError> {
    let (size, md5, sha1, sha512) = compute_hashes(path)?;
    if expected_size > 0 && size != expected_size {
        return Err(CommandError::new(
            CommandErrorCode::CorruptedData,
            "Downloaded file size does not match provider metadata",
        ));
    }
    for hash in hashes {
        let actual = match hash.algorithm {
            HashAlgorithm::Md5 => &md5,
            HashAlgorithm::Sha1 => &sha1,
            HashAlgorithm::Sha512 => &sha512,
        };
        if !actual.eq_ignore_ascii_case(&hash.value) {
            return Err(CommandError::new(
                CommandErrorCode::CorruptedData,
                "Downloaded file failed integrity verification",
            ));
        }
    }
    Ok(())
}

fn compute_hashes(path: &Path) -> Result<(u64, String, String, String), CommandError> {
    let mut file = fs::File::open(path)
        .map_err(|error| CommandError::io("Could not verify the downloaded file", &error))?;
    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha512 = Sha512::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut size = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| CommandError::io("Could not verify the downloaded file", &error))?;
        if read == 0 {
            break;
        }
        let chunk = &buffer[..read];
        size = size.saturating_add(read as u64);
        md5.update(chunk);
        sha1.update(chunk);
        sha512.update(chunk);
    }
    Ok((
        size,
        format!("{:x}", md5.finalize()),
        format!("{:x}", sha1.finalize()),
        format!("{:x}", sha512.finalize()),
    ))
}

fn emit(app: &AppHandle, operation_id: &str, message: &str, progress: ProgressContext) {
    let _ = app.emit(
        "operation-progress",
        OperationProgress {
            message: message.into(),
            operation_id: operation_id.into(),
            status: OperationStatus::Running,
            completed_items: progress.completed_items,
            total_items: progress.total_items,
            downloaded_bytes: progress.downloaded_bytes,
            total_bytes: progress.total_bytes,
        },
    );
}

fn validate_operation_id(value: &str) -> Result<(), CommandError> {
    if value.is_empty()
        || value.len() > 100
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Operation identifier is invalid",
        ));
    }
    Ok(())
}

fn active() -> &'static tokio::sync::Mutex<HashSet<String>> {
    static ACTIVE: OnceLock<tokio::sync::Mutex<HashSet<String>>> = OnceLock::new();
    ACTIVE.get_or_init(|| tokio::sync::Mutex::new(HashSet::new()))
}

fn cancelled() -> &'static tokio::sync::Mutex<HashSet<String>> {
    static CANCELLED: OnceLock<tokio::sync::Mutex<HashSet<String>>> = OnceLock::new();
    CANCELLED.get_or_init(|| tokio::sync::Mutex::new(HashSet::new()))
}

fn hash(value: &str) -> u64 {
    value
        .bytes()
        .fold(14_695_981_039_346_656_037, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(1_099_511_628_211)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn concurrent_operations_can_be_cancelled_independently() {
        tauri::async_runtime::block_on(async {
            register_operation("test-operation-one").await.unwrap();
            register_operation("test-operation-two").await.unwrap();

            cancel_operation("test-operation-one".into()).await.unwrap();

            assert!(is_cancelled("test-operation-one").await);
            assert!(!is_cancelled("test-operation-two").await);
            finish_operation("test-operation-one").await;
            finish_operation("test-operation-two").await;
        });
    }

    #[test]
    fn sha512_matches_known_digest_across_multiple_buffers() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("modsync-sha512-{nonce}"));
        let contents = vec![b'a'; 16 * 1024 * 1024];
        fs::write(&path, &contents).unwrap();
        let started = std::time::Instant::now();
        let actual = sha512(&path).unwrap();
        eprintln!("SHA-512 of 16 MiB: {:?}", started.elapsed());
        assert_eq!(actual, format!("{:x}", Sha512::digest(&contents)));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn verify_rejects_a_hash_mismatch() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("modsync-hash-{nonce}"));
        fs::write(&path, b"content").unwrap();
        let error = verify(
            &path,
            &[ArtifactHash {
                algorithm: HashAlgorithm::Sha512,
                value: "wrong".into(),
            }],
            7,
        )
        .unwrap_err();
        assert!(matches!(error.code, CommandErrorCode::CorruptedData));
        fs::remove_file(path).unwrap();
    }
}
