use std::{fs, path::Path};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::{
    catalog::{GameId, LoaderId, ProjectType, ProviderId},
    contracts::{CommandError, CommandErrorCode},
    persistence::atomic_write,
};

use super::{
    cache_directory, http, icon_color, project_id, Project, ProjectProviderInfo, ProjectVersion,
    ProviderCategories, ProviderSearchQuery, ProviderSearchResult, SearchSort, PAGE_SIZE,
};

const BASE_URL: &str = "https://mods.vintagestory.at/api";
const CACHE_SECONDS: i64 = 30 * 60;

#[derive(Clone, Deserialize, Serialize)]
struct ModSummary {
    modid: i64,
    #[serde(default)]
    downloads: Option<i64>,
    #[serde(default)]
    follows: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    urlalias: Option<String>,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    lastreleased: Option<String>,
}

#[derive(Deserialize)]
struct ModsResponse {
    mods: Vec<ModSummary>,
}

#[derive(Deserialize)]
struct DetailResponse {
    #[serde(rename = "mod")]
    item: ModDetail,
}

#[derive(Deserialize)]
struct ModDetail {
    modid: i64,
    #[serde(default)]
    downloads: Option<i64>,
    #[serde(default)]
    follows: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    urlalias: Option<String>,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default)]
    logofile: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    lastreleased: Option<String>,
    #[serde(default)]
    releases: Vec<Release>,
    #[serde(default)]
    screenshots: Vec<Screenshot>,
}

