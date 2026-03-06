use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::downloader::{download_batch, DownloadProgress, DownloadTask};
use crate::minecraft::{Artifact, Library, LibraryDownloads, VersionMeta};

const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2";
const FABRIC_MAVEN_URL: &str = "https://maven.fabricmc.net";

#[derive(Debug, Deserialize)]
pub struct FabricLoaderVersion {
    pub separator: String,
    pub build: i32,
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FabricLoaderProfile {
    pub id: String,
    pub inherits_from: String,
    pub release_time: String,
    pub time: String,
    #[serde(rename = "type")]
    pub profile_type: String,
    pub main_class: String,
    pub arguments: Option<FabricArguments>,
    pub libraries: Vec<FabricLibrary>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FabricArguments {
    pub game: Option<Vec<String>>,
    pub jvm: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FabricLibrary {
    pub name: String,
    pub url: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<u64>,
}

pub async fn get_loader_versions() -> Result<Vec<FabricLoaderVersion>, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("{}/versions/loader", FABRIC_META_URL);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Fabric loader versions: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Fabric loader versions: HTTP {}",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Fabric loader versions: {}", e))
}

pub async fn get_latest_loader_version() -> Result<String, String> {
    let versions = get_loader_versions().await?;

    versions
        .iter()
        .find(|v| v.stable)
        .map(|v| v.version.clone())
        .ok_or_else(|| "No stable Fabric loader version found".to_string())
}

pub async fn get_loader_profile(
    minecraft_version: &str,
    loader_version: &str,
) -> Result<FabricLoaderProfile, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!(
        "{}/versions/loader/{}/{}/profile/json",
        FABRIC_META_URL, minecraft_version, loader_version
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Fabric loader profile: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Fabric loader profile: HTTP {}. Make sure Fabric supports Minecraft {}",
            response.status(),
            minecraft_version
        ));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Fabric loader profile: {}", e))
}

fn maven_to_path(maven: &str) -> Option<String> {
    let parts: Vec<&str> = maven.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];

    Some(format!(
        "{}/{}/{}/{}-{}.jar",
        group, artifact, version, artifact, version
    ))
}

pub async fn install_fabric<F>(
    instance_dir: &Path,
    minecraft_version: &str,
    libraries_dir: &Path,
    on_progress: F,
) -> Result<(String, FabricLoaderProfile), String>
where
    F: Fn(DownloadProgress) + Send + Sync + Clone + 'static,
{
    let loader_version = get_latest_loader_version().await?;

    let profile = get_loader_profile(minecraft_version, &loader_version).await?;

    let mut tasks: Vec<DownloadTask> = vec![];

    for lib in &profile.libraries {
        let path = maven_to_path(&lib.name);
        if path.is_none() {
            continue;
        }

        let relative_path = path.unwrap();
        let full_path = libraries_dir.join(&relative_path);

        let url = if let Some(ref base_url) = lib.url {
            format!("{}/{}", base_url.trim_end_matches('/'), relative_path)
        } else {
            format!("{}/{}", FABRIC_MAVEN_URL, relative_path)
        };

        tasks.push(DownloadTask {
            url,
            path: full_path,
            sha1: lib.sha1.clone(),
            size: lib.size,
            name: Some(lib.name.clone()),
        });
    }

    download_batch(tasks, 10, on_progress).await?;

    let versions_dir = instance_dir.join("versions");
    let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, minecraft_version);
    let fabric_json_path = versions_dir
        .join(&fabric_version_id)
        .join(format!("{}.json", fabric_version_id));

    if let Some(parent) = fabric_json_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Fabric version directory: {}", e))?;
    }

    let profile_json = serde_json::to_string_pretty(&profile)
        .map_err(|e| format!("Failed to serialize Fabric profile: {}", e))?;

    std::fs::write(&fabric_json_path, profile_json)
        .map_err(|e| format!("Failed to write Fabric version JSON: {}", e))?;

    Ok((loader_version, profile))
}

pub fn fabric_libs_to_minecraft_libs(profile: &FabricLoaderProfile) -> Vec<Library> {
    profile
        .libraries
        .iter()
        .filter_map(|lib| {
            let path = maven_to_path(&lib.name)?;

            Some(Library {
                name: lib.name.clone(),
                downloads: Some(LibraryDownloads {
                    artifact: Some(Artifact {
                        path,
                        sha1: lib.sha1.clone().unwrap_or_default(),
                        size: lib.size.unwrap_or(0),
                        url: lib.url.clone().unwrap_or_else(|| FABRIC_MAVEN_URL.to_string()),
                    }),
                    classifiers: None,
                }),
                url: lib.url.clone(),
                natives: None,
                rules: None,
                extract: None,
            })
        })
        .collect()
}

pub async fn supports_minecraft_version(minecraft_version: &str) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("{}/versions/game", FABRIC_META_URL);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Fabric game versions: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Fabric game versions: HTTP {}",
            response.status()
        ));
    }

    #[derive(Deserialize)]
    struct GameVersion {
        version: String,
        stable: bool,
    }

    let versions: Vec<GameVersion> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Fabric game versions: {}", e))?;

    Ok(versions.iter().any(|v| v.version == minecraft_version))
}
