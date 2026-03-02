pub mod commands;
pub mod db;
pub mod migration;
pub mod models;
pub mod r2z;
pub mod storage;
pub mod version;

pub use commands::*;
pub use models::*;

pub struct ProfileManager {
    db: db::ProfileDb,
}

impl ProfileManager {
    pub fn new() -> Result<Self, String> {
        let db_path = storage::get_database_path()?;

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create database directory: {}", e))?;
        }

        let db = db::ProfileDb::open(&db_path)?;

        Ok(ProfileManager { db })
    }

    pub fn get_active_profile(&self, game_id: &str) -> Result<Option<Profile>, String> {
        let profile_id = self.db.get_active_profile_id(game_id)?;

        match profile_id {
            Some(id) => self.db.get_profile(&id),
            None => Ok(None),
        }
    }

    pub fn get_active_bepinex_path(&self, game_id: &str) -> Result<std::path::PathBuf, String> {
        let profile = self
            .get_active_profile(game_id)?
            .ok_or_else(|| format!("No active profile set for game '{}'", game_id))?;

        Ok(profile.path.join("BepInEx"))
    }

    pub fn has_profiles(&self, game_id: &str) -> Result<bool, String> {
        let profiles = self.db.get_profiles(game_id)?;
        Ok(!profiles.is_empty())
    }
}

impl Default for ProfileManager {
    fn default() -> Self {
        Self::new().expect("Failed to create ProfileManager")
    }
}