#[derive(Deserialize)]
struct Release {
    releaseid: i64,
    #[serde(default)]
    modversion: Option<String>,
    #[serde(default)]
    downloads: Option<i64>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    changelog: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct Screenshot {
    #[serde(default)]
    filename: Option<String>,
    #[serde(default)]
    thumbnailfilename: Option<String>,
}

#[derive(Deserialize)]
struct TagsResponse {
    tags: Vec<Tag>,
}

#[derive(Deserialize)]
struct GameVersionsResponse {
    gameversions: Vec<GameVersion>,
}

#[derive(Deserialize)]
struct GameVersion {
    tagid: i64,
    name: String,
}

#[derive(Deserialize)]
struct Tag {
    name: String,
}

#[derive(Deserialize, Serialize)]
struct ModCache {
    fetched_at: i64,
    items: Vec<ModSummary>,
}

pub async fn search(
    app: &AppHandle,
    query: ProviderSearchQuery,
) -> Result<ProviderSearchResult, CommandError> {
    let (mut items, stale) = match query.game_version.as_deref() {
        Some(version) => (summaries_for_version(version).await?, false),
        None => summaries(app).await?,
    };
    let needle = query.query.to_lowercase();
    items.retain(|item| {
        let name = item.name.as_deref().unwrap_or_default();
        let summary = item.summary.as_deref().unwrap_or_default();
        let author = item.author.as_deref().unwrap_or_default();
        (needle.is_empty()
            || name.to_lowercase().contains(&needle)
            || summary.to_lowercase().contains(&needle)
            || author.to_lowercase().contains(&needle))
            && query.category.as_ref().map_or(true, |category| {
                item.tags
                    .iter()
                    .any(|tag| tag.eq_ignore_ascii_case(category))
            })
    });
    match query.sort.unwrap_or(SearchSort::Relevance) {
        SearchSort::Downloads => {
            items.sort_by_key(|item| std::cmp::Reverse(item.downloads.unwrap_or(0)))
        }
        SearchSort::Newest | SearchSort::Updated => {
            items.sort_by(|left, right| right.lastreleased.cmp(&left.lastreleased))
        }
        SearchSort::Relevance => {}
    }
    let total = items.len();
    let start = query.page as usize * PAGE_SIZE;
    let items = items
        .into_iter()
        .skip(start)
        .take(PAGE_SIZE)
        .map(map_summary)
        .collect();
    Ok(ProviderSearchResult {
        items,
        total,
        stale,
    })
}

pub async fn project(external_id: &str) -> Result<Project, CommandError> {
    let detail = detail(external_id).await?;
    let latest_version = detail
        .releases
        .first()
        .and_then(|release| release.modversion.clone())
        .unwrap_or_default();
    let versions = detail
        .releases
        .iter()
        .flat_map(|release| release.tags.iter())
        .map(|tag| tag.trim_start_matches('v').to_string())
        .collect::<Vec<_>>();
    let external = detail.modid.to_string();
    Ok(Project {
        id: project_id(ProviderId::VintageStoryDb, &external),
        slug: detail.urlalias.clone().unwrap_or_else(|| external.clone()),
        name: detail.name.unwrap_or_default(),
        author: detail.author.unwrap_or_default(),
        game_id: GameId::VintageStory,
        summary: detail.summary.clone().unwrap_or_default(),
        icon_color: icon_color(
            detail
                .logo
                .as_deref()
                .or(detail.logofile.as_deref())
                .unwrap_or(&external),
        ),
        updated_at: normalize_date(detail.lastreleased.as_deref().unwrap_or_default()),
        downloads: detail.downloads.unwrap_or(0),
        followers: detail.follows.unwrap_or(0),
        r#type: ProjectType::Mod,
        description: strip_html(
            detail
                .text
                .as_deref()
                .or(detail.summary.as_deref())
                .unwrap_or_default(),
        ),
        latest_version,
        gallery: detail
            .screenshots
            .into_iter()
            .filter_map(|screenshot| screenshot.thumbnailfilename.or(screenshot.filename))
            .map(|filename| asset_url(&filename))
            .collect(),
        loaders: vec![LoaderId::Vanilla],
        categories: detail.tags,
        game_versions: unique(versions),
        provider: ProjectProviderInfo {
            id: ProviderId::VintageStoryDb,
            url: format!("https://mods.vintagestory.at/show/mod/{external}"),
            external_id: external,
        },
    })
}

pub async fn versions(external_id: &str) -> Result<Vec<ProjectVersion>, CommandError> {
    let detail = detail(external_id).await?;
    let project = project_id(ProviderId::VintageStoryDb, detail.modid);
    Ok(detail
        .releases
        .into_iter()
        .map(|release| ProjectVersion {
            id: release.releaseid.to_string(),
            name: release.modversion.clone().unwrap_or_default(),
            number: release.modversion.unwrap_or_default(),
            file_size: 0,
            downloads: release.downloads.unwrap_or(0),
            changelog: strip_html(release.changelog.as_deref().unwrap_or_default()),
            project_id: project.clone(),
            published_at: normalize_date(release.created.as_deref().unwrap_or_default()),
            loaders: vec![LoaderId::Vanilla],
            game_versions: release
                .tags
                .into_iter()
                .map(|tag| tag.trim_start_matches('v').to_string())
                .collect(),
            dependencies: Vec::new(),
        })
        .collect())
}

pub async fn categories(app: &AppHandle) -> Result<ProviderCategories, CommandError> {
    let request = http::client()?.get(format!("{BASE_URL}/tags"));
    match http::get_json::<TagsResponse>(request).await {
        Ok(response) => {
            let mut items = response
                .tags
                .into_iter()
                .map(|tag| tag.name)
                .collect::<Vec<_>>();
            items.sort();
            Ok(ProviderCategories {
                items,
                stale: false,
            })
        }
        Err(error) => {
            let (items, stale) = summaries(app).await?;
            if !stale {
                return Err(error);
            }
            let mut categories = items
                .into_iter()
                .flat_map(|item| item.tags)
                .collect::<Vec<_>>();
            categories.sort();
            categories.dedup();
            Ok(ProviderCategories {
                items: categories,
                stale: true,
            })
        }
    }
}

async fn summaries_for_version(version: &str) -> Result<Vec<ModSummary>, CommandError> {
    let versions: GameVersionsResponse =
        http::get_json(http::client()?.get(format!("{BASE_URL}/gameversions"))).await?;
    let Some(tag_id) = versions
        .gameversions
        .into_iter()
        .find(|item| item.name == version)
        .map(|item| item.tagid)
    else {
        return Ok(Vec::new());
    };
    let response: ModsResponse = http::get_json(
        http::client()?
            .get(format!("{BASE_URL}/mods"))
            .query(&[("gameversion", tag_id.to_string())]),
    )
    .await?;
    Ok(response.mods)
}

async fn detail(external_id: &str) -> Result<ModDetail, CommandError> {
    let response: DetailResponse =
        http::get_json(http::client()?.get(format!("{BASE_URL}/mod/{external_id}"))).await?;
    Ok(response.item)
}

async fn summaries(app: &AppHandle) -> Result<(Vec<ModSummary>, bool), CommandError> {
    let path = cache_directory(app)?.join("vintagestory.json");
    let cached = read_cache(&path);
    if cached
        .as_ref()
        .is_some_and(|cache| chrono::Utc::now().timestamp() - cache.fetched_at < CACHE_SECONDS)
    {
        return Ok((cached.unwrap().items, false));
    }
    match http::get_json::<ModsResponse>(http::client()?.get(format!("{BASE_URL}/mods"))).await {
        Ok(response) => {
            write_cache(&path, &response.mods)?;
            Ok((response.mods, false))
        }
        Err(error) => cached.map_or(Err(error), |cache| Ok((cache.items, true))),
    }
}

fn read_cache(path: &Path) -> Option<ModCache> {
    fs::read(path)
        .ok()
        .and_then(|contents| serde_json::from_slice(&contents).ok())
}

fn write_cache(path: &Path, items: &[ModSummary]) -> Result<(), CommandError> {
    let contents = serde_json::to_vec(&ModCache {
        fetched_at: chrono::Utc::now().timestamp(),
        items: items.to_vec(),
    })
    .map_err(|error| CommandError {
        code: CommandErrorCode::CorruptedData,
        message: "Could not serialize Vintage Story cache".into(),
        retryable: false,
        details: Some(error.to_string()),
    })?;
    atomic_write(path, &contents)
        .map_err(|error| CommandError::io("Could not save Vintage Story cache", &error))
}

fn map_summary(item: ModSummary) -> Project {
    let external = item.modid.to_string();
    let summary = item.summary.unwrap_or_default();
    Project {
        id: project_id(ProviderId::VintageStoryDb, &external),
        slug: item.urlalias.unwrap_or_else(|| external.clone()),
        name: item.name.unwrap_or_default(),
        author: item.author.unwrap_or_default(),
        game_id: GameId::VintageStory,
        summary: summary.clone(),
        icon_color: icon_color(item.logo.as_deref().unwrap_or(&external)),
        updated_at: normalize_date(item.lastreleased.as_deref().unwrap_or_default()),
        downloads: item.downloads.unwrap_or(0),
        followers: item.follows.unwrap_or(0),
        r#type: ProjectType::Mod,
        description: summary,
        latest_version: String::new(),
        gallery: Vec::new(),
        loaders: vec![LoaderId::Vanilla],
        categories: item.tags,
        game_versions: Vec::new(),
        provider: ProjectProviderInfo {
            id: ProviderId::VintageStoryDb,
            url: format!("https://mods.vintagestory.at/show/mod/{external}"),
            external_id: external,
        },
    }
}

fn asset_url(value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        value.into()
    } else {
        format!("https://moddbcdn.vintagestory.at/{value}")
    }
}

fn normalize_date(value: &str) -> String {
    if value.is_empty() || value.contains('T') {
        value.into()
    } else {
        format!("{}Z", value.replace(' ', "T"))
    }
}

fn unique(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values.dedup();
    values
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
    #[ignore = "requires network access"]
    fn live_vintage_story_details_and_versions() {
        tauri::async_runtime::block_on(async {
            assert!(!project("11672").await.unwrap().description.is_empty());
            assert!(!versions("11672").await.unwrap().is_empty());
            assert!(!summaries_for_version("1.20.4").await.unwrap().is_empty());
        });
    }

    #[test]
    fn vintage_story_dates_are_normalized_for_the_frontend() {
        assert_eq!(
            normalize_date("2026-01-02 03:04:05"),
            "2026-01-02T03:04:05Z"
        );
    }
}
