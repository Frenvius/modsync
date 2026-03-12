use serde::Serialize;
use std::path::{Path, PathBuf};

pub const KNOWN_LOADER_PACKAGES: &[&str] = &[
    "BepInEx-BepInExPack",
    "bbepis-BepInExPack",
    "xiaoxiao921-BepInExPack",
    "denikson-BepInExPack_Valheim",
    "1F31A-BepInEx_Valheim_Full",
    "BepInEx-BepInEx_MonoMod_Loader",
    "LavaGang-MelonLoader",
    "VTOL_VR_Modding-MelonLoader",
    "Thunderstore-unreal_shimloader",
    "NotNet-GDWeave",
];

pub fn is_loader_package(full_name: &str) -> bool {
    if KNOWN_LOADER_PACKAGES.contains(&full_name) {
        return true;
    }
    let lower = full_name.to_lowercase();
    lower.contains("bepinexpack") || lower.contains("melonloader") || lower.ends_with("-shimloader")
}

#[derive(Debug, Serialize, Clone)]
pub enum PackageLoader {
    BepInEx,
}

impl PackageLoader {
    pub fn mods_base_dir(&self) -> &str {
        match self {
            Self::BepInEx => "BepInEx/plugins",
        }
    }

    pub fn marker_dir(&self) -> &str {
        match self {
            Self::BepInEx => "BepInEx/core",
        }
    }

    pub fn mods_base_path(&self, instance_dir: &Path) -> PathBuf {
        instance_dir.join(self.mods_base_dir())
    }

    pub fn is_installed(&self, instance_dir: &Path) -> bool {
        instance_dir.join(self.marker_dir()).exists()
    }

    pub fn name(&self) -> &str {
        match self {
            Self::BepInEx => "bepinex",
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct LoaderConfig {
    pub loader_type: PackageLoader,
    pub package_name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GameInfo {
    pub id: String,
    pub display_name: String,
    pub requires_loader: bool,
    pub mod_source: String,
    pub thunderstore_community: Option<String>,
    pub default_version: Option<String>,
    pub loader: Option<LoaderConfig>,
    pub steam_app_id: Option<u32>,
    pub exe_name: Option<String>,
}

pub fn list_games() -> Vec<GameInfo> {
    vec![
        GameInfo {
            id: "minecraft".to_string(),
            display_name: "Minecraft".to_string(),
            requires_loader: true,
            mod_source: "modrinth".to_string(),
            thunderstore_community: None,
            default_version: None,
            loader: None,
            steam_app_id: None,
            exe_name: None,
        },
        GameInfo {
            id: "lethal-company".to_string(),
            display_name: "Lethal Company".to_string(),
            requires_loader: false,
            mod_source: "thunderstore".to_string(),
            thunderstore_community: Some("lethal-company".to_string()),
            default_version: Some("latest".to_string()),
            loader: Some(LoaderConfig {
                loader_type: PackageLoader::BepInEx,
                package_name: "BepInEx-BepInExPack".into(),
            }),
            steam_app_id: Some(1966720),
            exe_name: Some("Lethal Company.exe".to_string()),
        },
        GameInfo {
            id: "valheim".to_string(),
            display_name: "Valheim".to_string(),
            requires_loader: false,
            mod_source: "thunderstore".to_string(),
            thunderstore_community: Some("valheim".to_string()),
            default_version: Some("latest".to_string()),
            loader: Some(LoaderConfig {
                loader_type: PackageLoader::BepInEx,
                package_name: "denikson-BepInExPack_Valheim".into(),
            }),
            steam_app_id: Some(892970),
            exe_name: Some("valheim.exe".to_string()),
        },
    ]
}

pub fn get_game(id: &str) -> Option<GameInfo> {
    list_games().into_iter().find(|g| g.id == id)
}
