use std::{fs, io::Read, path::Path, sync::OnceLock};

use flate2::read::GzDecoder;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    catalog::{GameId, LoaderId, ProjectType, ProviderId},
    contracts::{CommandError, CommandErrorCode},
    persistence::atomic_write,
};

use super::{
    cache_directory, http, icon_color, project_id, safe_image_url, safe_url, Dependency,
    DependencyType, Project, ProjectProviderInfo, ProjectVersion, ProviderCategories,
    ProviderSearchQuery, ProviderSearchResult, SearchSort, PAGE_SIZE,
};

const BASE_URL: &str = "https://thunderstore.io";
const CACHE_SECONDS: i64 = 30 * 60;
const MAX_CHUNK_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
struct Package {
    name: String,
    full_name: String,
    owner: String,
    #[serde(default)]
    is_deprecated: bool,
    #[serde(default)]
    categories: Vec<String>,
    date_updated: String,
    #[serde(default)]
    rating_score: i64,
    #[serde(default)]
    versions: Vec<PackageVersion>,
}

#[derive(Clone, Deserialize, Serialize)]
struct PackageVersion {
    full_name: String,
    description: String,
    version_number: String,
    #[serde(default)]
    dependencies: Vec<String>,
    #[serde(default)]
    downloads: i64,
    download_url: String,
    #[serde(default)]
    website_url: Option<String>,
    #[serde(default)]
    is_active: bool,
    date_created: String,
    #[serde(default)]
    file_size: Option<u64>,
    #[serde(default)]
    icon: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct IndexCache {
    fetched_at: i64,
    urls: Vec<String>,
}

#[derive(Deserialize, Serialize)]
struct ProjectCache {
    fetched_at: i64,
    items: Vec<Project>,
}

pub async fn search(
    app: &AppHandle,
    query: ProviderSearchQuery,
) -> Result<ProviderSearchResult, CommandError> {
    let community = community(query.game_id)?;
    let needle = query.query.to_lowercase();
    let category = query.category.clone();
    let (mut items, stale) = projects(app, community).await?;
    items.retain(|project| {
        (needle.is_empty()
            || project.name.to_lowercase().contains(&needle)
            || project.author.to_lowercase().contains(&needle)
            || project.summary.to_lowercase().contains(&needle))
            && category.as_ref().map_or(true, |category| {
                project
                    .categories
                    .iter()
                    .any(|item| item.eq_ignore_ascii_case(category))
            })
    });
    match query.sort.unwrap_or(SearchSort::Relevance) {
        SearchSort::Downloads | SearchSort::Relevance => {
            items.sort_by_key(|project| std::cmp::Reverse(project.downloads))
        }
        SearchSort::Newest | SearchSort::Updated => {
            items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at))
        }
    }
    let total = items.len();
    let start = query.page as usize * PAGE_SIZE;
    let items = items.into_iter().skip(start).take(PAGE_SIZE).collect();
    Ok(ProviderSearchResult {
        items,
        total,
        stale,
    })
}

pub async fn project(app: &AppHandle, external_id: &str) -> Result<Project, CommandError> {
    let (community, owner, name) = split_id(external_id)?;
    let (items, _) = projects(app, community).await?;
    items
        .into_iter()
        .find(|project| project.author == owner && project.slug == name)
        .ok_or_else(|| {
            CommandError::new(CommandErrorCode::NotFound, "Thunderstore package not found")
        })
}

pub async fn versions(
    app: &AppHandle,
    external_id: &str,
) -> Result<Vec<ProjectVersion>, CommandError> {
    let (community, owner, name) = split_id(external_id)?;
    let (items, _) = scan(app, community, |package| {
        (package.owner == owner && package.name == name).then(|| {
            package
                .versions
                .into_iter()
                .filter(|version| version.is_active)
                .map(|version| map_version(community, &owner, &name, version))
                .collect::<Vec<_>>()
        })
    })
    .await?;
    items.into_iter().next().ok_or_else(|| {
        CommandError::new(CommandErrorCode::NotFound, "Thunderstore package not found")
    })
}

pub async fn categories(
    app: &AppHandle,
    game_id: GameId,
) -> Result<ProviderCategories, CommandError> {
    let (projects, stale) = projects(app, community(game_id)?).await?;
    let mut items = projects
        .into_iter()
        .flat_map(|project| project.categories)
        .collect::<Vec<_>>();
    items.sort();
    items.dedup();
    Ok(ProviderCategories { items, stale })
}

