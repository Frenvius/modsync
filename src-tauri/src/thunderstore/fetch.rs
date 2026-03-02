use reqwest::Client;
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;

use super::models::{PackageListing, PackageInfo, PackageSearchOptions, SearchResult, SortBy, ThunderstoreGame};

const CACHE_DURATION: Duration = Duration::from_secs(300);

static PACKAGE_CACHE: Lazy<RwLock<HashMap<ThunderstoreGame, CacheEntry>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

struct CacheEntry {
    packages: Vec<PackageListing>,
    fetched_at: Instant,
}

impl CacheEntry {
    fn is_valid(&self) -> bool {
        self.fetched_at.elapsed() < CACHE_DURATION
    }
}

fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(180))
        .connect_timeout(Duration::from_secs(30))
        .tcp_keepalive(Duration::from_secs(30))
        .gzip(true)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

async fn fetch_with_retry<F, Fut, T>(max_retries: u32, operation: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut last_error = String::new();
    for attempt in 0..=max_retries {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(1 << (attempt - 1))).await;
        }
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => last_error = e,
        }
    }
    Err(last_error)
}

pub async fn fetch_packages(game: &ThunderstoreGame) -> Result<Vec<PackageListing>, String> {
    {
        let cache = PACKAGE_CACHE.read().map_err(|e| e.to_string())?;
        if let Some(entry) = cache.get(game) {
            if entry.is_valid() {
                return Ok(entry.packages.clone());
            }
        }
    }

    let client = create_client()?;
    let url = format!(
        "https://thunderstore.io/c/{}/api/v1/package/",
        game.api_name()
    );

    let packages: Vec<PackageListing> = fetch_with_retry(2, || {
        let client = client.clone();
        let url = url.clone();
        async move {
            let response = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Failed to fetch packages: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Thunderstore API error: {}", response.status()));
            }

            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Failed to read response: {}", e))?;

            let json_str = String::from_utf8(bytes.to_vec())
                .map_err(|e| format!("Invalid UTF-8 response: {}", e))?;

            serde_json::from_str(&json_str)
                .map_err(|e| format!("Failed to parse packages: {}", e))
        }
    })
    .await?;

    {
        let mut cache = PACKAGE_CACHE.write().map_err(|e| e.to_string())?;
        cache.insert(game.clone(), CacheEntry {
            packages: packages.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(packages)
}

pub async fn search_packages(
    game: &ThunderstoreGame,
    options: &PackageSearchOptions,
) -> Result<SearchResult, String> {
    let all_packages = fetch_packages(game).await?;

    let filtered: Vec<PackageInfo> = all_packages
        .iter()
        .filter(|p| {
            if !options.include_deprecated && p.is_deprecated {
                return false;
            }

            if !options.include_nsfw && p.has_nsfw_content {
                return false;
            }

            if let Some(ref cat) = options.category {
                if !p.categories.iter().any(|c| c.eq_ignore_ascii_case(cat)) {
                    return false;
                }
            }

            if let Some(ref query) = options.query {
                let query_lower = query.to_lowercase();
                let name_match = p.name.to_lowercase().contains(&query_lower);
                let owner_match = p.owner.to_lowercase().contains(&query_lower);
                let desc_match = p.latest_version()
                    .map(|v| v.description.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);

                if !name_match && !owner_match && !desc_match {
                    return false;
                }
            }

            true
        })
        .map(PackageInfo::from)
        .collect();

    let mut sorted = filtered;
    match options.sort_by {
        SortBy::LastUpdated => {
            sorted.sort_by(|a, b| b.date_updated.cmp(&a.date_updated));
        }
        SortBy::Downloads => {
            sorted.sort_by(|a, b| b.downloads.cmp(&a.downloads));
        }
        SortBy::Rating => {
            sorted.sort_by(|a, b| b.rating.cmp(&a.rating));
        }
        SortBy::Name => {
            sorted.sort_by(|a, b| a.name.cmp(&b.name));
        }
    }

    let total_count = sorted.len();
    let page_size = options.page_size.max(1).min(100);
    let total_pages = (total_count + page_size - 1) / page_size;
    let page = options.page.min(total_pages.saturating_sub(1));

    let start = page * page_size;
    let end = (start + page_size).min(total_count);
    let packages = if start < total_count {
        sorted[start..end].to_vec()
    } else {
        vec![]
    };

    Ok(SearchResult {
        packages,
        total_count,
        page,
        page_size,
        total_pages,
    })
}

pub fn clear_package_cache() {
    if let Ok(mut cache) = PACKAGE_CACHE.write() {
        cache.clear();
    }
}

pub async fn get_package(
    game: &ThunderstoreGame,
    full_name: &str,
) -> Result<Option<PackageListing>, String> {
    let packages = fetch_packages(game).await?;
    Ok(packages.into_iter().find(|p| p.full_name == full_name))
}

pub async fn get_categories(game: &ThunderstoreGame) -> Result<Vec<String>, String> {
    let packages = fetch_packages(game).await?;

    let mut categories: Vec<String> = packages
        .iter()
        .flat_map(|p| p.categories.iter().cloned())
        .collect();

    categories.sort();
    categories.dedup();

    Ok(categories)
}

pub async fn fetch_package_readme(namespace: &str, name: &str, version: &str) -> Result<Option<String>, String> {
    let client = create_client()?;
    let url = format!(
        "https://thunderstore.io/api/experimental/package/{}/{}/{}/readme/",
        namespace, name, version
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch README: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse README response: {}", e))?;

    Ok(json.get("markdown").and_then(|v| v.as_str()).map(|s| s.to_string()))
}

pub async fn fetch_package_changelog(namespace: &str, name: &str, version: &str) -> Result<Option<String>, String> {
    let client = create_client()?;
    let url = format!(
        "https://thunderstore.io/api/experimental/package/{}/{}/{}/changelog/",
        namespace, name, version
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch changelog: {}", e))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse changelog response: {}", e))?;

    Ok(json.get("markdown").and_then(|v| v.as_str()).map(|s| s.to_string()))
}

pub async fn get_packages_bulk(
    game: &ThunderstoreGame,
    full_names: &[String],
) -> Result<HashMap<String, PackageInfo>, String> {
    let packages = fetch_packages(game).await?;

    let requested_map: std::collections::HashMap<String, &String> =
        full_names.iter().map(|s| (s.to_lowercase(), s)).collect();

    let result: HashMap<String, PackageInfo> = packages
        .iter()
        .filter_map(|p| {
            let lower = p.full_name.to_lowercase();
            requested_map.get(&lower).map(|original_id| {
                ((*original_id).clone(), PackageInfo::from(p))
            })
        })
        .collect();

    Ok(result)
}
