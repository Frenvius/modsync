use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::models::{ModKind, Profile, ProfileMod, ProfileSummary};

pub struct ProfileDb {
    conn: Arc<Mutex<Connection>>,
}

impl ProfileDb {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let db = ProfileDb {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                game_id TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS profile_mods (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                package_id TEXT NOT NULL,
                version TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                kind TEXT NOT NULL,
                kind_data TEXT,
                install_time INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS active_profiles (
                game_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_profile_mods_profile_id ON profile_mods(profile_id);
            CREATE INDEX IF NOT EXISTS idx_profiles_game_id ON profiles(game_id);
            "#,
        )
        .map_err(|e| format!("Failed to create schema: {}", e))?;

        Ok(())
    }

    pub fn create_profile(&self, profile: &Profile) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "INSERT INTO profiles (id, name, game_id, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                profile.id,
                profile.name,
                profile.game_id,
                profile.path.to_string_lossy().to_string(),
                profile.created_at,
                profile.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to create profile: {}", e))?;

        Ok(())
    }

    pub fn get_profiles(&self, game_id: &str) -> Result<Vec<ProfileSummary>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let mut stmt = conn
            .prepare(
                r#"
                SELECT p.id, p.name, p.game_id, p.created_at, p.updated_at,
                       (SELECT COUNT(*) FROM profile_mods pm WHERE pm.profile_id = p.id) as mod_count
                FROM profiles p
                WHERE p.game_id = ?1
                ORDER BY p.name COLLATE NOCASE
                "#,
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let profiles = stmt
            .query_map(params![game_id], |row| {
                Ok(ProfileSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    game_id: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    mod_count: row.get(5)?,
                })
            })
            .map_err(|e| format!("Failed to query profiles: {}", e))?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect profiles: {}", e))?;