async fn projects(app: &AppHandle, community: &str) -> Result<(Vec<Project>, bool), CommandError> {
    let path = cache_directory(app)?
        .join(format!("thunderstore-{community}"))
        .join("projects-v2.json");
    let cached = fs::read(&path)
        .ok()
        .and_then(|contents| serde_json::from_slice::<ProjectCache>(&contents).ok());
    if cached
        .as_ref()
        .is_some_and(|cache| chrono::Utc::now().timestamp() - cache.fetched_at < CACHE_SECONDS)
    {
        return Ok((cached.unwrap().items, false));
    }
    match scan(app, community, |package| {
        (!package.is_deprecated)
            .then(|| map_project(community, package))
            .flatten()
    })
    .await
    {
        Ok((items, stale)) => {
            if !stale {
                let contents = serde_json::to_vec(&ProjectCache {
                    fetched_at: chrono::Utc::now().timestamp(),
                    items: items.clone(),
                })
                .map_err(cache_serialization_error)?;
                atomic_write(&path, &contents).map_err(|error| {
                    CommandError::io("Could not save Thunderstore search cache", &error)
                })?;
            }
            Ok((items, stale))
        }
        Err(error) => cached.map_or(Err(error), |cache| Ok((cache.items, true))),
    }
}

async fn scan<R, F>(
    app: &AppHandle,
    community: &str,
    mut map: F,
) -> Result<(Vec<R>, bool), CommandError>
where
    F: FnMut(Package) -> Option<R>,
{
    static SCAN_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    let lock = SCAN_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = lock.lock().await;
    let cache = cache_directory(app)?.join(format!("thunderstore-{community}"));
    let (urls, stale) = index_urls(&cache, community).await?;
    let mut output = Vec::new();
    for url in urls {
        let packages = chunk_packages(&cache, &url).await?;
        output.extend(packages.into_iter().filter_map(&mut map));
    }
    Ok((output, stale))
}

async fn index_urls(cache: &Path, community: &str) -> Result<(Vec<String>, bool), CommandError> {
    let path = cache.join("index.json");
    let cached = fs::read(&path)
        .ok()
        .and_then(|contents| serde_json::from_slice::<IndexCache>(&contents).ok());
    if cached
        .as_ref()
        .is_some_and(|index| chrono::Utc::now().timestamp() - index.fetched_at < CACHE_SECONDS)
    {
        return Ok((cached.unwrap().urls, false));
    }

    let request = http::client()?.get(format!(
        "{BASE_URL}/c/{community}/api/v1/package-listing-index/"
    ));
    match http::get_bytes(request)
        .await
        .and_then(|bytes| decode_gzip_json::<Vec<String>>(&bytes))
    {
        Ok(urls) => {
            let contents = serde_json::to_vec(&IndexCache {
                fetched_at: chrono::Utc::now().timestamp(),
                urls: urls.clone(),
            })
            .map_err(cache_serialization_error)?;
            atomic_write(&path, &contents)
                .map_err(|error| CommandError::io("Could not save Thunderstore index", &error))?;
            Ok((urls, false))
        }
        Err(error) => cached.map_or(Err(error), |index| Ok((index.urls, true))),
    }
}

async fn chunk_packages(cache: &Path, url: &str) -> Result<Vec<Package>, CommandError> {
    let path = cache
        .join("chunks")
        .join(format!("{:016x}.json.gz", hash(url)));
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(packages) = decode_gzip_json(&bytes) {
            return Ok(packages);
        }
        let _ = fs::remove_file(&path);
    }
    let bytes = http::get_bytes(http::client()?.get(url)).await?;
    let packages = decode_gzip_json(&bytes)?;
    atomic_write(&path, &bytes)
        .map_err(|error| CommandError::io("Could not save Thunderstore package cache", &error))?;
    Ok(packages)
}

fn decode_gzip_json<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, CommandError> {
    let mut decoder = GzDecoder::new(bytes).take(MAX_CHUNK_BYTES + 1);
    let mut decoded = Vec::new();
    decoder
        .read_to_end(&mut decoded)
        .map_err(|error| CommandError {
            code: CommandErrorCode::CorruptedData,
            message: "Could not decompress Thunderstore data".into(),
            retryable: false,
            details: Some(error.to_string()),
        })?;
    if decoded.len() as u64 > MAX_CHUNK_BYTES {
        return Err(CommandError::new(
            CommandErrorCode::ProviderUnavailable,
            "Thunderstore package chunk exceeded the safe size limit",
        ));
    }
    serde_json::from_slice(&decoded).map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Thunderstore returned invalid package data".into(),
        retryable: false,
        details: Some(error.to_string()),
    })
}

fn cache_serialization_error(error: serde_json::Error) -> CommandError {
    CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize Thunderstore cache".into(),
        retryable: false,
        details: Some(error.to_string()),
    }
}

