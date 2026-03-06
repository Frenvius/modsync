use std::path::{Path, PathBuf};

use super::manifest::ManifestV2;
use super::profile::ModFileState;
use super::rules::{get_rules_for_game, InstallRule, TrackingMethod};

const SKIP_FILES: [&str; 5] = [
    "icon.png",
    "manifest.json",
    "README.md",
    "CHANGELOG.md",
    ".cached",
];

pub struct ModInstaller {
    instance_dir: PathBuf,
    rules: Vec<InstallRule>,
    game_id: String,
}

impl ModInstaller {
    pub fn new(instance_dir: PathBuf, game_id: &str, loader: Option<&str>) -> Self {
        Self {
            instance_dir,
            rules: get_rules_for_game(game_id, loader),
            game_id: game_id.to_string(),
        }
    }

    fn state_dir(&self) -> PathBuf {
        self.instance_dir.join("_state")
    }

    fn default_rule(&self) -> Option<&InstallRule> {
        self.rules.iter().find(|r| r.is_default)
    }

    pub fn install_mod(
        &self,
        cache_path: &Path,
        manifest: &ManifestV2,
    ) -> Result<ModFileState, String> {
        let mut state = ModFileState::new(manifest.name.clone());

        let default_rule = self.default_rule().ok_or("No default install rule found")?;

        self.install_directory(cache_path, &manifest.name, default_rule, &mut state)?;

        state.save(&self.state_dir())?;

        Ok(state)
    }

    pub fn install_loader(
        &self,
        cache_path: &Path,
        manifest: &ManifestV2,
    ) -> Result<ModFileState, String> {
        let mut state = ModFileState::new(manifest.name.clone());

        let source_dir = self.find_loader_source(cache_path)?;

        self.copy_dir_recursive(&source_dir, &self.instance_dir, &mut state, cache_path)?;

        state.save(&self.state_dir())?;

        Ok(state)
    }

    fn find_loader_source(&self, cache_path: &Path) -> Result<PathBuf, String> {
        let entries: Vec<_> = std::fs::read_dir(cache_path)
            .map_err(|e| format!("Failed to read cache dir: {}", e))?
            .filter_map(|e| e.ok())
            .collect();

        let bepinex_subfolder = entries.iter().find(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            e.path().is_dir() && name.starts_with("BepInExPack")
        });

