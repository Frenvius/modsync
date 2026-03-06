use serde::{Deserialize, Serialize};

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "ModSync/0.1.0 (https://github.com/Frenvius/modpack-sync)";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub id: String,
    #[serde(default)]
    pub team: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Version {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub dependencies: Vec<Dependency>,
    pub date_published: String,
    #[serde(default)]
    pub files: Vec<VersionFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionFile {
    pub url: String,
    pub filename: String,
    pub hashes: FileHashes,
    pub size: u64,
    pub primary: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileHashes {
    pub sha1: String,
    pub sha512: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Dependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub file_name: Option<String>,
    pub dependency_type: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamMember {
    pub user: TeamUser,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamUser {
    pub username: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModrinthMod {
    pub slug: String,
    pub title: String,
    pub description: String,
    pub categories: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub project_type: String,
    pub downloads: i64,
    pub icon_url: Option<String>,
    pub author: String,
    pub versions: Vec<String>,
    pub follows: i64,
    pub date_created: String,
    pub date_modified: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub thunderstore_community: Option<String>,
    #[serde(default)]
    pub thunderstore_full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchHit {
    slug: String,
    title: String,
    description: String,
    categories: Vec<String>,
    client_side: String,
    server_side: String,
    project_type: String,
    downloads: i64,
    icon_url: Option<String>,
    author: String,
    versions: Vec<String>,
    follows: i64,
    date_created: String,
    date_modified: String,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
    offset: i32,
    limit: i32,
    total_hits: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchParams {
    pub query: Option<String>,
    pub facets: Option<String>,
    pub index: Option<String>,
    pub offset: Option<i32>,
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub mods: Vec<ModrinthMod>,
    pub total_hits: i32,
    pub offset: i32,
    pub limit: i32,
}

pub async fn search_mods(params: SearchParams) -> Result<SearchResult, String> {
    let client = reqwest::Client::new();

    let mut url = format!("{}/search", MODRINTH_API_BASE);
    let mut query_params = vec![];

    if let Some(ref query) = params.query {
        if !query.is_empty() {
            query_params.push(format!("query={}", urlencoding::encode(query)));
        }
    }

    let mut facets = vec![];
    facets.push(r#"["project_type:mod"]"#.to_string());

    if let Some(ref custom_facets) = params.facets {
        if !custom_facets.is_empty() {
            facets.push(custom_facets.clone());
        }
    }

    if !facets.is_empty() {
        query_params.push(format!("facets=[{}]", facets.join(",")));
    }

    if let Some(index) = params.index {
        query_params.push(format!("index={}", index));
    }

    if let Some(offset) = params.offset {
        query_params.push(format!("offset={}", offset));
    }

    let limit = params.limit.unwrap_or(20);
    query_params.push(format!("limit={}", limit));

    if !query_params.is_empty() {
        url = format!("{}?{}", url, query_params.join("&"));
    }

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let search_response: SearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mods = search_response
        .hits
        .into_iter()
        .map(|hit| ModrinthMod {
            slug: hit.slug,
            title: hit.title,
            description: hit.description,
            categories: hit.categories,
            client_side: hit.client_side,
            server_side: hit.server_side,
            project_type: hit.project_type,
            downloads: hit.downloads,
            icon_url: hit.icon_url,
            author: hit.author,
            versions: hit.versions,
            follows: hit.follows,
            date_created: hit.date_created,
            date_modified: hit.date_modified,
            source: Some("modrinth".to_string()),
            thunderstore_community: None,
            thunderstore_full_name: None,
        })
        .collect();

    Ok(SearchResult {
        mods,
        total_hits: search_response.total_hits,
        offset: search_response.offset,
        limit: search_response.limit,
    })
}

pub async fn get_categories() -> Result<Vec<Category>, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/tag/category", MODRINTH_API_BASE);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let categories: Vec<Category> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(categories
        .into_iter()
        .filter(|c| c.project_type == "mod")
        .collect())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Category {
    pub icon: String,
    pub name: String,
    pub project_type: String,
    pub header: String,
}

pub async fn get_loaders() -> Result<Vec<Loader>, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/tag/loader", MODRINTH_API_BASE);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let loaders: Vec<Loader> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(loaders)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Loader {
    pub icon: String,
    pub name: String,
    pub supported_project_types: Vec<String>,
}

pub async fn get_game_versions() -> Result<Vec<GameVersion>, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/tag/game_version", MODRINTH_API_BASE);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    let versions: Vec<GameVersion> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(versions
        .into_iter()
        .filter(|v| v.version_type == "release")
        .collect())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GameVersion {
    pub version: String,
    pub version_type: String,
    pub date: String,
    pub major: bool,
}

mod urlencoding {
    pub fn encode(input: &str) -> String {
        let mut encoded = String::new();
        for byte in input.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(byte as char);
                }
                _ => {
                    encoded.push_str(&format!("%{:02X}", byte));
                }
            }
        }
        encoded
    }
}

pub async fn get_project(id_or_slug: &str) -> Result<Project, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/project/{}", MODRINTH_API_BASE, id_or_slug);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

pub async fn get_project_versions(
    id_or_slug: &str,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<Version>, String> {
    let client = reqwest::Client::new();
    let mut url = format!("{}/project/{}/version", MODRINTH_API_BASE, id_or_slug);

    let mut query_params = vec![];
    if let Some(version) = game_version {
        query_params.push(format!("game_versions=[\"{}\"]", version));
    }
    if let Some(loader_name) = loader {
        query_params.push(format!("loaders=[\"{}\"]", loader_name));
    }

    if !query_params.is_empty() {
        url = format!("{}?{}", url, query_params.join("&"));
    }

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

pub async fn get_projects_batch(ids: &[String]) -> Result<Vec<Project>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let ids_json =
        serde_json::to_string(ids).map_err(|e| format!("Failed to serialize IDs: {}", e))?;
    let url = format!(
        "{}/projects?ids={}",
        MODRINTH_API_BASE,
        urlencoding::encode(&ids_json)
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

pub async fn get_project_team(project_id: &str) -> Result<Vec<TeamMember>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/project/{}/members", MODRINTH_API_BASE, project_id);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

pub async fn get_version(version_id: &str) -> Result<Version, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/version/{}", MODRINTH_API_BASE, version_id);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

pub async fn get_versions_batch(ids: &[String]) -> Result<Vec<Version>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let ids_json =
        serde_json::to_string(ids).map_err(|e| format!("Failed to serialize IDs: {}", e))?;
    let url = format!(
        "{}/versions?ids={}",
        MODRINTH_API_BASE,
        urlencoding::encode(&ids_json)
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}
