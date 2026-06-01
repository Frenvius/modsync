use serde::Deserialize;
use std::path::Path;
use std::process::Command;

use crate::downloader::DownloadTask;
use crate::launcher::find_java;
use crate::loaders::fabric::{FabricArguments, FabricLibrary, FabricLoaderProfile};

const NEOFORGE_MAVEN_BASE: &str = "https://maven.neoforged.net/releases/net/neoforged";
const FORGE_MAVEN_BASE: &str = "https://maven.minecraftforge.net/net/minecraftforge";

#[derive(Debug, Deserialize)]
struct MavenMetadata {
    versioning: Versioning,
}

#[derive(Debug, Deserialize)]
struct Versioning {
    versions: VersionList,
}

#[derive(Debug, Deserialize)]
struct VersionList {
    version: Vec<String>,
}

struct MavenCoords {
    base_url: String,
    artifact: String,
    version_prefix: String,
}

fn resolve_maven_coords(loader: &str, mc_version: &str) -> MavenCoords {
    match loader {
        "forge" => MavenCoords {
            base_url: FORGE_MAVEN_BASE.to_string(),
            artifact: "forge".to_string(),
            version_prefix: format!("{}-", mc_version),
        },
        _ => {
            if mc_version == "1.20.1" {
                MavenCoords {
                    base_url: NEOFORGE_MAVEN_BASE.to_string(),
                    artifact: "forge".to_string(),
                    version_prefix: "1.20.1-".to_string(),
                }
            } else {
                let minor = mc_version
                    .strip_prefix("1.")
                    .and_then(|rest| rest.split('.').next())
                    .and_then(|m| m.parse::<u32>().ok())
                    .unwrap_or(0);
                MavenCoords {
                    base_url: NEOFORGE_MAVEN_BASE.to_string(),
                    artifact: "neoforge".to_string(),
                    version_prefix: format!("{}.", minor),
                }
            }
        }
    }
}

async fn fetch_versions_from_maven(coords: &MavenCoords) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/{}/maven-metadata.xml",
        coords.base_url, coords.artifact
    );

    let client = reqwest::Client::builder()
        .user_agent("ModSync/0.1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let xml = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch loader versions: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read loader metadata: {}", e))?;

    let metadata: MavenMetadata = serde_xml_rs::from_str(&xml)
        .map_err(|e| format!("Failed to parse loader metadata: {}", e))?;

    let versions: Vec<String> = metadata
        .versioning
        .versions
        .version
        .iter()
        .rev()
        .filter(|v| v.starts_with(&coords.version_prefix))
        .cloned()
        .collect();

    Ok(versions)
}

pub async fn get_loader_versions(loader: &str, mc_version: &str) -> Result<Vec<String>, String> {
    let coords = resolve_maven_coords(loader, mc_version);
    fetch_versions_from_maven(&coords).await
}

async fn resolve_version_and_coords(
    loader: &str,
    mc_version: &str,
    pinned: Option<&str>,
) -> Result<(MavenCoords, String), String> {
    let coords = resolve_maven_coords(loader, mc_version);
    let version = if let Some(v) = pinned {
        v.to_string()
    } else {
        let versions = fetch_versions_from_maven(&coords).await?;
        versions
            .into_iter()
            .next()
            .ok_or_else(|| format!("No {} version found for Minecraft {}", loader, mc_version))?
    };
    Ok((coords, version))
}

