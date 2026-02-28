use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub name: String,
    pub steam_id: u32,
    pub exe_name: String,
    pub thunderstore_id: String,
    pub preloader_names: Vec<String>,
    pub is_il2cpp: bool,
}

impl Game {
    pub fn tmm_data_path(&self) -> Result<PathBuf, String> {
        let app_data = dirs::data_dir()
            .ok_or("Could not find AppData directory")?;

        Ok(app_data
            .join("Thunderstore Mod Manager")
            .join("DataFolder")
            .join(&self.name))
    }

    pub fn profiles_path(&self) -> Result<PathBuf, String> {
        Ok(self.tmm_data_path()?.join("profiles"))
    }

    pub fn find_preloader(&self, bepinex_path: &PathBuf) -> Result<PathBuf, String> {
        let core_path = bepinex_path.join("core");

        for name in &self.preloader_names {
            let preloader_path = core_path.join(name);
            if preloader_path.exists() {
                return Ok(preloader_path);
            }
        }

        Err(format!(
            "No BepInEx preloader found in {}",
            core_path.display()
        ))
    }
}


pub fn get_supported_games() -> Vec<Game> {
    vec![
        Game {
            id: "valheim".to_string(),
            name: "Valheim".to_string(),
            steam_id: 892970,
            exe_name: "valheim.exe".to_string(),
            thunderstore_id: "valheim".to_string(),
            preloader_names: vec![
                "BepInEx.Unity.Mono.Preloader.dll".to_string(),
                "BepInEx.Preloader.dll".to_string(),
            ],
            is_il2cpp: false,
        },
        Game {
            id: "lethal-company".to_string(),
            name: "Lethal Company".to_string(),
            steam_id: 1966720,
            exe_name: "Lethal Company.exe".to_string(),
            thunderstore_id: "lethal-company".to_string(),
            preloader_names: vec![
                "BepInEx.Unity.Mono.Preloader.dll".to_string(),
                "BepInEx.Preloader.dll".to_string(),
            ],
            is_il2cpp: false,
        },
        Game {
            id: "ror2".to_string(),
            name: "Risk of Rain 2".to_string(),
            steam_id: 632360,
            exe_name: "Risk of Rain 2.exe".to_string(),
            thunderstore_id: "ror2".to_string(),
            preloader_names: vec![
                "BepInEx.Unity.Mono.Preloader.dll".to_string(),
                "BepInEx.Preloader.dll".to_string(),
            ],
            is_il2cpp: false,
        },
    ]
}

pub fn get_game_by_id(id: &str) -> Option<Game> {
    get_supported_games().into_iter().find(|g| g.id == id)
}

pub fn get_default_game() -> Game {
    get_game_by_id("valheim").unwrap()
}

#[tauri::command]
pub fn get_games() -> Vec<GameInfo> {
    get_supported_games()
        .into_iter()
        .map(|g| GameInfo {
            id: g.id,
            name: g.name,
            steam_id: g.steam_id,
            thunderstore_id: g.thunderstore_id,
        })
        .collect()
}

#[tauri::command]
pub fn get_game(id: String) -> Option<GameInfo> {
    get_game_by_id(&id).map(|g| GameInfo {
        id: g.id,
        name: g.name,
        steam_id: g.steam_id,
        thunderstore_id: g.thunderstore_id,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct GameInfo {
    pub id: String,
    pub name: String,
    pub steam_id: u32,
    pub thunderstore_id: String,
}
