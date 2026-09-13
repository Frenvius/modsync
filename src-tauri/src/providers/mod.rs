mod curseforge;
pub(crate) mod http;
mod modrinth;
mod thunderstore;
mod vintage_story;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{
    catalog::{GameId, LoaderId, ProjectType, ProviderId},
    contracts::{CommandError, CommandErrorCode},
};

const PAGE_SIZE: usize = 20;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchSort {
    Relevance,
    Downloads,
    Newest,
    Updated,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSearchQuery {
    pub provider_id: ProviderId,
    pub game_id: GameId,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub page: u32,
    pub loader: Option<LoaderId>,
    pub sort: Option<SearchSort>,
    pub category: Option<String>,
    pub game_version: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectProviderInfo {
    pub id: ProviderId,
    pub url: String,
    pub external_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub author: String,
    pub game_id: GameId,
    pub summary: String,
    pub icon_color: String,
    pub updated_at: String,
    pub downloads: i64,
    pub followers: i64,
    pub r#type: ProjectType,
    pub description: String,
    pub latest_version: String,
    pub gallery: Vec<String>,
    pub loaders: Vec<LoaderId>,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub provider: ProjectProviderInfo,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DependencyType {
    Optional,
    Required,
    Incompatible,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub project_id: String,
    pub r#type: DependencyType,
    pub version_range: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HashAlgorithm {
    Md5,
    Sha1,
    Sha512,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactHash {
    pub algorithm: HashAlgorithm,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectVersion {
    pub id: String,
    pub name: String,
    pub number: String,
    pub file_size: u64,
    pub downloads: i64,
    pub changelog: String,
    pub project_id: String,
    pub published_at: String,
    pub loaders: Vec<LoaderId>,
    pub game_versions: Vec<String>,
    pub dependencies: Vec<Dependency>,
    pub download_url: String,
    pub file_name: String,
    pub hashes: Vec<ArtifactHash>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSearchResult {
    pub items: Vec<Project>,
    pub total: usize,
    pub stale: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCategories {
    pub items: Vec<String>,
    pub stale: bool,
}

#[tauri::command]
pub async fn search_provider(
    app: AppHandle,
    query: ProviderSearchQuery,
) -> Result<ProviderSearchResult, CommandError> {
    validate_game_provider(query.game_id, query.provider_id)?;
    validate_query(&query)?;
    match query.provider_id {
        ProviderId::Modrinth => modrinth::search(query).await,
        ProviderId::CurseForge => curseforge::search(query).await,
        ProviderId::Thunderstore => thunderstore::search(&app, query).await,
        ProviderId::VintageStoryDb => vintage_story::search(&app, query).await,
        ProviderId::Local => Err(local_provider_error()),
    }
}

#[tauri::command]
pub async fn get_provider_project(
    app: AppHandle,
    provider_id: ProviderId,
    project_id: String,
) -> Result<Project, CommandError> {
    let external_id = external_id(provider_id, &project_id)?;
    match provider_id {
        ProviderId::Modrinth => modrinth::project(external_id).await,
        ProviderId::CurseForge => curseforge::project(external_id).await,
        ProviderId::Thunderstore => thunderstore::project(&app, external_id).await,
        ProviderId::VintageStoryDb => vintage_story::project(external_id).await,
        ProviderId::Local => Err(local_provider_error()),
    }
}

#[tauri::command]
pub async fn get_provider_versions(
    app: AppHandle,
    provider_id: ProviderId,
    project_id: String,
) -> Result<Vec<ProjectVersion>, CommandError> {
    let external_id = external_id(provider_id, &project_id)?;
    match provider_id {
        ProviderId::Modrinth => modrinth::versions(external_id).await,
        ProviderId::CurseForge => curseforge::versions(external_id).await,
        ProviderId::Thunderstore => thunderstore::versions(&app, external_id).await,
        ProviderId::VintageStoryDb => vintage_story::versions(external_id).await,
        ProviderId::Local => Err(local_provider_error()),
    }
}

pub(crate) async fn resolve_project(
    app: &AppHandle,
    project_id: &str,
) -> Result<Project, CommandError> {
    let provider_id = project_provider(project_id)?;
    let external_id = external_id(provider_id, project_id)?;
    match provider_id {
        ProviderId::Modrinth => modrinth::project(external_id).await,
        ProviderId::CurseForge => curseforge::project(external_id).await,
        ProviderId::Thunderstore => thunderstore::project(app, external_id).await,
        ProviderId::VintageStoryDb => vintage_story::project(external_id).await,
        ProviderId::Local => Err(local_provider_error()),
    }
}

pub(crate) async fn resolve_versions(
    app: &AppHandle,
    project_id: &str,
) -> Result<Vec<ProjectVersion>, CommandError> {
    let provider_id = project_provider(project_id)?;
    let external_id = external_id(provider_id, project_id)?;
    let versions = match provider_id {
        ProviderId::Modrinth => modrinth::versions(external_id).await?,
        ProviderId::CurseForge => curseforge::versions(external_id).await?,
        ProviderId::Thunderstore => thunderstore::versions(app, external_id).await?,
        ProviderId::VintageStoryDb => vintage_story::versions(external_id).await?,
        ProviderId::Local => return Err(local_provider_error()),
    };
    Ok(versions)
}

pub(crate) async fn resolve_download_url(
    project_id: &str,
    version: &mut ProjectVersion,
) -> Result<(), CommandError> {
    if !version.download_url.is_empty() {
        return Ok(());
    }
    let provider = project_provider(project_id)?;
    let external_id = external_id(provider, project_id)?;
    if provider == ProviderId::CurseForge {
        version.download_url = curseforge::download_url(external_id, &version.id).await?;
    }
    if version.download_url.is_empty() {
        return Err(CommandError::new(
            CommandErrorCode::ProviderUnavailable,
            "Provider did not supply a download URL",
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_provider_categories(
    app: AppHandle,
    provider_id: ProviderId,
    game_id: GameId,
) -> Result<ProviderCategories, CommandError> {
    validate_game_provider(game_id, provider_id)?;
    match provider_id {
        ProviderId::Modrinth => modrinth::categories().await,
        ProviderId::CurseForge => curseforge::categories().await,
        ProviderId::Thunderstore => thunderstore::categories(&app, game_id).await,
        ProviderId::VintageStoryDb => vintage_story::categories(&app).await,
        ProviderId::Local => Err(local_provider_error()),
    }
}

fn validate_query(query: &ProviderSearchQuery) -> Result<(), CommandError> {
    if query.query.len() > 200
        || query
            .category
            .as_ref()
            .is_some_and(|value| value.len() > 100)
        || query
            .game_version
            .as_ref()
            .is_some_and(|value| value.len() > 50)
        || query.page > 1_000
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Provider search parameters exceed the allowed limits",
        ));
    }
    Ok(())
}

fn validate_game_provider(game_id: GameId, provider_id: ProviderId) -> Result<(), CommandError> {
    let valid = matches!(
        (game_id, provider_id),
        (
            GameId::Minecraft,
            ProviderId::Modrinth | ProviderId::CurseForge
        ) | (
            GameId::Valheim | GameId::LethalCompany,
            ProviderId::Thunderstore
        ) | (GameId::VintageStory, ProviderId::VintageStoryDb)
    );
    if valid {
        Ok(())
    } else {
        Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Provider does not support the selected game",
        ))
    }
}

fn external_id(provider_id: ProviderId, project_id: &str) -> Result<&str, CommandError> {
    let prefix = format!("{}:", provider_name(provider_id));
    let external_id = project_id.strip_prefix(&prefix).ok_or_else(|| {
        CommandError::new(
            CommandErrorCode::InvalidInput,
            "Project identifier does not match its provider",
        )
    })?;
    if external_id.is_empty()
        || external_id.len() > 200
        || !external_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':')
        })
    {
        return Err(CommandError::new(
            CommandErrorCode::InvalidInput,
            "Project identifier contains invalid characters",
        ));
    }
    Ok(external_id)
}

fn project_provider(project_id: &str) -> Result<ProviderId, CommandError> {
    [
        ProviderId::Modrinth,
        ProviderId::CurseForge,
        ProviderId::Thunderstore,
        ProviderId::VintageStoryDb,
    ]
    .into_iter()
    .find(|provider| project_id.starts_with(&format!("{}:", provider_name(*provider))))
    .ok_or_else(|| CommandError::new(CommandErrorCode::InvalidInput, "Unknown project provider"))
}

fn provider_name(provider_id: ProviderId) -> &'static str {
    match provider_id {
        ProviderId::Modrinth => "modrinth",
        ProviderId::CurseForge => "curseforge",
        ProviderId::Thunderstore => "thunderstore",
        ProviderId::VintageStoryDb => "vintagestory",
        ProviderId::Local => "local",
    }
}

fn local_provider_error() -> CommandError {
    CommandError::new(
        CommandErrorCode::InvalidInput,
        "Local content is not available through provider discovery",
    )
}

fn project_id(provider_id: ProviderId, external_id: impl std::fmt::Display) -> String {
    format!("{}:{external_id}", provider_name(provider_id))
}

fn safe_url(value: Option<&str>, fallback: String) -> String {
    value
        .and_then(|candidate| reqwest::Url::parse(candidate).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .map_or(fallback, |url| url.into())
}

fn icon_color(value: &str) -> String {
    let hash = value.bytes().fold(2_166_136_261_u32, |hash, byte| {
        (hash ^ u32::from(byte)).wrapping_mul(16_777_619)
    });
    format!("#{:06x}", hash & 0x00ff_ffff)
}

fn cache_directory(app: &AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("providers"))
        .map_err(|error| CommandError {
            code: CommandErrorCode::Io,
            message: "Could not resolve the provider cache directory".into(),
            retryable: false,
            details: Some(error.to_string()),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_project_ids_are_namespaced_and_validated() {
        let id = project_id(ProviderId::Modrinth, "abc");
        assert_eq!(external_id(ProviderId::Modrinth, &id).unwrap(), "abc");
        assert!(external_id(ProviderId::CurseForge, &id).is_err());
    }
}
