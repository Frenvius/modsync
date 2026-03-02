use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub game_id: String,
    pub path: PathBuf,
    pub mods: Vec<ProfileMod>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub game_id: String,
    pub mod_count: usize,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<&Profile> for ProfileSummary {
    fn from(profile: &Profile) -> Self {
        ProfileSummary {
            id: profile.id.clone(),
            name: profile.name.clone(),
            game_id: profile.game_id.clone(),
            mod_count: profile.mods.len(),
            created_at: profile.created_at,
            updated_at: profile.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileMod {
    pub id: String,
    pub package_id: String,
    pub version: String,
    pub enabled: bool,
    pub kind: ModKind,
    pub install_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ModKind {
    #[serde(rename_all = "camelCase")]
    Thunderstore {
        full_name: String,
        dependencies: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Local {
        source_path: Option<PathBuf>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YmlMod {
    pub package_id: String,
    pub version: String,
    pub enabled: bool,
    pub is_local: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub install_time: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct R2ManifestV2 {
    pub name: String,
    pub version_number: R2Version,
    pub enabled: bool,
    #[serde(default)]
    pub author_name: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub installed_at_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct R2xManifest {
    #[serde(rename = "profileName")]
    pub profile_name: String,
    pub mods: Vec<R2Mod>,
    pub community: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct R2Mod {
    pub name: String,
    #[serde(default, rename = "version")]
    pub version_number: Option<R2Version>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct R2Version {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl std::fmt::Display for R2Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct R2zPreview {
    pub profile_name: String,
    pub mod_count: usize,
    pub mods: Vec<R2ModPreview>,
    pub community: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct R2ModPreview {
    pub name: String,
    pub version: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateInfo {
    pub package_id: String,
    pub installed_version: String,
    pub latest_version: String,
    pub has_update: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmmProfile {
    pub name: String,
    pub bepinex_path: String,
    pub has_mods: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmmProfileInfo {
    pub name: String,
    pub path: PathBuf,
    pub mod_count: usize,
    pub has_bepinex: bool,
}