        if let Some(subfolder) = bepinex_subfolder {
            Ok(subfolder.path())
        } else {
            Ok(cache_path.to_path_buf())
        }
    }

    fn install_directory(
        &self,
        source: &Path,
        mod_name: &str,
        rule: &InstallRule,
        state: &mut ModFileState,
    ) -> Result<(), String> {
        let entries =
            std::fs::read_dir(source).map_err(|e| format!("Failed to read source dir: {}", e))?;

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();

            if SKIP_FILES.contains(&name.as_str()) {
                continue;
            }

            let src_path = entry.path();

            if src_path.is_dir() {
                let matching_rule = self.rules.iter().find(|r| {
                    let route_name = Path::new(&r.route)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("");
                    route_name.eq_ignore_ascii_case(&name)
                });

                if let Some(sub_rule) = matching_rule {
                    self.install_directory(&src_path, mod_name, sub_rule, state)?;
                } else {
                    let dest_dir =
                        rule.get_destination(&self.instance_dir, mod_name, Path::new(&name));
                    std::fs::create_dir_all(&dest_dir)
                        .map_err(|e| format!("Failed to create dir {:?}: {}", dest_dir, e))?;
                    self.copy_dir_recursive(&src_path, &dest_dir, state, source)?;
                }
            } else {
                let dest = rule.get_destination(&self.instance_dir, mod_name, Path::new(&name));
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
                std::fs::copy(&src_path, &dest)
                    .map_err(|e| format!("Failed to copy {} to {:?}: {}", name, dest, e))?;
                state.add_file(
                    src_path.to_string_lossy().to_string(),
                    dest.to_string_lossy().to_string(),
                );
            }
        }

        Ok(())
    }

    fn copy_dir_recursive(
        &self,
        source: &Path,
        dest: &Path,
        state: &mut ModFileState,
        cache_base: &Path,
    ) -> Result<(), String> {
        std::fs::create_dir_all(dest)
            .map_err(|e| format!("Failed to create dir {:?}: {}", dest, e))?;

        let entries = std::fs::read_dir(source)
            .map_err(|e| format!("Failed to read dir {:?}: {}", source, e))?;

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();

            if SKIP_FILES.contains(&name.as_str()) {
                continue;
            }

            let src_path = entry.path();
            let dest_path = dest.join(&name);

            if src_path.is_dir() {
                self.copy_dir_recursive(&src_path, &dest_path, state, cache_base)?;
            } else {
                std::fs::copy(&src_path, &dest_path).map_err(|e| {
                    format!("Failed to copy {:?} to {:?}: {}", src_path, dest_path, e)
                })?;
                state.add_file(
                    src_path.to_string_lossy().to_string(),
                    dest_path.to_string_lossy().to_string(),
                );
            }
        }

        Ok(())
    }

    pub fn uninstall_mod(&self, name: &str) -> Result<(), String> {
        let state = ModFileState::load(&self.state_dir(), name)?;

        if let Some(state) = state {
            for (_, dest) in &state.files {
                let path = Path::new(dest);
                if path.exists() {
                    let _ = std::fs::remove_file(path);
                    let old_path = format!("{}.old", dest);
                    let _ = std::fs::remove_file(&old_path);
                }
            }

            self.cleanup_empty_dirs(name)?;
        }

        ModFileState::delete(&self.state_dir(), name)?;

        Ok(())
    }

    fn cleanup_empty_dirs(&self, mod_name: &str) -> Result<(), String> {
        for rule in &self.rules {
            if matches!(
                rule.tracking_method,
                TrackingMethod::Subdir | TrackingMethod::SubdirNoFlatten
            ) {
                let mod_dir = self.instance_dir.join(&rule.route).join(mod_name);
                if mod_dir.exists() {
                    let _ = std::fs::remove_dir_all(&mod_dir);
                }
            }
        }
        Ok(())
    }

    fn find_mod_directories(&self, mod_name: &str) -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        for rule in &self.rules {
            if matches!(
                rule.tracking_method,
                TrackingMethod::Subdir | TrackingMethod::SubdirNoFlatten
            ) {
                let mod_dir = self.instance_dir.join(&rule.route).join(mod_name);
                if mod_dir.exists() && mod_dir.is_dir() {
                    dirs.push(mod_dir);
                }
            }
        }

        dirs
    }

    fn rename_files_recursive(dir: &Path, add_old: bool) -> Result<u32, String> {
        let mut count = 0;

        let entries = std::fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory {:?}: {}", dir, e))?;

        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_dir() {
                count += Self::rename_files_recursive(&path, add_old)?;
            } else {
                let name = path.to_string_lossy().to_string();

                if add_old {
                    if !name.ends_with(".old") {
                        let new_path = format!("{}.old", name);
                        std::fs::rename(&path, &new_path)
                            .map_err(|e| format!("Failed to disable file {:?}: {}", path, e))?;
                        count += 1;
                    }
                } else if name.ends_with(".old") {
                    let new_path = name.trim_end_matches(".old");
                    std::fs::rename(&path, new_path)
                        .map_err(|e| format!("Failed to enable file {:?}: {}", path, e))?;
                    count += 1;
                }
            }
        }

        Ok(count)
    }

    pub fn enable_mod(&self, name: &str) -> Result<(), String> {
        let mod_dirs = self.find_mod_directories(name);

        if !mod_dirs.is_empty() {
            for dir in mod_dirs {
                Self::rename_files_recursive(&dir, false)?;
            }
            return Ok(());
        }

        let state = ModFileState::load(&self.state_dir(), name)?;

        if let Some(state) = state {
            for (_, dest) in &state.files {
                let old_path = format!("{}.old", dest);
                let old_path = Path::new(&old_path);
                let dest_path = Path::new(dest);

                if old_path.exists() {
                    std::fs::rename(old_path, dest_path)
                        .map_err(|e| format!("Failed to enable file {:?}: {}", dest_path, e))?;
                }
            }
            return Ok(());
        }

        Err(format!("No mod directory or state found for mod {}", name))
    }

    pub fn disable_mod(&self, name: &str) -> Result<(), String> {
        let mod_dirs = self.find_mod_directories(name);

        if !mod_dirs.is_empty() {
            for dir in mod_dirs {
                Self::rename_files_recursive(&dir, true)?;
            }
            return Ok(());
        }

        let state = ModFileState::load(&self.state_dir(), name)?;

        if let Some(state) = state {
            for (_, dest) in &state.files {
                let dest_path = Path::new(dest);
                if dest_path.exists() && !dest.ends_with(".old") {
                    let old_path = format!("{}.old", dest);
                    std::fs::rename(dest_path, &old_path)
                        .map_err(|e| format!("Failed to disable file {:?}: {}", dest_path, e))?;
                }
            }
            return Ok(());
        }

        Err(format!("No mod directory or state found for mod {}", name))
    }

    pub fn mods_base_path(&self) -> PathBuf {
        if let Some(rule) = self.default_rule() {
            self.instance_dir.join(&rule.route)
        } else {
            self.instance_dir.join("BepInEx/plugins")
        }
    }
}

