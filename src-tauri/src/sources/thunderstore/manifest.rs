use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct VersionNumber {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl VersionNumber {
    pub fn parse(version_str: &str) -> Self {
        let parts: Vec<&str> = version_str.split('.').collect();
        Self {
            major: parts.first().and_then(|s| s.parse().ok()).unwrap_or(0),
            minor: parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
            patch: parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0),
        }
    }
}

impl std::fmt::Display for VersionNumber {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

fn default_manifest_version() -> u8 {
    1
}

fn default_game_version() -> String {
    "0".to_string()
}

fn default_network_mode() -> String {
    "both".to_string()
}

fn default_package_type() -> String {
    "other".to_string()
}

fn default_install_mode() -> String {
    "managed".to_string()
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestV2 {
    #[serde(default = "default_manifest_version")]
    pub manifest_version: u8,

    pub name: String,

    #[serde(default)]
    pub author_name: String,

    #[serde(default)]
    pub website_url: String,

    #[serde(default)]
    pub display_name: String,

    #[serde(default)]
    pub description: String,

    #[serde(default = "default_game_version")]
    pub game_version: String,

    #[serde(default = "default_network_mode")]
    pub network_mode: String,

    #[serde(default = "default_package_type")]
    pub package_type: String,

    #[serde(default = "default_install_mode")]
    pub install_mode: String,

    #[serde(default)]
    pub loaders: Vec<String>,

    #[serde(default)]
    pub dependencies: Vec<String>,

    #[serde(default)]
    pub incompatibilities: Vec<String>,

    #[serde(default)]
    pub optional_dependencies: Vec<String>,

    pub version_number: VersionNumber,

    #[serde(default = "default_enabled")]
    pub enabled: bool,

    #[serde(default)]
    pub installed_at_time: u64,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

impl ManifestV2 {
    pub fn new(
        full_name: &str,
        author: &str,
        display_name: &str,
        version: &str,
        description: Option<&str>,
        website_url: Option<&str>,
        dependencies: Vec<String>,
        icon: Option<String>,
    ) -> Self {
        Self {
            manifest_version: 1,
            name: full_name.to_string(),
            author_name: author.to_string(),
            website_url: website_url.unwrap_or_default().to_string(),
            display_name: display_name.to_string(),
            description: description.unwrap_or_default().to_string(),
            game_version: "0".to_string(),
            network_mode: "both".to_string(),
            package_type: "other".to_string(),
            install_mode: "managed".to_string(),
            loaders: vec![],
            dependencies,
            incompatibilities: vec![],
            optional_dependencies: vec![],
            version_number: VersionNumber::parse(version),
            enabled: true,
            installed_at_time: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            icon,
        }
    }

}

pub fn parse_full_name(full_name: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = full_name.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid package name: {}", full_name));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

#[derive(Debug, Clone)]
pub struct DependencyString {
    pub owner: String,
    pub name: String,
    pub version: String,
}

impl DependencyString {
    pub fn parse(dep: &str) -> Option<Self> {
        let parts: Vec<&str> = dep.split('-').collect();
        if parts.len() < 3 {
            return None;
        }
        let owner = parts[0].to_string();
        let version = parts[parts.len() - 1].to_string();
        let name = parts[1..parts.len() - 1].join("-");
        Some(Self {
            owner,
            name,
            version,
        })
    }

    pub fn full_name(&self) -> String {
        format!("{}-{}", self.owner, self.name)
    }
}