fn map_project(community: &str, package: Package) -> Option<Project> {
    let latest = package.latest()?.clone();
    let downloads = package.downloads();
    let external_id = format!("{community}:{}:{}", package.owner, package.name);
    let icon_url = safe_image_url(latest.icon.as_deref());
    Some(Project {
        id: project_id(ProviderId::Thunderstore, &external_id),
        slug: package.name.clone(),
        name: package.name.clone(),
        author: package.owner.clone(),
        game_id: game(community),
        summary: latest.description.clone(),
        icon_color: icon_color(latest.icon.as_deref().unwrap_or(&package.full_name)),
        icon_url,
        updated_at: package.date_updated,
        downloads,
        followers: package.rating_score,
        r#type: ProjectType::Mod,
        description: latest.description,
        latest_version: latest.version_number,
        gallery: Vec::new(),
        loaders: vec![LoaderId::BepInEx],
        categories: package.categories,
        game_versions: Vec::new(),
        provider: ProjectProviderInfo {
            id: ProviderId::Thunderstore,
            url: safe_url(
                latest.website_url.as_deref(),
                format!(
                    "{BASE_URL}/c/{community}/p/{}/{}/",
                    package.owner, package.name
                ),
            ),
            external_id,
        },
    })
}

fn map_version(
    community: &str,
    owner: &str,
    name: &str,
    version: PackageVersion,
) -> ProjectVersion {
    ProjectVersion {
        id: version.full_name,
        name: format!("{name} {}", version.version_number),
        number: version.version_number.clone(),
        file_size: version.file_size.unwrap_or(0),
        downloads: version.downloads,
        changelog: String::new(),
        project_id: project_id(
            ProviderId::Thunderstore,
            format!("{community}:{owner}:{name}"),
        ),
        published_at: version.date_created,
        loaders: vec![LoaderId::BepInEx],
        game_versions: Vec::new(),
        dependencies: version
            .dependencies
            .into_iter()
            .filter_map(|dependency| dependency_project(community, &dependency))
            .collect(),
        file_name: format!("{name}-{}.zip", version.version_number),
        download_url: version.download_url,
        hashes: Vec::new(),
    }
}

fn dependency_project(community: &str, value: &str) -> Option<Dependency> {
    let mut parts = value.splitn(3, '-');
    let owner = parts.next()?;
    let name = parts.next()?;
    let version = parts.next().map(str::to_owned);
    Some(Dependency {
        name: name.into(),
        project_id: project_id(
            ProviderId::Thunderstore,
            format!("{community}:{owner}:{name}"),
        ),
        r#type: DependencyType::Required,
        version_range: version,
    })
}

fn split_id(value: &str) -> Result<(&str, String, String), CommandError> {
    let mut parts = value.splitn(3, ':');
    let community = parts.next().unwrap_or_default();
    let owner = parts.next().unwrap_or_default();
    let name = parts.next().unwrap_or_default();
    if community.is_empty() || owner.is_empty() || name.is_empty() {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Invalid Thunderstore package identifier",
        ));
    }
    Ok((community, owner.into(), name.into()))
}

fn community(game_id: GameId) -> Result<&'static str, CommandError> {
    match game_id {
        GameId::Valheim => Ok("valheim"),
        GameId::LethalCompany => Ok("lethal-company"),
        _ => Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Thunderstore does not support the selected game",
        )),
    }
}

fn game(community: &str) -> GameId {
    if community == "valheim" {
        GameId::Valheim
    } else {
        GameId::LethalCompany
    }
}

fn hash(value: &str) -> u64 {
    value
        .bytes()
        .fold(14_695_981_039_346_656_037, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(1_099_511_628_211)
        })
}

impl Package {
    fn latest(&self) -> Option<&PackageVersion> {
        self.versions.iter().find(|version| version.is_active)
    }

    fn downloads(&self) -> i64 {
        self.versions.iter().map(|version| version.downloads).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires network access"]
    fn live_thunderstore_index_parses() {
        tauri::async_runtime::block_on(async {
            let bytes = http::get_bytes(http::client().unwrap().get(format!(
                "{BASE_URL}/c/valheim/api/v1/package-listing-index/"
            )))
            .await
            .unwrap();
            let urls: Vec<String> = decode_gzip_json(&bytes).unwrap();
            let chunk = http::get_bytes(http::client().unwrap().get(&urls[0]))
                .await
                .unwrap();
            let packages: Vec<Package> = decode_gzip_json(&chunk).unwrap();
            assert!(packages.iter().any(|package| package
                .latest()
                .is_some_and(|version| !version.download_url.is_empty())));
            assert!(packages
                .into_iter()
                .filter_map(|package| map_project("valheim", package))
                .any(|project| project.icon_url.is_some()));
        });
    }

    #[test]
    fn thunderstore_dependency_is_namespaced_to_community() {
        let dependency =
            dependency_project("valheim", "denikson-BepInExPack_Valheim-5.4.2202").unwrap();
        assert_eq!(
            dependency.project_id,
            "thunderstore:valheim:denikson:BepInExPack_Valheim"
        );
    }
}