        Ok(profiles)
    }

    pub fn get_profile(&self, profile_id: &str) -> Result<Option<Profile>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let profile_row: Option<(String, String, String, String, i64, i64)> = conn
            .query_row(
                "SELECT id, name, game_id, path, created_at, updated_at FROM profiles WHERE id = ?1",
                params![profile_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to query profile: {}", e))?;

        let Some((id, name, game_id, path, created_at, updated_at)) = profile_row else {
            return Ok(None);
        };

        let mods = self.get_profile_mods_internal(&conn, &id)?;

        Ok(Some(Profile {
            id: id.to_string(),
            name,
            game_id,
            path: std::path::PathBuf::from(path),
            mods,
            created_at,
            updated_at,
        }))
    }

    fn get_profile_mods_internal(&self, conn: &Connection, profile_id: &str) -> Result<Vec<ProfileMod>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, package_id, version, enabled, kind, kind_data, install_time FROM profile_mods WHERE profile_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare mods query: {}", e))?;

        let mods = stmt
            .query_map(params![profile_id], |row| {
                let kind_str: String = row.get(4)?;
                let kind_data: Option<String> = row.get(5)?;

                let kind = parse_mod_kind(&kind_str, kind_data.as_deref());

                Ok(ProfileMod {
                    id: row.get(0)?,
                    package_id: row.get(1)?,
                    version: row.get(2)?,
                    enabled: row.get::<_, i32>(3)? != 0,
                    kind,
                    install_time: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query mods: {}", e))?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect mods: {}", e))?;

        Ok(mods)
    }

    pub fn delete_profile(&self, profile_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute("DELETE FROM profiles WHERE id = ?1", params![profile_id])
            .map_err(|e| format!("Failed to delete profile: {}", e))?;

        Ok(())
    }

    pub fn rename_profile(&self, profile_id: &str, new_name: &str, updated_at: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "UPDATE profiles SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_name, updated_at, profile_id],
        )
        .map_err(|e| format!("Failed to rename profile: {}", e))?;

        Ok(())
    }

    pub fn add_mods_batch(&self, profile_id: &str, mods: &[ProfileMod]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let tx = conn
            .transaction()
            .map_err(|e| format!("Failed to start transaction: {}", e))?;

        for mod_entry in mods {
            let (kind_str, kind_data) = serialize_mod_kind(&mod_entry.kind);
            tx.execute(
                "INSERT INTO profile_mods (id, profile_id, package_id, version, enabled, kind, kind_data, install_time) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    mod_entry.id,
                    profile_id,
                    mod_entry.package_id,
                    mod_entry.version,
                    mod_entry.enabled as i32,
                    kind_str,
                    kind_data,
                    mod_entry.install_time,
                ],
            )
            .map_err(|e| format!("Failed to add mod '{}': {}", mod_entry.package_id, e))?;
        }

        let now = chrono::Utc::now().timestamp();
        tx.execute(
            "UPDATE profiles SET updated_at = ?1 WHERE id = ?2",
            params![now, profile_id],
        )
        .map_err(|e| format!("Failed to update profile timestamp: {}", e))?;

        tx.commit()
            .map_err(|e| format!("Failed to commit transaction: {}", e))?;

        Ok(())
    }

    pub fn add_mod(&self, profile_id: &str, mod_entry: &ProfileMod) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let (kind_str, kind_data) = serialize_mod_kind(&mod_entry.kind);

        conn.execute(
            "INSERT INTO profile_mods (id, profile_id, package_id, version, enabled, kind, kind_data, install_time) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                mod_entry.id,
                profile_id,
                mod_entry.package_id,
                mod_entry.version,
                mod_entry.enabled as i32,
                kind_str,
                kind_data,
                mod_entry.install_time,
            ],
        )
        .map_err(|e| format!("Failed to add mod: {}", e))?;

        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE profiles SET updated_at = ?1 WHERE id = ?2",
            params![now, profile_id],
        )
        .map_err(|e| format!("Failed to update profile timestamp: {}", e))?;

        Ok(())
    }

    pub fn remove_mod(&self, profile_id: &str, mod_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "DELETE FROM profile_mods WHERE id = ?1 AND profile_id = ?2",
            params![mod_id, profile_id],
        )
        .map_err(|e| format!("Failed to remove mod: {}", e))?;

        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE profiles SET updated_at = ?1 WHERE id = ?2",
            params![now, profile_id],
        )
        .map_err(|e| format!("Failed to update profile timestamp: {}", e))?;

        Ok(())
    }

    pub fn set_active_profile(&self, game_id: &str, profile_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO active_profiles (game_id, profile_id) VALUES (?1, ?2)",
            params![game_id, profile_id],
        )
        .map_err(|e| format!("Failed to set active profile: {}", e))?;

        Ok(())
    }

    pub fn get_active_profile_id(&self, game_id: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let result: Option<String> = conn
            .query_row(
                "SELECT profile_id FROM active_profiles WHERE game_id = ?1",
                params![game_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to get active profile: {}", e))?;

        Ok(result)
    }

    pub fn set_mod_enabled(&self, profile_id: &str, package_id: &str, enabled: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "UPDATE profile_mods SET enabled = ?1 WHERE profile_id = ?2 AND package_id = ?3",
            params![enabled as i32, profile_id, package_id],
        )
        .map_err(|e| format!("Failed to update mod enabled state: {}", e))?;

        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE profiles SET updated_at = ?1 WHERE id = ?2",
            params![now, profile_id],
        )
        .map_err(|e| format!("Failed to update profile timestamp: {}", e))?;

        Ok(())
    }

    pub fn update_mod_version(&self, profile_id: &str, package_id: &str, version: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "UPDATE profile_mods SET version = ?1 WHERE profile_id = ?2 AND package_id = ?3",
            params![version, profile_id, package_id],
        )
        .map_err(|e| format!("Failed to update mod version: {}", e))?;

        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE profiles SET updated_at = ?1 WHERE id = ?2",
            params![now, profile_id],
        )
        .map_err(|e| format!("Failed to update profile timestamp: {}", e))?;

        Ok(())
    }

    pub fn profile_name_exists(&self, game_id: &str, name: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM profiles WHERE game_id = ?1 AND name = ?2 COLLATE NOCASE",
                params![game_id, name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check profile name: {}", e))?;

        Ok(count > 0)
    }
}

fn parse_mod_kind(kind_str: &str, kind_data: Option<&str>) -> ModKind {
    match kind_str {
        "thunderstore" => {
            if let Some(data) = kind_data {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    let full_name = parsed["full_name"].as_str().unwrap_or("").to_string();
                    let dependencies = parsed["dependencies"]
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();
                    return ModKind::Thunderstore { full_name, dependencies };
                }
            }
            ModKind::Thunderstore {
                full_name: String::new(),
                dependencies: vec![],
            }
        }
        "local" => {
            let source_path = kind_data.map(std::path::PathBuf::from);
            ModKind::Local { source_path }
        }
        _ => ModKind::Local { source_path: None },
    }
}

fn serialize_mod_kind(kind: &ModKind) -> (String, Option<String>) {
    match kind {
        ModKind::Thunderstore { full_name, dependencies } => {
            let data = serde_json::json!({
                "full_name": full_name,
                "dependencies": dependencies,
            });
            ("thunderstore".to_string(), Some(data.to_string()))
        }
        ModKind::Local { source_path } => {
            let data = source_path.as_ref().map(|p| p.to_string_lossy().to_string());
            ("local".to_string(), data)
        }
    }
}
