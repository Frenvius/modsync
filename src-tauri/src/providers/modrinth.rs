use std::collections::HashMap;

use serde::Deserialize;

use crate::{
    catalog::{GameId, LoaderId, ProjectType, ProviderId},
    contracts::{CommandError, CommandErrorCode},
};

use super::{
    http, icon_color, project_id, safe_image_url, ArtifactHash, Dependency, DependencyType,
    HashAlgorithm, Project, ProjectProviderInfo, ProjectVersion, ProviderCategories,
    ProviderSearchQuery, ProviderSearchResult, SearchSort, PAGE_SIZE,
};

const BASE_URL: &str = "https://api.modrinth.com/v2";

#[derive(Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
    total_hits: usize,
}

#[derive(Deserialize)]
struct SearchHit {
    project_id: String,
    project_type: String,
    slug: String,
    author: String,
    title: String,
    description: String,
    categories: Vec<String>,
    versions: Vec<String>,
    downloads: i64,
    follows: i64,
    icon_url: Option<String>,
    date_modified: String,
    latest_version: String,
    #[serde(default)]
    gallery: Vec<String>,
}

#[derive(Deserialize)]
struct ApiProject {
    id: String,
    slug: String,
    title: String,
    description: String,
    body: String,
    project_type: String,
    downloads: i64,
    followers: i64,
    icon_url: Option<String>,
    updated: String,
    team: String,
    categories: Vec<String>,
    #[serde(default)]
    gallery: Vec<GalleryItem>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
}

#[derive(Deserialize)]
struct GalleryItem {
    url: String,
}

#[derive(Deserialize)]
struct TeamMember {
    user: TeamUser,
}

#[derive(Deserialize)]
struct TeamUser {
    username: String,
}

#[derive(Deserialize)]
struct ApiVersion {
    id: String,
    project_id: String,
    name: String,
    version_number: String,
    date_published: String,
    #[serde(default)]
    downloads: i64,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    dependencies: Vec<ApiDependency>,
    #[serde(default)]
    files: Vec<ApiFile>,
    changelog: Option<String>,
}

#[derive(Deserialize)]
struct ApiDependency {
    project_id: Option<String>,
    version_id: Option<String>,
    dependency_type: String,
}

#[derive(Deserialize)]
struct ApiFile {
    size: u64,
    primary: bool,
    url: String,
    filename: String,
    #[serde(default)]
    hashes: HashMap<String, String>,
}

#[derive(Deserialize)]
struct Category {
    name: String,
    project_type: String,
}

pub async fn search(query: ProviderSearchQuery) -> Result<ProviderSearchResult, CommandError> {
    let facets = search_facets(&query);
    let index = match query.sort.unwrap_or(SearchSort::Relevance) {
        SearchSort::Relevance => "relevance",
        SearchSort::Downloads => "downloads",
        SearchSort::Newest => "newest",
        SearchSort::Updated => "updated",
    };
    let response: SearchResponse =
        http::get_json(http::client()?.get(format!("{BASE_URL}/search")).query(&[
            ("query", query.query),
            ("facets", facets),
            ("index", index.into()),
            ("offset", (query.page as usize * PAGE_SIZE).to_string()),
            ("limit", PAGE_SIZE.to_string()),
        ]))
        .await?;

    let version_ids = response
        .hits
        .iter()
        .map(|hit| hit.latest_version.clone())
        .collect::<Vec<_>>();
    let latest_versions = if version_ids.is_empty() {
        Vec::new()
    } else {
        let ids = serde_json::to_string(&version_ids).map_err(invalid_response)?;
        http::get_json::<Vec<ApiVersion>>(
            http::client()?
                .get(format!("{BASE_URL}/versions"))
                .query(&[("ids", ids)]),
        )
        .await
        .unwrap_or_default()
    };

    let items = response
        .hits
        .into_iter()
        .map(|hit| {
            let latest = latest_versions
                .iter()
                .find(|version| version.id == hit.latest_version)
                .map(|version| version.version_number.clone())
                .unwrap_or_default();
            search_project(hit, latest)
        })
        .collect();

    Ok(ProviderSearchResult {
        items,
        total: response.total_hits,
        stale: false,
    })
}

