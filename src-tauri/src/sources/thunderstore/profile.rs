use std::path::{Path, PathBuf};

use super::manifest::ManifestV2;

pub type ModsYml = Vec<ManifestV2>;

#[derive(Debug, Clone)]
pub struct Profile {
    pub name: String,
    pub path: PathBuf,
    pub is_custom_path: bool,
}

impl Profile {
    pub fn new(name: &str, path: PathBuf) -> Self {
        Self {
            name: name.to_string(),
            path,
            is_custom_path: false,
        }
    }

    pub fn with_custom_path(name: &str, path: PathBuf) -> Self {
        Self {
            name: name.to_string(),
            path,
            is_custom_path: true,
        }
    }

    pub fn get_mods_yml_path(&self) -> PathBuf {
        self.path.join("mods.yml")
    }

    pub fn get_state_dir(&self) -> PathBuf {
        self.path.join("_state")
    }

    pub fn load_mod_list(&self) -> Result<ModsYml, String> {
        load_mods_yml(&self.path)
    }

    pub fn save_mod_list(&self, mods: &ModsYml) -> Result<(), String> {
        save_mods_yml(&self.path, mods)
    }

    pub fn add_mod(&self, manifest: ManifestV2) -> Result<(), String> {
        let mut mods = self.load_mod_list()?;
        add_mod_to_list(&mut mods, manifest);
        self.save_mod_list(&mods)
    }

    pub fn remove_mod(&self, name: &str) -> Result<bool, String> {
        let mut mods = self.load_mod_list()?;
        let removed = remove_mod_from_list(&mut mods, name);
        if removed {
            self.save_mod_list(&mods)?;
        }
        Ok(removed)
    }

    pub fn get_mod(&self, name: &str) -> Result<Option<ManifestV2>, String> {
        let mods = self.load_mod_list()?;
        Ok(find_mod_in_list(&mods, name).cloned())
    }

    pub fn set_mod_enabled(&self, name: &str, enabled: bool) -> Result<bool, String> {
        let mut mods = self.load_mod_list()?;
        let updated = set_enabled_in_list(&mut mods, name, enabled);
        if updated {
            self.save_mod_list(&mods)?;
        }
        Ok(updated)
    }
}

pub fn load_mods_yml(instance_dir: &Path) -> Result<ModsYml, String> {
    let path = instance_dir.join("mods.yml");
    if !path.exists() {
        return Ok(vec![]);
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read mods.yml: {}", e))?;

    if content.trim().is_empty() || content.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse mods.yml: {}", e))
}

pub fn save_mods_yml(instance_dir: &Path, mods: &ModsYml) -> Result<(), String> {
    let path = instance_dir.join("mods.yml");
    let yaml =
        serde_yaml::to_string(mods).map_err(|e| format!("Failed to serialize mods.yml: {}", e))?;

    std::fs::write(&path, yaml).map_err(|e| format!("Failed to write mods.yml: {}", e))?;

    Ok(())
}

pub fn add_mod_to_list(mods: &mut ModsYml, manifest: ManifestV2) {
    if let Some(existing) = mods.iter_mut().find(|m| m.name == manifest.name) {
        *existing = manifest;
    } else {
        mods.push(manifest);
    }
}

pub fn remove_mod_from_list(mods: &mut ModsYml, name: &str) -> bool {
    let initial_len = mods.len();
    mods.retain(|m| m.name != name);
    mods.len() != initial_len
}

pub fn find_mod_in_list<'a>(mods: &'a ModsYml, name: &str) -> Option<&'a ManifestV2> {
    mods.iter().find(|m| m.name == name)
}

pub fn set_enabled_in_list(mods: &mut ModsYml, name: &str, enabled: bool) -> bool {
    if let Some(m) = mods.iter_mut().find(|m| m.name == name) {
        m.enabled = enabled;
        true
    } else {
        false
    }
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ModFileState {
    pub mod_name: String,
    pub files: Vec<(String, String)>,
}

impl ModFileState {
    pub fn new(mod_name: String) -> Self {
        Self {
            mod_name,
            files: Vec::new(),
        }
    }

    pub fn load(state_dir: &Path, mod_name: &str) -> Result<Option<Self>, String> {
        let path = state_dir.join(format!("{}-state.yml", mod_name));
        if !path.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read state file: {}", e))?;

        let state: Self = serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse state file: {}", e))?;

        Ok(Some(state))
    }

    pub fn save(&self, state_dir: &Path) -> Result<(), String> {
        std::fs::create_dir_all(state_dir)
            .map_err(|e| format!("Failed to create state directory: {}", e))?;

        let path = state_dir.join(format!("{}-state.yml", self.mod_name));
        let yaml =
            serde_yaml::to_string(self).map_err(|e| format!("Failed to serialize state: {}", e))?;

        std::fs::write(&path, yaml).map_err(|e| format!("Failed to write state file: {}", e))?;

        Ok(())
    }

    pub fn add_file(&mut self, source: String, dest: String) {
        self.files.push((source, dest));
    }

    pub fn delete(state_dir: &Path, mod_name: &str) -> Result<(), String> {
        let path = state_dir.join(format!("{}-state.yml", mod_name));
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete state file: {}", e))?;
        }
        Ok(())
    }

    pub fn get_dest_paths(&self) -> Vec<&str> {
        self.files.iter().map(|(_, d)| d.as_str()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_mod_to_list() {
        let mut mods = vec![];
        let manifest = ManifestV2::new(
            "Author-TestMod",
            "Author",
            "Test Mod",
            "1.0.0",
            None,
            None,
            vec![],
            None,
        );

        add_mod_to_list(&mut mods, manifest.clone());
        assert_eq!(mods.len(), 1);
        assert_eq!(mods[0].name, "Author-TestMod");

        add_mod_to_list(&mut mods, manifest);
        assert_eq!(mods.len(), 1);
    }

    #[test]
    fn test_remove_mod_from_list() {
        let mut mods = vec![ManifestV2::new(
            "Author-TestMod",
            "Author",
            "Test Mod",
            "1.0.0",
            None,
            None,
            vec![],
            None,
        )];

        assert!(remove_mod_from_list(&mut mods, "Author-TestMod"));
        assert!(mods.is_empty());
        assert!(!remove_mod_from_list(&mut mods, "NonExistent"));
    }
}
