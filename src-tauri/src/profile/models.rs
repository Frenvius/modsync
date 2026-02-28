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