pub async fn project(external_id: &str) -> Result<Project, CommandError> {
    let project: ApiProject =
        http::get_json(http::client()?.get(format!("{BASE_URL}/project/{external_id}"))).await?;
    let members: Vec<TeamMember> =
        http::get_json(http::client()?.get(format!("{BASE_URL}/team/{}/members", project.team)))
            .await
            .unwrap_or_default();
    let author = members
        .first()
        .map(|member| member.user.username.clone())
        .unwrap_or_default();
    let icon_url = safe_image_url(project.icon_url.as_deref());

    Ok(Project {
        id: project_id(ProviderId::Modrinth, &project.id),
        slug: project.slug,
        name: project.title,
        author,
        game_id: GameId::Minecraft,
        summary: project.description,
        icon_color: icon_color(project.icon_url.as_deref().unwrap_or(&project.id)),
        icon_url,
        updated_at: project.updated,
        downloads: project.downloads,
        followers: project.followers,
        r#type: project_type(&project.project_type),
        description: project.body,
        latest_version: String::new(),
        gallery: project.gallery.into_iter().map(|item| item.url).collect(),
        loaders: loaders(&project.loaders),
        categories: project.categories,
        game_versions: project.game_versions,
        provider: ProjectProviderInfo {
            id: ProviderId::Modrinth,
            url: format!(
                "https://modrinth.com/{}/{external_id}",
                project.project_type
            ),
            external_id: project.id,
        },
    })
}

pub async fn versions(external_id: &str) -> Result<Vec<ProjectVersion>, CommandError> {
    let versions: Vec<ApiVersion> =
        http::get_json(http::client()?.get(format!("{BASE_URL}/project/{external_id}/version")))
            .await?;
    Ok(versions.into_iter().map(map_version).collect())
}

pub async fn categories() -> Result<ProviderCategories, CommandError> {
    let categories: Vec<Category> =
        http::get_json(http::client()?.get(format!("{BASE_URL}/tag/category"))).await?;
    let mut items = categories
        .into_iter()
        .filter(|category| {
            matches!(
                category.project_type.as_str(),
                "mod" | "shader" | "resourcepack"
            )
        })
        .map(|category| category.name)
        .collect::<Vec<_>>();
    items.sort();
    items.dedup();
    Ok(ProviderCategories {
        items,
        stale: false,
    })
}

fn search_facets(query: &ProviderSearchQuery) -> String {
    let project_types = if query.loader == Some(LoaderId::Vanilla) {
        vec![
            "project_type:shader".to_string(),
            "project_type:resourcepack".to_string(),
            "project_type:datapack".to_string(),
        ]
    } else {
        vec![
            "project_type:mod".to_string(),
            "project_type:shader".to_string(),
            "project_type:resourcepack".to_string(),
            "project_type:datapack".to_string(),
        ]
    };
    let mut facets = vec![project_types];
    if let Some(version) = &query.game_version {
        facets.push(vec![format!("versions:{version}")]);
    }
    if let Some(loader) = query.loader {
        if loader != LoaderId::Vanilla {
            facets.push(vec![format!("categories:{}", loader_name(loader))]);
        }
    }
    if let Some(category) = &query.category {
        facets.push(vec![format!("categories:{}", category.to_lowercase())]);
    }
    serde_json::to_string(&facets).unwrap_or_else(|_| "[]".into())
}

fn search_project(hit: SearchHit, latest_version: String) -> Project {
    let loaders = loaders(&hit.categories);
    let icon_url = safe_image_url(hit.icon_url.as_deref());
    Project {
        id: project_id(ProviderId::Modrinth, &hit.project_id),
        slug: hit.slug.clone(),
        name: hit.title,
        author: hit.author,
        game_id: GameId::Minecraft,
        summary: hit.description.clone(),
        icon_color: icon_color(hit.icon_url.as_deref().unwrap_or(&hit.project_id)),
        icon_url,
        updated_at: hit.date_modified,
        downloads: hit.downloads,
        followers: hit.follows,
        r#type: project_type(&hit.project_type),
        description: hit.description,
        latest_version,
        gallery: hit.gallery,
        loaders,
        categories: content_categories(hit.categories),
        game_versions: hit.versions,
        provider: ProjectProviderInfo {
            id: ProviderId::Modrinth,
            url: format!("https://modrinth.com/{}/{}", hit.project_type, hit.slug),
            external_id: hit.project_id,
        },
    }
}

