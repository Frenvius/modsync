use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Semaphore;

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded_files: u64,
    pub total_files: u64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
}

pub async fn download_file(url: &str, path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed for {}: HTTP {}",
            url,
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    tokio::fs::write(path, &bytes)
        .await
        .map_err(|e| format!("Failed to write file {:?}: {}", path, e))?;

    Ok(())
}

pub async fn download_with_verify(task: &DownloadTask) -> Result<(), String> {
    if task.path.exists() {
        if let Some(ref expected_sha1) = task.sha1 {
            let existing_hash = compute_sha1(&task.path).await?;
            if existing_hash == *expected_sha1 {
                return Ok(());
            }
        } else if let Some(expected_size) = task.size {
            if let Ok(metadata) = tokio::fs::metadata(&task.path).await {
                if metadata.len() == expected_size {
                    return Ok(());
                }
            }
        }
    }

    download_file(&task.url, &task.path).await?;

    if let Some(ref expected_sha1) = task.sha1 {
        let actual_sha1 = compute_sha1(&task.path).await?;
        if actual_sha1 != *expected_sha1 {
            let _ = tokio::fs::remove_file(&task.path).await;
            return Err(format!(
                "Hash mismatch for {:?}: expected {}, got {}",
                task.path, expected_sha1, actual_sha1
            ));
        }
    }

    Ok(())
}

pub async fn compute_sha1(path: &PathBuf) -> Result<String, String> {
    use sha1::{Sha1, Digest};

    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Failed to read file for hashing: {}", e))?;

    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}

pub async fn download_batch<F>(
    tasks: Vec<DownloadTask>,
    concurrency: usize,
    on_progress: F,
) -> Result<(), String>
where
    F: Fn(DownloadProgress) + Send + Sync + 'static,
{
    if tasks.is_empty() {
        return Ok(());
    }

    let semaphore = Arc::new(Semaphore::new(concurrency));
    let downloaded_files = Arc::new(AtomicU64::new(0));
    let downloaded_bytes = Arc::new(AtomicU64::new(0));
    let total_files = tasks.len() as u64;
    let total_bytes: u64 = tasks.iter().filter_map(|t| t.size).sum();
    let on_progress = Arc::new(on_progress);
    let errors = Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));

    let mut handles = vec![];

    for task in tasks {
        let semaphore = Arc::clone(&semaphore);
        let downloaded_files = Arc::clone(&downloaded_files);
        let downloaded_bytes = Arc::clone(&downloaded_bytes);
        let on_progress = Arc::clone(&on_progress);
        let errors = Arc::clone(&errors);
        let task_name = task.name.clone().unwrap_or_else(|| {
            task.path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        });
        let task_size = task.size.unwrap_or(0);

        let handle = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            let files = downloaded_files.load(Ordering::Relaxed);
            let bytes = downloaded_bytes.load(Ordering::Relaxed);
            on_progress(DownloadProgress {
                downloaded_files: files,
                total_files,
                downloaded_bytes: bytes,
                total_bytes,
                current_file: task_name.clone(),
            });

            match download_with_verify(&task).await {
                Ok(()) => {
                    downloaded_files.fetch_add(1, Ordering::Relaxed);
                    downloaded_bytes.fetch_add(task_size, Ordering::Relaxed);

                    let files = downloaded_files.load(Ordering::Relaxed);
                    let bytes = downloaded_bytes.load(Ordering::Relaxed);
                    on_progress(DownloadProgress {
                        downloaded_files: files,
                        total_files,
                        downloaded_bytes: bytes,
                        total_bytes,
                        current_file: task_name,
                    });
                }
                Err(e) => {
                    let mut errs = errors.lock().await;
                    errs.push(format!("{}: {}", task_name, e));
                }
            }
        });

        handles.push(handle);
    }

    for handle in handles {
        let _ = handle.await;
    }

    let errs = errors.lock().await;
    if !errs.is_empty() {
        return Err(format!(
            "Failed to download {} file(s):\n{}",
            errs.len(),
            errs.join("\n")
        ));
    }

    Ok(())
}

pub async fn download_file_with_progress<F>(
    url: &str,
    path: &PathBuf,
    on_progress: F,
) -> Result<u64, String>
where
    F: Fn(u64, u64) + Send + 'static,
{
    use tokio::io::AsyncWriteExt;

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed for {}: HTTP {}",
            url,
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(path)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error reading chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error writing chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        on_progress(downloaded, total_size);
    }

    file.flush()
        .await
        .map_err(|e| format!("Error flushing file: {}", e))?;

    Ok(downloaded)
}
