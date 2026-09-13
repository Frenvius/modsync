use serde::Deserialize;

use crate::{
    catalog::{GameId, LoaderId, ProjectType, ProviderId},
    contracts::{CommandError, CommandErrorCode},
};

use super::{
    http, icon_color, project_id, safe_url, Dependency, DependencyType, Project,
    ProjectProviderInfo, ProjectVersion, ProviderCategories, ProviderSearchQuery,
    ProviderSearchResult, SearchSort, PAGE_SIZE,
};

const BASE_URL: &str = "https://api.curseforge.com/v1";

#[derive(Deserialize)]
struct ApiResponse<T> {
    data: T,
    pagination: Option<Pagination>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pagination {
    total_count: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiMod {
    id: i64,
    name: String,
    slug: String,
    summary: String,
    download_count: i64,
    date_modified: String,
    #[serde(default)]
    authors: Vec<Author>,
    #[serde(default)]
    categories: Vec<Category>,
    logo: Option<Logo>,
    links: Links,
    #[serde(default)]
    latest_files: Vec<ApiFile>,
}

#[derive(Deserialize)]
struct Author {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Category {
    id: i64,
    name: String,
    class_id: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Logo {
    thumbnail_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Links {
    website_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiFile {
    id: i64,
    mod_id: i64,
    display_name: String,
    file_name: String,
    file_length: u64,
    download_count: i64,
    file_date: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    dependencies: Vec<ApiDependency>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiDependency {
    mod_id: i64,
    relation_type: u8,
}

pub async fn search(query: ProviderSearchQuery) -> Result<ProviderSearchResult, CommandError> {
    let api_key = api_key()?;
    let mut params = vec![
        ("gameId", "432".into()),
        ("classId", "6".into()),
        ("pageSize", PAGE_SIZE.to_string()),
        ("index", (query.page as usize * PAGE_SIZE).to_string()),
        ("sortOrder", "desc".into()),
        (
            "sortField",
            match query.sort.unwrap_or(SearchSort::Relevance) {
                SearchSort::Relevance => "2",
                SearchSort::Downloads => "6",
                SearchSort::Newest => "11",
                SearchSort::Updated => "3",
            }
            .into(),
        ),
    ];
    if !query.query.is_empty() {
        params.push(("searchFilter", query.query));
    }
    if let Some(version) = query.game_version {
        params.push(("gameVersion", version));
    }
    if let Some(loader) = query.loader.and_then(loader_type) {
        params.push(("modLoaderType", loader.to_string()));
    }
    if let Some(category) = query.category {
        if let Some(id) = category_id(&api_key, &category).await? {
            params.push(("categoryId", id.to_string()));
        } else {
            return Ok(ProviderSearchResult {
                items: Vec::new(),
                total: 0,
                stale: false,
            });
        }
    }

    let response: ApiResponse<Vec<ApiMod>> = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/mods/search"))
            .header("x-api-key", api_key)
            .query(&params),
    )
    .await?;
    Ok(ProviderSearchResult {
        total: response
            .pagination
            .map_or(0, |pagination| pagination.total_count),
        items: response.data.into_iter().map(map_project).collect(),
        stale: false,
    })
}

pub async fn project(external_id: &str) -> Result<Project, CommandError> {
    let api_key = api_key()?;
    let response: ApiResponse<ApiMod> = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/mods/{external_id}"))
            .header("x-api-key", &api_key),
    )
    .await?;
    let description: ApiResponse<String> = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/mods/{external_id}/description"))
            .header("x-api-key", api_key),
    )
    .await
    .unwrap_or(ApiResponse {
        data: response.data.summary.clone(),
        pagination: None,
    });
    let mut project = map_project(response.data);
    project.description = strip_html(&description.data);
    Ok(project)
}

pub async fn versions(external_id: &str) -> Result<Vec<ProjectVersion>, CommandError> {
    let response: ApiResponse<Vec<ApiFile>> = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/mods/{external_id}/files"))
            .header("x-api-key", api_key()?)
            .query(&[("pageSize", "50")]),
    )
    .await?;
    Ok(response.data.into_iter().map(map_version).collect())
}

pub async fn categories() -> Result<ProviderCategories, CommandError> {
    let mut items = category_data(&api_key()?)
        .await?
        .into_iter()
        .filter(|category| category.class_id == Some(6))
        .map(|category| category.name)
        .collect::<Vec<_>>();
    items.sort();
    items.dedup();
    Ok(ProviderCategories {
        items,
        stale: false,
    })
}

async fn category_id(api_key: &str, name: &str) -> Result<Option<i64>, CommandError> {
    Ok(category_data(api_key)
        .await?
        .into_iter()
        .find(|category| category.class_id == Some(6) && category.name.eq_ignore_ascii_case(name))
        .map(|category| category.id))
}

async fn category_data(api_key: &str) -> Result<Vec<Category>, CommandError> {
    let response: ApiResponse<Vec<Category>> = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/categories"))
            .header("x-api-key", api_key)
            .query(&[("gameId", "432"), ("classId", "6")]),
    )
    .await?;
    Ok(response.data)
}

fn map_project(project: ApiMod) -> Project {
    let latest = project.latest_files.first();
    let provider_url = safe_url(
        Some(&project.links.website_url),
        format!(
            "https://www.curseforge.com/minecraft/mc-mods/{}",
            project.slug
        ),
    );
    let game_versions = latest
        .map(|file| minecraft_versions(&file.game_versions))
        .unwrap_or_default();
    let loaders = latest
        .map(|file| loaders(&file.game_versions))
        .unwrap_or_default();
    Project {
        id: project_id(ProviderId::CurseForge, project.id),
        slug: project.slug,
        name: project.name,
        author: project
            .authors
            .first()
            .map(|author| author.name.clone())
            .unwrap_or_default(),
        game_id: GameId::Minecraft,
        summary: project.summary.clone(),
        icon_color: icon_color(
            project
                .logo
                .as_ref()
                .map_or(&project.summary, |logo| &logo.thumbnail_url),
        ),
        updated_at: project.date_modified,
        downloads: project.download_count,
        followers: 0,
        r#type: ProjectType::Mod,
        description: project.summary,
        latest_version: latest
            .map(|file| file.display_name.clone())
            .unwrap_or_default(),
        gallery: Vec::new(),
        loaders,
        categories: project
            .categories
            .into_iter()
            .map(|category| category.name)
            .collect(),
        game_versions,
        provider: ProjectProviderInfo {
            id: ProviderId::CurseForge,
            url: provider_url,
            external_id: project.id.to_string(),
        },
    }
}

fn map_version(file: ApiFile) -> ProjectVersion {
    ProjectVersion {
        id: file.id.to_string(),
        name: file.display_name.clone(),
        number: file.display_name,
        file_size: file.file_length,
        downloads: file.download_count,
        changelog: file.file_name,
        project_id: project_id(ProviderId::CurseForge, file.mod_id),
        published_at: file.file_date,
        loaders: loaders(&file.game_versions),
        game_versions: minecraft_versions(&file.game_versions),
        dependencies: file
            .dependencies
            .into_iter()
            .filter_map(|dependency| {
                let r#type = match dependency.relation_type {
                    2 => DependencyType::Optional,
                    3 => DependencyType::Required,
                    5 => DependencyType::Incompatible,
                    _ => return None,
                };
                Some(Dependency {
                    name: dependency.mod_id.to_string(),
                    project_id: project_id(ProviderId::CurseForge, dependency.mod_id),
                    r#type,
                    version_range: None,
                })
            })
            .collect(),
    }
}

fn loaders(values: &[String]) -> Vec<LoaderId> {
    values
        .iter()
        .filter_map(|value| match value.to_lowercase().as_str() {
            "fabric" => Some(LoaderId::Fabric),
            "forge" => Some(LoaderId::Forge),
            "neoforge" => Some(LoaderId::NeoForge),
            _ => None,
        })
        .collect()
}

fn minecraft_versions(values: &[String]) -> Vec<String> {
    values
        .iter()
        .filter(|value| {
            value
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_digit())
        })
        .cloned()
        .collect()
}

