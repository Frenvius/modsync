use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Modpack {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub minecraft_version: String,
    pub loader: String,
    pub mods: Vec<ModpackMod>,
    pub is_owner: bool,
    pub share_code: Option<String>,
    #[serde(default)]
    pub owner_address: Option<String>,
    #[serde(default)]
    pub image_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModpackMod {
    pub slug: String,
    pub title: String,
    pub version: String,
    pub author: String,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub version_id: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub filename: Option<String>,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct CreateModpackRequest {
    pub name: String,
    pub description: Option<String>,
    pub minecraft_version: String,
    pub loader: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateModpackRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub minecraft_version: Option<String>,
    pub loader: Option<String>,
    pub image_path: Option<String>,
}

impl Modpack {
    pub fn new(request: CreateModpackRequest) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: request.name,
            description: request.description,
            minecraft_version: request.minecraft_version,
            loader: request.loader,
            mods: Vec::new(),
            is_owner: true,
            share_code: None,
            owner_address: None,
            image_path: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    pub fn from_joined(mut modpack: Modpack, owner_address: String) -> Self {
        modpack.id = uuid::Uuid::new_v4().to_string();
        modpack.is_owner = false;
        modpack.share_code = None;
        modpack.owner_address = Some(owner_address);
        modpack.created_at = chrono::Utc::now().to_rfc3339();
        modpack.updated_at = modpack.created_at.clone();
        modpack
    }

    pub fn apply_updates(&mut self, updates: UpdateModpackRequest) {
        if let Some(name) = updates.name {
            self.name = name;
        }
        if let Some(description) = updates.description {
            self.description = Some(description);
        }
        if let Some(minecraft_version) = updates.minecraft_version {
            self.minecraft_version = minecraft_version;
        }
        if let Some(loader) = updates.loader {
            self.loader = loader;
        }
        if let Some(image_path) = updates.image_path {
            self.image_path = Some(image_path);
        }
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    pub fn set_image(&mut self, image_path: Option<String>) {
        self.image_path = image_path;
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    pub fn add_mod(&mut self, mod_info: ModpackMod) {
        if !self.mods.iter().any(|m| m.slug == mod_info.slug) {
            self.mods.push(mod_info);
            self.updated_at = chrono::Utc::now().to_rfc3339();
        }
    }

    pub fn remove_mod(&mut self, slug: &str) -> bool {
        let initial_len = self.mods.len();
        self.mods.retain(|m| m.slug != slug);
        if self.mods.len() != initial_len {
            self.updated_at = chrono::Utc::now().to_rfc3339();
            true
        } else {
            false
        }
    }
}
