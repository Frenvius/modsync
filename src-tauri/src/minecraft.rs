use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;

use crate::downloader::{download_batch, DownloadProgress, DownloadTask};
use crate::instance;

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_URL: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Deserialize)]
pub struct VersionManifest {
    pub versions: Vec<VersionInfo>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct VersionInfo {
    pub id: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionMeta {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
    pub downloads: Downloads,
    pub libraries: Vec<Library>,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndex,
    pub assets: String,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersion>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Arguments {
    pub game: Option<Vec<ArgumentValue>>,
    pub jvm: Option<Vec<ArgumentValue>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ArgumentValue {
    Simple(String),
    Conditional {
        rules: Vec<Rule>,
        value: ArgumentValueType,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum ArgumentValueType {
    Single(String),
    Multiple(Vec<String>),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OsRule {
    pub name: Option<String>,
    pub arch: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Downloads {
    pub client: DownloadInfo,
    pub server: Option<DownloadInfo>,
    pub client_mappings: Option<DownloadInfo>,
    pub server_mappings: Option<DownloadInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadInfo {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub url: Option<String>,
    pub natives: Option<HashMap<String, String>>,
    pub rules: Option<Vec<Rule>>,
    pub extract: Option<ExtractRule>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
    pub classifiers: Option<HashMap<String, Artifact>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Artifact {
    pub path: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractRule {
    pub exclude: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetIndex {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JavaVersion {
    pub component: String,
    #[serde(rename = "majorVersion")]
    pub major_version: i32,
}

#[derive(Debug, Deserialize)]
pub struct AssetIndexData {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

pub async fn fetch_version_manifest() -> Result<VersionManifest, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch version manifest: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch version manifest: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse version manifest: {}", e))
}

pub async fn fetch_version_meta(version_url: &str) -> Result<VersionMeta, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(version_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch version metadata: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch version metadata: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse version metadata: {}", e))
}

async fn fetch_asset_index(url: &str) -> Result<AssetIndexData, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch asset index: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch asset index: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse asset index: {}", e))
}

pub fn get_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn get_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "x86") {
        "x86"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "unknown"
    }
}

pub fn should_include_library(library: &Library) -> bool {
    let Some(ref rules) = library.rules else {
        return true;
    };

    let os_name = get_os_name();

    for rule in rules {
        let mut matches = true;

        if let Some(ref os) = rule.os {
            if let Some(ref name) = os.name {
                if name != os_name {
                    matches = false;
                }
            }
        }

        if matches {
            return rule.action == "allow";
        }
    }

    false
}

pub fn get_native_classifier(library: &Library) -> Option<String> {
    let natives = library.natives.as_ref()?;
    let os_name = get_os_name();

    natives
        .get(os_name)
        .map(|s| s.replace("${arch}", get_arch()))
}

pub async fn download_minecraft<F>(
    app_handle: &AppHandle,
    modpack_id: &str,
    version: &str,
    on_progress: F,
) -> Result<VersionMeta, String>
where
    F: Fn(DownloadProgress) + Send + Sync + Clone + 'static,
{
    let manifest = fetch_version_manifest().await?;

    let version_info = manifest
        .versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found", version))?;

    let version_meta = fetch_version_meta(&version_info.url).await?;

    let _instance_dir = instance::get_instance_dir(app_handle, modpack_id)?;
    let versions_dir = instance::get_versions_dir(app_handle, modpack_id)?;
    let libraries_dir = instance::get_libraries_dir(app_handle, modpack_id)?;
    let assets_dir = instance::get_assets_dir(app_handle, modpack_id)?;

    let client_jar_path = versions_dir.join(version).join(format!("{}.jar", version));
    let client_download = &version_meta.downloads.client;

    let mut tasks: Vec<DownloadTask> = vec![DownloadTask {
        url: client_download.url.clone(),
        path: client_jar_path,
        sha1: Some(client_download.sha1.clone()),
        size: Some(client_download.size),
        name: Some(format!("{}.jar", version)),
    }];

    let version_json_path = versions_dir.join(version).join(format!("{}.json", version));
    let version_json = serde_json::to_string_pretty(&version_meta)
        .map_err(|e| format!("Failed to serialize version meta: {}", e))?;

    if let Some(parent) = version_json_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create versions directory: {}", e))?;
    }
    std::fs::write(&version_json_path, version_json)
        .map_err(|e| format!("Failed to write version JSON: {}", e))?;

    for library in &version_meta.libraries {
        if !should_include_library(library) {
            continue;
        }

        if let Some(ref downloads) = library.downloads {
            if let Some(ref artifact) = downloads.artifact {
                tasks.push(DownloadTask {
                    url: artifact.url.clone(),
                    path: libraries_dir.join(&artifact.path),
                    sha1: Some(artifact.sha1.clone()),
                    size: Some(artifact.size),
                    name: Some(artifact.path.clone()),
                });
            }

            if let Some(classifier) = get_native_classifier(library) {
                if let Some(ref classifiers) = downloads.classifiers {
                    if let Some(native_artifact) = classifiers.get(&classifier) {
                        tasks.push(DownloadTask {
                            url: native_artifact.url.clone(),
                            path: libraries_dir.join(&native_artifact.path),
                            sha1: Some(native_artifact.sha1.clone()),
                            size: Some(native_artifact.size),
                            name: Some(format!("{} (native)", native_artifact.path)),
                        });
                    }
                }
            }
        }
    }

    let asset_index = &version_meta.asset_index;
    let asset_index_path = assets_dir
        .join("indexes")
        .join(format!("{}.json", asset_index.id));

    tasks.push(DownloadTask {
        url: asset_index.url.clone(),
        path: asset_index_path.clone(),
        sha1: Some(asset_index.sha1.clone()),
        size: Some(asset_index.size),
        name: Some(format!("{}.json (asset index)", asset_index.id)),
    });

    let on_progress_clone = on_progress.clone();
    download_batch(tasks, 10, on_progress_clone).await?;

    let asset_index_data = fetch_asset_index(&asset_index.url).await?;
    let mut asset_tasks: Vec<DownloadTask> = vec![];

    for asset in asset_index_data.objects.values() {
        let hash_prefix = &asset.hash[0..2];
        let asset_path = assets_dir
            .join("objects")
            .join(hash_prefix)
            .join(&asset.hash);
        let asset_url = format!("{}/{}/{}", RESOURCES_URL, hash_prefix, asset.hash);

        asset_tasks.push(DownloadTask {
            url: asset_url,
            path: asset_path,
            sha1: Some(asset.hash.clone()),
            size: Some(asset.size),
            name: None,
        });
    }

    download_batch(asset_tasks, 20, on_progress).await?;

    Ok(version_meta)
}