fn loader_type(loader: LoaderId) -> Option<u8> {
    match loader {
        LoaderId::Forge => Some(1),
        LoaderId::Fabric => Some(4),
        LoaderId::NeoForge => Some(6),
        LoaderId::Vanilla | LoaderId::BepInEx => None,
    }
}

fn api_key() -> Result<String, CommandError> {
    std::env::var("CURSEFORGE_API_KEY")
        .ok()
        .or_else(|| option_env!("CURSEFORGE_API_KEY").map(str::to_owned))
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| {
            CommandError::new(
                CommandErrorCode::ProviderUnavailable,
                "CurseForge requires a CURSEFORGE_API_KEY build or runtime setting",
            )
        })
}

fn strip_html(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curseforge_file_splits_versions_loaders_and_dependencies() {
        let file: ApiFile = serde_json::from_str(
            r#"{"id":1,"modId":2,"displayName":"Release","fileName":"mod.jar","fileLength":12,"downloadCount":4,"fileDate":"2026-01-01T00:00:00Z","gameVersions":["1.21.4","Fabric"],"dependencies":[{"modId":3,"relationType":3}]}"#,
        )
        .unwrap();
        let mapped = map_version(file);
        assert_eq!(mapped.game_versions, vec!["1.21.4"]);
        assert_eq!(mapped.loaders, vec![LoaderId::Fabric]);
        assert_eq!(mapped.dependencies[0].project_id, "curseforge:3");
    }
}