pub fn maven_to_path(maven: &str) -> Option<String> {
    let (coords, ext) = if let Some(at_pos) = maven.find('@') {
        (&maven[..at_pos], &maven[at_pos + 1..])
    } else {
        (maven, "jar")
    };

    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];

    if parts.len() >= 4 {
        let classifier = parts[3];
        Some(format!(
            "{}/{}/{}/{}-{}-{}.{}",
            group, artifact, version, artifact, version, classifier, ext
        ))
    } else {
        Some(format!(
            "{}/{}/{}/{}-{}.{}",
            group, artifact, version, artifact, version, ext
        ))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallerProfile {
    id: String,
    inherits_from: Option<String>,
    #[serde(rename = "type")]
    profile_type: Option<String>,
    main_class: Option<String>,
    arguments: Option<InstallerArguments>,
    libraries: Option<Vec<InstallerLibrary>>,
}

#[derive(Debug, Deserialize)]
struct InstallerArguments {
    game: Option<Vec<serde_json::Value>>,
    jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct InstallerLibrary {
    name: String,
    downloads: Option<InstallerLibDownloads>,
}

#[derive(Debug, Deserialize)]
struct InstallerLibDownloads {
    artifact: Option<InstallerArtifact>,
}

#[derive(Debug, Deserialize)]
struct InstallerArtifact {
    url: Option<String>,
    sha1: Option<String>,
    size: Option<u64>,
}

fn flatten_args(values: &[serde_json::Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect()
}

fn profile_from_installer(ip: InstallerProfile) -> FabricLoaderProfile {
    let game_args = ip
        .arguments
        .as_ref()
        .and_then(|a| a.game.as_ref())
        .map(|g| flatten_args(g));

    let jvm_args = ip
        .arguments
        .as_ref()
        .and_then(|a| a.jvm.as_ref())
        .map(|j| flatten_args(j));

    let arguments = if game_args.is_some() || jvm_args.is_some() {
        Some(FabricArguments {
            game: game_args,
            jvm: jvm_args,
        })
    } else {
        None
    };

    let libraries = ip
        .libraries
        .unwrap_or_default()
        .into_iter()
        .map(|lib| {
            let (url, sha1, size) = lib
                .downloads
                .and_then(|d| d.artifact)
                .map(|a| (a.url, a.sha1, a.size))
                .unwrap_or((None, None, None));

            FabricLibrary {
                name: lib.name,
                url,
                sha1,
                size,
            }
        })
        .collect();

    FabricLoaderProfile {
        id: ip.id,
        inherits_from: ip.inherits_from.unwrap_or_default(),
        release_time: String::new(),
        time: String::new(),
        profile_type: ip.profile_type.unwrap_or_else(|| "release".to_string()),
        main_class: ip.main_class.unwrap_or_default(),
        arguments,
        libraries,
    }
}

pub async fn install_neoforge(
    instance_dir: &Path,
    minecraft_version: &str,
    libraries_dir: &Path,
    pinned_version: Option<&str>,
    loader: &str,
) -> Result<(String, FabricLoaderProfile), String> {
    let java = find_java()?;

    let (coords, nf_version) =
        resolve_version_and_coords(loader, minecraft_version, pinned_version).await?;
    let artifact = &coords.artifact;

    let installer_url = format!(
        "{}/{}/{}/{}-{}-installer.jar",
        coords.base_url, artifact, nf_version, artifact, nf_version
    );

    let cache_dir = libraries_dir.parent().unwrap_or(instance_dir).join("cache");
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let installer_path = cache_dir.join(format!("{}-{}-installer.jar", artifact, nf_version));

    if !installer_path.exists() {
        let tasks = vec![DownloadTask {
            url: installer_url,
            path: installer_path.clone(),
            sha1: None,
            size: None,
            name: Some(format!("NeoForge {}", nf_version)),
        }];
        crate::downloader::download_batch(tasks, 1, |_| {}).await?;
    }

    let launcher_profiles_path = instance_dir.join("launcher_profiles.json");
    let needs_cleanup = !launcher_profiles_path.exists();
    if needs_cleanup {
        std::fs::write(
            &launcher_profiles_path,
            r#"{"profiles":{}}"#,
        )
        .map_err(|e| format!("Failed to create launcher_profiles.json: {}", e))?;
    }

    eprintln!(
        "[NeoForge] Running installer: java -jar {} --installClient {}",
        installer_path.display(),
        instance_dir.display()
    );

    let output = Command::new(&java.path)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(instance_dir)
        .output()
        .map_err(|e| format!("Failed to run NeoForge installer: {}", e))?;

    let stderr_text = String::from_utf8_lossy(&output.stderr);
    let stdout_text = String::from_utf8_lossy(&output.stdout);

    eprintln!("[NeoForge] Installer stdout:\n{}", stdout_text);
    eprintln!("[NeoForge] Installer stderr:\n{}", stderr_text);

    if needs_cleanup {
        let _ = std::fs::remove_file(&launcher_profiles_path);
    }

    if !output.status.success() {
        return Err(format!(
            "NeoForge installer failed (exit code {:?}):\n{}",
            output.status.code(),
            stderr_text
        ));
    }

    let versions_dir = instance_dir.join("versions");
    let version_id = find_neoforge_version_id(&versions_dir, &artifact, &nf_version)?;

    let version_json_path = versions_dir
        .join(&version_id)
        .join(format!("{}.json", version_id));

    let content = std::fs::read_to_string(&version_json_path)
        .map_err(|e| format!("Failed to read NeoForge version JSON: {}", e))?;

    let installer_profile: InstallerProfile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse NeoForge version JSON: {}", e))?;

    let profile = profile_from_installer(installer_profile);

    let profile_json = serde_json::to_string_pretty(&profile)
        .map_err(|e| format!("Failed to serialize NeoForge profile: {}", e))?;
    std::fs::write(&version_json_path, profile_json)
        .map_err(|e| format!("Failed to write NeoForge version JSON: {}", e))?;

    Ok((nf_version, profile))
}

fn find_neoforge_version_id(
    versions_dir: &Path,
    artifact: &str,
    nf_version: &str,
) -> Result<String, String> {
    if !versions_dir.exists() {
        return Err("NeoForge installer did not create a versions directory".to_string());
    }

    let expected_patterns: Vec<String> = if artifact == "forge" {
        vec![
            format!("{}-{}", nf_version, artifact),
            nf_version.to_string(),
        ]
    } else {
        vec![
            format!("{}-{}", artifact, nf_version),
            nf_version.to_string(),
        ]
    };

    let entries = std::fs::read_dir(versions_dir)
        .map_err(|e| format!("Failed to read versions directory: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        if name.contains("neoforge") || name.contains("forge") {
            let json_path = entry.path().join(format!("{}.json", name));
            if json_path.exists() {
                return Ok(name);
            }
        }
    }

    for pattern in &expected_patterns {
        let dir = versions_dir.join(pattern);
        let json = dir.join(format!("{}.json", pattern));
        if json.exists() {
            return Ok(pattern.clone());
        }
    }

    Err(format!(
        "Could not find NeoForge version directory in {:?}. Contents: {:?}",
        versions_dir,
        std::fs::read_dir(versions_dir)
            .ok()
            .map(|entries| entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect::<Vec<_>>())
            .unwrap_or_default()
    ))
}
