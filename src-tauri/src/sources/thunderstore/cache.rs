use std::collections::HashSet;
use std::io::Read as IoRead;
use std::path::{Path, PathBuf};

use crate::http::HTTP_CLIENT;

use super::api;
use super::manifest::DependencyString;

#[derive(Debug, Clone)]
pub struct ResolvedDep {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub version: String,
    pub download_url: String,
    pub dependencies: Vec<String>,
    pub icon: Option<String>,
}

pub async fn download_and_extract(
    cache_base: &Path,
    full_name: &str,
    version: &str,
    download_url: &str,
) -> Result<PathBuf, String> {
    let cache_dir = cache_base.join(full_name).join(version);

    if cache_dir.exists() && cache_dir.join(".cached").exists() {
        return Ok(cache_dir);
    }

    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let response = HTTP_CLIENT
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", full_name, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed for {}: HTTP {}",
            full_name,
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response for {}: {}", full_name, e))?;

    let zip_bytes = bytes.to_vec();
    let zip_dir = cache_dir.clone();
    tokio::task::spawn_blocking(move || extract_zip(&zip_bytes, &zip_dir))
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

    std::fs::write(cache_dir.join(".cached"), "")
        .map_err(|e| format!("Failed to mark cache: {}", e))?;

    Ok(cache_dir)
}

fn extract_zip(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let name = file.name().to_string();

        if name.starts_with("__MACOSX") || name.starts_with(".") {
            continue;
        }

        let out_path = target_dir.join(&name);

        if file.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir {:?}: {}", out_path, e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }

            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read zip file {}: {}", name, e))?;

            std::fs::write(&out_path, &buf)
                .map_err(|e| format!("Failed to write {}: {}", name, e))?;
        }
    }

    Ok(())
}

pub fn resolve_dependencies_with_visited<'a>(
    community: &'a str,
    dep_strings: &'a [String],
    visited: &'a mut HashSet<String>,
    cache_dir: Option<&'a Path>,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<Vec<ResolvedDep>, String>> + Send + 'a>,
> {
    Box::pin(async move {
        let mut result = Vec::new();

        for dep_str in dep_strings {
            let parsed = match DependencyString::parse(dep_str) {
                Some(p) => p,
                None => continue,
            };

            let full_name = parsed.full_name();
            if visited.contains(&full_name) {
                continue;
            }
            visited.insert(full_name.clone());

            let versions =
                api::get_package_versions(community, &parsed.owner, &parsed.name, cache_dir).await?;
            let version_info = versions.iter().find(|v| v.version_number == parsed.version);

            let chosen = version_info.or_else(|| versions.first());

            if let Some(ver) = chosen {
                if !ver.dependencies.is_empty() {
                    let sub_deps =
                        resolve_dependencies_with_visited(community, &ver.dependencies, visited, cache_dir)
                            .await?;
                    result.extend(sub_deps);
                }

                result.push(ResolvedDep {
                    owner: parsed.owner.clone(),
                    name: parsed.name.clone(),
                    full_name,
                    version: ver.version_number.clone(),
                    download_url: ver.download_url.clone(),
                    dependencies: ver.dependencies.clone(),
                    icon: ver.icon.clone(),
                });
            }
        }

        Ok(result)
    })
}