fn map_version(version: ApiVersion) -> ProjectVersion {
    let file = version
        .files
        .iter()
        .find(|file| file.primary)
        .or_else(|| version.files.first());
    let file_size = file.map_or(0, |file| file.size);
    let download_url = file.map_or_else(String::new, |file| file.url.clone());
    let file_name = file.map_or_else(String::new, |file| file.filename.clone());
    let hashes = file
        .into_iter()
        .flat_map(|file| &file.hashes)
        .filter_map(|(algorithm, value)| {
            let algorithm = match algorithm.as_str() {
                "sha512" => HashAlgorithm::Sha512,
                "sha1" => HashAlgorithm::Sha1,
                _ => return None,
            };
            Some(ArtifactHash {
                algorithm,
                value: value.clone(),
            })
        })
        .collect();
    ProjectVersion {
        id: version.id,
        name: version.name,
        number: version.version_number,
        file_size,
        downloads: version.downloads,
        changelog: version.changelog.unwrap_or_default(),
        project_id: project_id(ProviderId::Modrinth, version.project_id),
        published_at: version.date_published,
        loaders: loaders(&version.loaders),
        game_versions: version.game_versions,
        dependencies: version
            .dependencies
            .into_iter()
            .filter_map(|dependency| {
                let external_id = dependency.project_id?;
                Some(Dependency {
                    name: external_id.clone(),
                    project_id: project_id(ProviderId::Modrinth, external_id),
                    r#type: match dependency.dependency_type.as_str() {
                        "optional" => DependencyType::Optional,
                        "incompatible" => DependencyType::Incompatible,
                        _ => DependencyType::Required,
                    },
                    version_range: dependency.version_id,
                })
            })
            .collect(),
        download_url,
        file_name,
        hashes,
    }
}

fn content_categories(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .filter(|value| !matches!(value.as_str(), "fabric" | "forge" | "neoforge" | "quilt"))
        .collect()
}

fn loaders(values: &[String]) -> Vec<LoaderId> {
    values
        .iter()
        .filter_map(|value| match value.as_str() {
            "fabric" => Some(LoaderId::Fabric),
            "forge" => Some(LoaderId::Forge),
            "neoforge" => Some(LoaderId::NeoForge),
            _ => None,
        })
        .collect()
}

fn loader_name(loader: LoaderId) -> &'static str {
    match loader {
        LoaderId::Fabric => "fabric",
        LoaderId::Forge => "forge",
        LoaderId::NeoForge => "neoforge",
        LoaderId::Vanilla => "minecraft",
        LoaderId::BepInEx => "bepinex",
    }
}

fn project_type(value: &str) -> ProjectType {
    match value {
        "shader" => ProjectType::ShaderPack,
        "resourcepack" => ProjectType::ResourcePack,
        "datapack" => ProjectType::DataPack,
        _ => ProjectType::Mod,
    }
}

fn invalid_response(error: serde_json::Error) -> CommandError {
    CommandError {
        code: CommandErrorCode::ProviderUnavailable,
        message: "Provider returned invalid project data".into(),
        retryable: false,
        details: Some(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires network access"]
    fn live_modrinth_search_and_details() {
        tauri::async_runtime::block_on(async {
            let result = search(ProviderSearchQuery {
                provider_id: ProviderId::Modrinth,
                game_id: GameId::Minecraft,
                query: "sodium".into(),
                page: 0,
                loader: Some(LoaderId::Fabric),
                sort: Some(SearchSort::Relevance),
                category: None,
                game_version: Some("1.21.4".into()),
            })
            .await
            .unwrap();
            let item = result.items.first().unwrap();
            let versions = versions(&item.provider.external_id).await.unwrap();
            assert!(versions.first().is_some_and(
                |version| !version.download_url.is_empty() && !version.hashes.is_empty()
            ));
            assert!(!project(&item.provider.external_id)
                .await
                .unwrap()
                .description
                .is_empty());
        });
    }

    #[test]
    fn modrinth_version_maps_supported_loaders_and_dependencies() {
        let version: ApiVersion = serde_json::from_str(
            r#"{"id":"v1","project_id":"p1","name":"Release","version_number":"1.0","date_published":"2026-01-01T00:00:00Z","downloads":4,"game_versions":["1.21.4"],"loaders":["fabric","quilt"],"dependencies":[{"project_id":"dep","dependency_type":"required"}],"files":[{"size":12,"primary":true,"url":"https://example.com/mod.jar","filename":"mod.jar","hashes":{"sha512":"abc"}}],"changelog":"Fixed"}"#,
        )
        .unwrap();
        let mapped = map_version(version);
        assert_eq!(mapped.loaders, vec![LoaderId::Fabric]);
        assert_eq!(mapped.dependencies[0].project_id, "modrinth:dep");
    }
}
