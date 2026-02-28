use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageVersion {
    pub name: String,
    pub full_name: String,
    pub description: String,
    pub icon: String,
    pub version_number: String,
    pub dependencies: Vec<String>,
    pub download_url: String,
    pub downloads: u64,
    pub date_created: String,
    pub website_url: Option<String>,
    pub is_active: bool,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageListing {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub package_url: String,
    pub date_created: String,
    pub date_updated: String,
    pub uuid4: String,
    pub rating_score: u32,
    pub is_pinned: bool,
    pub is_deprecated: bool,
    pub has_nsfw_content: bool,
    pub categories: Vec<String>,
    pub versions: Vec<PackageVersion>,
}

impl PackageListing {
    pub fn latest_version(&self) -> Option<&PackageVersion> {
        self.versions.first()
    }

    pub fn total_downloads(&self) -> u64 {
        self.versions.iter().map(|v| v.downloads).sum()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub description: String,
    pub icon: String,
    pub version: String,
    pub downloads: u64,
    pub rating: u32,
    pub is_deprecated: bool,
    pub categories: Vec<String>,
    pub date_updated: String,
    pub dependencies: Vec<String>,
}

impl From<&PackageListing> for PackageInfo {
    fn from(listing: &PackageListing) -> Self {
        let latest = listing.latest_version();
        Self {
            name: listing.name.clone(),
            full_name: listing.full_name.clone(),
            owner: listing.owner.clone(),
            description: latest.map(|v| v.description.clone()).unwrap_or_default(),
            icon: latest.map(|v| v.icon.clone()).unwrap_or_default(),
            version: latest.map(|v| v.version_number.clone()).unwrap_or_default(),
            downloads: listing.total_downloads(),
            rating: listing.rating_score,
            is_deprecated: listing.is_deprecated,
            categories: listing.categories.clone(),
            date_updated: listing.date_updated.clone(),
            dependencies: latest.map(|v| v.dependencies.clone()).unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PackageSearchOptions {
    pub query: Option<String>,
    pub category: Option<String>,
    pub include_deprecated: bool,
    pub include_nsfw: bool,
    pub sort_by: SortBy,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum SortBy {
    #[default]
    LastUpdated,
    Downloads,
    Rating,
    Name,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub packages: Vec<PackageInfo>,
    pub total_count: usize,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ThunderstoreGame {
    Valheim,
    LethalCompany,
    RiskOfRain2,
}

impl ThunderstoreGame {
    pub fn api_name(&self) -> &'static str {
        match self {
            Self::Valheim => "valheim",
            Self::LethalCompany => "lethal-company",
            Self::RiskOfRain2 => "ror2",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Valheim => "Valheim",
            Self::LethalCompany => "Lethal Company",
            Self::RiskOfRain2 => "Risk of Rain 2",
        }
    }

    pub fn from_api_name(name: &str) -> Option<Self> {
        match name {
            "valheim" => Some(Self::Valheim),
            "lethal-company" => Some(Self::LethalCompany),
            "ror2" => Some(Self::RiskOfRain2),
            _ => None,
        }
    }
}

impl Default for ThunderstoreGame {
    fn default() -> Self {
        Self::Valheim
    }
}