pub async fn install_mod_full(
    cache_base: &Path,
    instance_dir: &Path,
    full_name: &str,
    version: &str,
    download_url: &str,
    dependencies: &[String],
    is_loader: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    use super::cache;
    use super::profile::{add_mod_to_list, load_mods_yml, save_mods_yml};

    let cache_dir =
        cache::download_and_extract(cache_base, full_name, version, download_url).await?;

    let (author, display_name) = full_name
        .split_once('-')
        .map(|(a, n)| (a.to_string(), n.to_string()))
        .unwrap_or_else(|| ("unknown".to_string(), full_name.to_string()));

    let manifest = if is_loader {
        ManifestV2::new_loader(
            full_name,
            &author,
            &display_name,
            version,
            None,
            None,
            dependencies.to_vec(),
            None,
        )
    } else {
        ManifestV2::new(
            full_name,
            &author,
            &display_name,
            version,
            None,
            None,
            dependencies.to_vec(),
            None,
        )
    };

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);

    if is_loader {
        installer.install_loader(&cache_dir, &manifest)?;
    } else {
        installer.install_mod(&cache_dir, &manifest)?;
    }

    let mut mods = load_mods_yml(instance_dir)?;
    add_mod_to_list(&mut mods, manifest);
    save_mods_yml(instance_dir, &mods)?;

    Ok(())
}

pub fn toggle_mod_enabled(
    instance_dir: &Path,
    full_name: &str,
    enable: bool,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    use super::profile::{load_mods_yml, save_mods_yml, set_enabled_in_list};

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);

    if enable {
        installer.enable_mod(full_name)?;
    } else {
        installer.disable_mod(full_name)?;
    }

    let mut mods = load_mods_yml(instance_dir)?;
    set_enabled_in_list(&mut mods, full_name, enable);
    save_mods_yml(instance_dir, &mods)?;

    Ok(())
}

pub fn remove_mod_from_profile(
    instance_dir: &Path,
    full_name: &str,
    game_id: &str,
    loader: Option<&str>,
) -> Result<(), String> {
    use super::profile::{load_mods_yml, remove_mod_from_list, save_mods_yml};

    let installer = ModInstaller::new(instance_dir.to_path_buf(), game_id, loader);
    installer.uninstall_mod(full_name)?;

    let mut mods = load_mods_yml(instance_dir)?;
    remove_mod_from_list(&mut mods, full_name);
    save_mods_yml(instance_dir, &mods)?;

    Ok(())
}
