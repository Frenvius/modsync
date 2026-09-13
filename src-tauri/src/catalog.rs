use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum GameId {
    #[serde(rename = "minecraft")]
    Minecraft,
    #[serde(rename = "lethal-company")]
    LethalCompany,
    #[serde(rename = "valheim")]
    Valheim,
    #[serde(rename = "vintagestory")]
    VintageStory,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LoaderId {
    Vanilla,
    Fabric,
    Forge,
    NeoForge,
    BepInEx,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ProviderId {
    #[serde(rename = "modrinth")]
    Modrinth,
    #[serde(rename = "curseforge")]
    CurseForge,
    #[serde(rename = "thunderstore")]
    Thunderstore,
    #[serde(rename = "vintagestory")]
    VintageStoryDb,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum ProjectType {
    #[serde(rename = "mod")]
    Mod,
    #[serde(rename = "shader")]
    ShaderPack,
    #[serde(rename = "datapack")]
    DataPack,
    #[serde(rename = "resourcepack")]
    ResourcePack,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLoader {
    pub id: LoaderId,
    pub name: String,
    pub recommended: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCapabilities {
    pub launch: bool,
    pub install: bool,
    pub update: bool,
    pub import_instance: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: GameId,
    pub name: String,
    pub color: String,
    pub ecosystem_label: String,
    pub versions: Vec<String>,
    pub loaders: Vec<GameLoader>,
    pub providers: Vec<ProviderId>,
    pub capabilities: GameCapabilities,
    pub content_types: Vec<ProjectType>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMeta {
    pub id: ProviderId,
    pub name: String,
    pub color: String,
    pub website: String,
    pub games: Vec<GameId>,
    pub requires_api_key: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub games: Vec<Game>,
    pub providers: Vec<ProviderMeta>,
}

pub fn supports_loader(game_id: GameId, loader_id: LoaderId) -> bool {
    match game_id {
        GameId::Minecraft => matches!(
            loader_id,
            LoaderId::Vanilla | LoaderId::Fabric | LoaderId::Forge | LoaderId::NeoForge
        ),
        GameId::LethalCompany | GameId::Valheim => loader_id == LoaderId::BepInEx,
        GameId::VintageStory => loader_id == LoaderId::Vanilla,
    }
}

const CAPABILITIES: GameCapabilities = GameCapabilities {
    launch: true,
    install: true,
    update: true,
    import_instance: true,
};

#[tauri::command]
pub fn get_catalog() -> Catalog {
    Catalog {
        games: vec![
            Game {
                id: GameId::Minecraft,
                name: "Minecraft".into(),
                color: "#5b8c3a".into(),
                ecosystem_label: "Modrinth + CurseForge".into(),
                versions: [
                    "1.21.4", "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.1", "1.19.2", "1.18.2",
                    "1.16.5", "1.12.2",
                ]
                .map(String::from)
                .into(),
                loaders: vec![
                    GameLoader {
                        id: LoaderId::Vanilla,
                        name: "Vanilla".into(),
                        recommended: false,
                    },
                    GameLoader {
                        id: LoaderId::Fabric,
                        name: "Fabric".into(),
                        recommended: true,
                    },
                    GameLoader {
                        id: LoaderId::Forge,
                        name: "Forge".into(),
                        recommended: false,
                    },
                    GameLoader {
                        id: LoaderId::NeoForge,
                        name: "NeoForge".into(),
                        recommended: false,
                    },
                ],
                providers: vec![ProviderId::Modrinth, ProviderId::CurseForge],
                capabilities: CAPABILITIES,
                content_types: vec![
                    ProjectType::Mod,
                    ProjectType::ResourcePack,
                    ProjectType::ShaderPack,
                    ProjectType::DataPack,
                ],
            },
            Game {
                id: GameId::Valheim,
                name: "Valheim".into(),
                color: "#b08a4a".into(),
                ecosystem_label: "Thunderstore".into(),
                versions: ["0.219.16", "0.219.13", "0.218.21", "0.217.46"]
                    .map(String::from)
                    .into(),
                loaders: vec![GameLoader {
                    id: LoaderId::BepInEx,
                    name: "BepInEx".into(),
                    recommended: true,
                }],
                providers: vec![ProviderId::Thunderstore],
                capabilities: CAPABILITIES,
                content_types: vec![ProjectType::Mod],
            },
            Game {
                id: GameId::VintageStory,
                name: "Vintage Story".into(),
                color: "#7a6a4d".into(),
                ecosystem_label: "ModDB".into(),
                versions: ["1.20.4", "1.20.1", "1.19.8", "1.19.4", "1.18.15"]
                    .map(String::from)
                    .into(),
                loaders: vec![GameLoader {
                    id: LoaderId::Vanilla,
                    name: "Built-in".into(),
                    recommended: true,
                }],
                providers: vec![ProviderId::VintageStoryDb],
                capabilities: CAPABILITIES,
                content_types: vec![ProjectType::Mod],
            },
            Game {
                id: GameId::LethalCompany,
                name: "Lethal Company".into(),
                color: "#c9532f".into(),
                ecosystem_label: "Thunderstore".into(),
                versions: ["v69", "v64", "v56", "v50"].map(String::from).into(),
                loaders: vec![GameLoader {
                    id: LoaderId::BepInEx,
                    name: "BepInEx".into(),
                    recommended: true,
                }],
                providers: vec![ProviderId::Thunderstore],
                capabilities: CAPABILITIES,
                content_types: vec![ProjectType::Mod],
            },
        ],
        providers: vec![
            ProviderMeta {
                id: ProviderId::Modrinth,
                name: "Modrinth".into(),
                color: "#1bd96a".into(),
                website: "https://modrinth.com".into(),
                games: vec![GameId::Minecraft],
                requires_api_key: false,
            },
            ProviderMeta {
                id: ProviderId::CurseForge,
                name: "CurseForge".into(),
                color: "#f16436".into(),
                website: "https://curseforge.com".into(),
                games: vec![GameId::Minecraft],
                requires_api_key: true,
            },
            ProviderMeta {
                id: ProviderId::Thunderstore,
                name: "Thunderstore".into(),
                color: "#4fa3ff".into(),
                website: "https://thunderstore.io".into(),
                games: vec![GameId::Valheim, GameId::LethalCompany],
                requires_api_key: false,
            },
            ProviderMeta {
                id: ProviderId::VintageStoryDb,
                name: "Vintage Story ModDB".into(),
                color: "#d0a45a".into(),
                website: "https://mods.vintagestory.at".into(),
                games: vec![GameId::VintageStory],
                requires_api_key: false,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_loader_matrix_accepts_every_v1_game() {
        let supported = [
            (GameId::Minecraft, LoaderId::Fabric),
            (GameId::LethalCompany, LoaderId::BepInEx),
            (GameId::Valheim, LoaderId::BepInEx),
            (GameId::VintageStory, LoaderId::Vanilla),
        ];

        assert!(supported
            .into_iter()
            .all(|(game, loader)| supports_loader(game, loader)));
    }

    #[test]
    fn catalog_contains_only_confirmed_v1_games_and_loaders() {
        let catalog = get_catalog();
        let ids = catalog.games.iter().map(|game| game.id).collect::<Vec<_>>();

        assert_eq!(
            ids,
            vec![
                GameId::Minecraft,
                GameId::Valheim,
                GameId::VintageStory,
                GameId::LethalCompany
            ]
        );
        assert!(!catalog
            .games
            .iter()
            .flat_map(|game| &game.loaders)
            .any(|loader| loader.name == "Quilt"));
    }
}
