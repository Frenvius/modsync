use crate::http::HTTP_CLIENT;
use crate::modrinth;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const CFWIDGET_API: &str = "https://api.cfwidget.com";
const FORGECDN_BASE: &str = "https://edge.forgecdn.net/files";
const CF_API_BASE: &str = "https://api.curseforge.com/v1";
const CF_API_KEY: &str = "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEJQnPnm";

#[derive(Debug, Deserialize)]
pub struct CfProject {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub description: String,
    pub game: String,
    pub thumbnail: String,
    pub created_at: String,
    pub downloads: CfDownloads,
    pub categories: Vec<String>,
    pub members: Vec<CfMember>,
    pub files: Vec<CfFile>,
    pub versions: HashMap<String, Vec<CfFile>>,
    pub urls: CfUrls,
}

#[derive(Debug, Deserialize)]
pub struct CfDownloads {
    pub monthly: i64,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct CfMember {
    pub title: String,
    pub username: String,
    pub id: i64,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct CfFile {
    pub id: i64,
    pub url: String,
    pub display: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub version: String,
    pub filesize: i64,
    pub versions: Vec<String>,
    pub downloads: i64,
    pub uploaded_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CfUrls {
    pub curseforge: String,
    pub project: String,
}

#[derive(Debug, Deserialize)]
struct CfApiResponse {
    data: Vec<CfApiMod>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfApiMod {
    id: i64,
    name: String,
    slug: String,
    summary: String,
    download_count: i64,
    logo: Option<CfApiLogo>,
    authors: Vec<CfApiAuthor>,
    categories: Vec<CfApiCategory>,
    date_created: String,
    date_modified: String,
}

#[derive(Debug, Deserialize)]
struct CfApiLogo {
    url: String,
}

#[derive(Debug, Deserialize)]
struct CfApiAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CfApiCategory {
    name: String,
    class_id: Option<i64>,
}

fn loader_to_cf_type(loader: &str) -> Option<i32> {
    match loader {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

fn cf_api_mod_to_modrinth(m: &CfApiMod) -> modrinth::ModrinthMod {
    let author = m.authors.first().map(|a| a.name.clone()).unwrap_or_default();
    let categories: Vec<String> = m
        .categories
        .iter()
        .filter(|c| c.class_id != Some(6))
        .map(|c| c.name.clone())
        .collect();

    modrinth::ModrinthMod {
        slug: m.slug.clone(),
        title: m.name.clone(),
        description: m.summary.clone(),
        categories,
        client_side: "required".to_string(),
        server_side: "optional".to_string(),
        project_type: "mod".to_string(),
        downloads: m.download_count,
        icon_url: m.logo.as_ref().map(|l| l.url.clone()),
        author,
        versions: vec![],
        follows: 0,
        date_created: m.date_created.clone(),
        date_modified: m.date_modified.clone(),
        source: Some("curseforge".to_string()),
        thunderstore_community: None,
        thunderstore_full_name: None,
        is_deprecated: false,
    }
}

pub async fn search_cf_api(
    query: Option<&str>,
    game_version: Option<&str>,
    loader: Option<&str>,
    limit: Option<i32>,
) -> Result<Vec<modrinth::ModrinthMod>, String> {
    let mut params = vec![
        "gameId=432".to_string(),
        "classId=6".to_string(),
        "sortField=2".to_string(),
        "sortOrder=desc".to_string(),
        format!("pageSize={}", limit.unwrap_or(10)),
    ];

    if let Some(q) = query {
        if !q.is_empty() {
            params.push(format!(
                "searchFilter={}",
                url_encode(q)
            ));
        }
    }

    if let Some(gv) = game_version {
        if !gv.is_empty() {
            params.push(format!("gameVersion={}", gv));
        }
    }

    if let Some(l) = loader {
        if let Some(loader_type) = loader_to_cf_type(l) {
            params.push(format!("modLoaderType={}", loader_type));
        }
    }

    let url = format!("{}/mods/search?{}", CF_API_BASE, params.join("&"));
    eprintln!("[curseforge] CF API search: {}", url);

    let response = HTTP_CLIENT
        .get(&url)
        .header("x-api-key", CF_API_KEY)
        .send()
        .await
        .map_err(|e| format!("CF API search failed: {}", e))?;

    if !response.status().is_success() {
        eprintln!("[curseforge] CF API search error: {}", response.status());
        return Ok(vec![]);
    }

    let result: CfApiResponse = response
        .json()
        .await
        .map_err(|e| format!("CF API parse error: {}", e))?;

    Ok(result.data.iter().map(cf_api_mod_to_modrinth).collect())
}

async fn resolve_project_id_by_slug(slug: &str) -> Result<Option<i64>, String> {
    let url = format!(
        "{}/mods/search?gameId=432&classId=6&slug={}",
        CF_API_BASE, slug
    );

    let response = HTTP_CLIENT
        .get(&url)
        .header("x-api-key", CF_API_KEY)
        .send()
        .await
        .map_err(|e| format!("CF API request failed: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let result: CfApiResponse = response
        .json()
        .await
        .map_err(|e| format!("CF API parse error: {}", e))?;

    Ok(result
        .data
        .iter()
        .find(|m| m.slug == slug)
        .map(|m| m.id))
}

pub fn construct_cdn_url(file_id: i64, file_name: &str) -> String {
    let id_str = file_id.to_string();
    let (first, rest) = id_str.split_at(4);
    format!("{}/{}/{}/{}", FORGECDN_BASE, first, rest, file_name)
}

pub fn extract_slug_from_url(url: &str) -> Option<String> {
    let url = url.trim().trim_end_matches('/');

    if let Some(rest) = url
        .strip_prefix("https://www.curseforge.com/minecraft/mc-mods/")
        .or_else(|| url.strip_prefix("http://www.curseforge.com/minecraft/mc-mods/"))
        .or_else(|| url.strip_prefix("https://curseforge.com/minecraft/mc-mods/"))
        .or_else(|| url.strip_prefix("curseforge.com/minecraft/mc-mods/"))
    {
        let slug = rest.split('/').next().unwrap_or(rest);
        if !slug.is_empty() {
            return Some(slug.to_string());
        }
    }

    None
}

async fn get_project_by_id_or_slug(id_or_slug: &str) -> Result<CfProject, String> {
    let url = format!("{}/{}", CFWIDGET_API, id_or_slug);
    eprintln!("[curseforge] fetching: {}", url);

    for attempt in 0..2 {
        let response = HTTP_CLIENT
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("CFWidget request failed: {}", e))?;

        let status = response.status();
        eprintln!("[curseforge] status: {} (attempt {})", status, attempt + 1);

        if status.as_u16() == 202 {
            if attempt == 0 {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                continue;
            }
            return Err("queued".to_string());
        }

        if status.as_u16() == 404 {
            return Err("not_found".to_string());
        }

        if !status.is_success() {
            return Err(format!("CFWidget error: {}", status));
        }

        return response
            .json::<CfProject>()
            .await
            .map_err(|e| format!("Failed to parse CFWidget response: {}", e));
    }

    Err("queued".to_string())
}

pub async fn get_project(slug: &str) -> Result<CfProject, String> {
    let slug = slug.to_lowercase();
    eprintln!("[curseforge] get_project: '{}'", slug);

    if let Some(project_id) = resolve_project_id_by_slug(&slug).await? {
        eprintln!("[curseforge] CF API resolved '{}' -> id {}", slug, project_id);
        return get_project_by_id_or_slug(&project_id.to_string()).await;
    }

    eprintln!("[curseforge] CF API found nothing for '{}', trying cfwidget", slug);
    let path = format!("minecraft/mc-mods/{}", slug);
    get_project_by_id_or_slug(&path).await
}

pub async fn resolve_from_url(url: &str) -> Result<modrinth::ModrinthMod, String> {
    let slug = extract_slug_from_url(url).or_else(|| {
        let trimmed = url.trim().trim_end_matches('/');
        if !trimmed.contains('/') && !trimmed.contains(' ') && !trimmed.is_empty() {
            Some(trimmed.to_string())
        } else {
            None
        }
    })
    .ok_or_else(|| "Invalid CurseForge URL or slug. Paste a curseforge.com link or just the mod slug (e.g. alexs-delight)".to_string())?;

    eprintln!("[curseforge] resolve_from_url: '{}' -> slug='{}'", url, slug);
    let project = get_project(&slug).await?;
    Ok(project_to_modrinth_mod(&project, &slug))
}

fn loader_filter_names(loader: Option<&str>) -> Vec<String> {
    match loader {
        Some("neoforge") => vec!["NeoForge".to_string(), "Forge".to_string()],
        Some(l) if !l.is_empty() => vec![capitalize_first(l)],
        _ => vec![],
    }
}

fn filter_files_by_loaders(
    files: &[CfFile],
    loader_names: &[String],
    project_id: i64,
) -> Vec<modrinth::Version> {
    files
        .iter()
        .filter(|f| {
            if loader_names.is_empty() {
                return true;
            }
            f.versions
                .iter()
                .any(|v| loader_names.iter().any(|ln| v.eq_ignore_ascii_case(ln)))
        })
        .map(|f| cf_file_to_version(f, project_id))
        .collect()
}

pub fn get_project_versions_filtered(
    project: &CfProject,
    game_version: Option<&str>,
    loader: Option<&str>,
    additional_loaders: Option<&[String]>,
) -> Vec<modrinth::Version> {
    let files = if let Some(gv) = game_version {
        project.versions.get(gv).cloned().unwrap_or_default()
    } else {
        project.files.clone()
    };

    let primary = loader_filter_names(loader);
    let result = filter_files_by_loaders(&files, &primary, project.id);

    if !result.is_empty() || primary.is_empty() {
        return result;
    }

    if let Some(extra) = additional_loaders {
        let fallback: Vec<String> = extra.iter().flat_map(|l| loader_filter_names(Some(l))).collect();
        if !fallback.is_empty() {
            return filter_files_by_loaders(&files, &fallback, project.id);
        }
    }

    result
}

fn project_to_modrinth_mod(project: &CfProject, slug: &str) -> modrinth::ModrinthMod {
    let author = project
        .members
        .iter()
        .find(|m| m.title == "Owner")
        .map(|m| m.username.clone())
        .unwrap_or_else(|| {
            project
                .members
                .first()
                .map(|m| m.username.clone())
                .unwrap_or_default()
        });

    modrinth::ModrinthMod {
        slug: slug.to_string(),
        title: project.title.clone(),
        description: project.summary.clone(),
        categories: project.categories.clone(),
        client_side: "required".to_string(),
        server_side: "optional".to_string(),
        project_type: "mod".to_string(),
        downloads: project.downloads.total,
        icon_url: Some(project.thumbnail.clone()),
        author,
        versions: vec![],
        follows: 0,
        date_created: project.created_at.clone(),
        date_modified: project.created_at.clone(),
        source: Some("curseforge".to_string()),
        thunderstore_community: None,
        thunderstore_full_name: None,
        is_deprecated: false,
    }
}

fn cf_file_to_version(file: &CfFile, project_id: i64) -> modrinth::Version {
    let loaders: Vec<String> = file
        .versions
        .iter()
        .filter(|v| {
            let lower = v.to_lowercase();
            matches!(
                lower.as_str(),
                "forge" | "neoforge" | "fabric" | "quilt"
            )
        })
        .map(|v| v.to_lowercase())
        .collect();

    let game_versions: Vec<String> = file
        .versions
        .iter()
        .filter(|v| {
            let lower = v.to_lowercase();
            !matches!(
                lower.as_str(),
                "forge" | "neoforge" | "fabric" | "quilt" | "client" | "server"
            )
        })
        .cloned()
        .collect();

    modrinth::Version {
        id: file.id.to_string(),
        project_id: project_id.to_string(),
        name: file.display.clone(),
        version_number: file.display.clone(),
        game_versions,
        loaders,
        dependencies: vec![],
        date_published: file.uploaded_at.clone(),
        files: vec![modrinth::VersionFile {
            url: construct_cdn_url(file.id, &file.name),
            filename: file.name.clone(),
            hashes: modrinth::FileHashes {
                sha1: String::new(),
                sha512: String::new(),
            },
            size: file.filesize as u64,
            primary: true,
        }],
    }
}

fn url_encode(input: &str) -> String {
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

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}
