use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TrackingMethod {
    Subdir,

    SubdirNoFlatten,

    State,

    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallRule {
    pub route: String,

    pub tracking_method: TrackingMethod,

    pub default_extensions: Vec<String>,

    pub is_default: bool,

    #[serde(default)]
    pub sub_rules: Vec<InstallRule>,
}

impl InstallRule {
    pub fn new(route: &str, tracking: TrackingMethod) -> Self {
        Self {
            route: route.to_string(),
            tracking_method: tracking,
            default_extensions: vec![],
            is_default: false,
            sub_rules: vec![],
        }
    }

    pub fn with_extensions(mut self, extensions: Vec<&str>) -> Self {
        self.default_extensions = extensions.into_iter().map(String::from).collect();
        self
    }

    pub fn as_default(mut self) -> Self {
        self.is_default = true;
        self
    }

    pub fn get_destination(
        &self,
        instance_dir: &Path,
        mod_name: &str,
        relative_path: &Path,
    ) -> std::path::PathBuf {
        let base = instance_dir.join(&self.route);

        match self.tracking_method {
            TrackingMethod::Subdir => base
                .join(mod_name)
                .join(relative_path.file_name().unwrap_or_default()),
            TrackingMethod::SubdirNoFlatten => base.join(mod_name).join(relative_path),
            TrackingMethod::State | TrackingMethod::None => base.join(relative_path),
        }
    }
}

pub fn get_bepinex_rules() -> Vec<InstallRule> {
    vec![
        InstallRule::new("BepInEx/plugins", TrackingMethod::Subdir)
            .with_extensions(vec!["dll"])
            .as_default(),
        InstallRule::new("BepInEx/patchers", TrackingMethod::Subdir).with_extensions(vec!["dll"]),
        InstallRule::new("BepInEx/config", TrackingMethod::State)
            .with_extensions(vec!["cfg", "ini", "json", "yaml", "yml"]),
        InstallRule::new("BepInEx/core", TrackingMethod::State).with_extensions(vec!["dll"]),
        InstallRule::new("BepInEx/plugins", TrackingMethod::SubdirNoFlatten).with_extensions(vec![
            "png", "jpg", "wav", "ogg", "mp3", "txt", "json", "xml",
        ]),
    ]
}

pub fn get_melonloader_rules() -> Vec<InstallRule> {
    vec![
        InstallRule::new("Mods", TrackingMethod::Subdir)
            .with_extensions(vec!["dll"])
            .as_default(),
        InstallRule::new("Plugins", TrackingMethod::Subdir).with_extensions(vec!["dll"]),
        InstallRule::new("UserData", TrackingMethod::State)
            .with_extensions(vec!["cfg", "ini", "json", "yaml", "yml"]),
        InstallRule::new("MelonLoader", TrackingMethod::State),
    ]
}

pub fn get_rules_for_game(game_id: &str, loader: Option<&str>) -> Vec<InstallRule> {
    match loader {
        Some("bepinex") | Some("BepInEx") => get_bepinex_rules(),
        Some("melonloader") | Some("MelonLoader") => get_melonloader_rules(),
        _ => match game_id {
            "lethal-company" | "valheim" | "risk-of-rain-2" => get_bepinex_rules(),
            _ => get_bepinex_rules(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_bepinex_plugin_rule() {
        let rules = get_bepinex_rules();
        let instance = PathBuf::from("/game");
        let file = Path::new("SomePlugin.dll");

        let default_rule = rules.iter().find(|r| r.is_default).unwrap();
        let dest = default_rule.get_destination(&instance, "Author-ModName", file);

        assert_eq!(
            dest,
            PathBuf::from("/game/BepInEx/plugins/Author-ModName/SomePlugin.dll")
        );
    }

    #[test]
    fn test_config_state_tracking() {
        let rules = get_bepinex_rules();
        let config_rule = rules.iter().find(|r| r.route == "BepInEx/config").unwrap();

        assert_eq!(config_rule.tracking_method, TrackingMethod::State);
    }
}
