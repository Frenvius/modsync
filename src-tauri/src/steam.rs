use std::path::{Path, PathBuf};

pub struct SteamInfo {
    pub install_path: PathBuf,
}

impl SteamInfo {
    pub fn steam_exe(&self) -> PathBuf {
        self.install_path.join("steam.exe")
    }
}

pub fn detect_steam_install() -> Result<SteamInfo, String> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_LOCAL_MACHINE;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let steam_key = hklm
            .open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam")
            .or_else(|_| hklm.open_subkey(r"SOFTWARE\Valve\Steam"))
            .map_err(|_| "Steam not found in registry".to_string())?;

        let install_path: String = steam_key
            .get_value("InstallPath")
            .map_err(|_| "Steam InstallPath not found in registry".to_string())?;

        Ok(SteamInfo {
            install_path: PathBuf::from(install_path),
        })
    }

    #[cfg(not(windows))]
    {
        Err("Steam detection is only supported on Windows".to_string())
    }
}

fn get_library_paths(steam_info: &SteamInfo) -> Vec<PathBuf> {
    let mut paths = vec![steam_info.install_path.join("steamapps")];

    let vdf_path = steam_info.install_path.join("steamapps").join("libraryfolders.vdf");
    if let Ok(content) = std::fs::read_to_string(&vdf_path) {
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('"') {
                let parts: Vec<&str> = line.splitn(4, '"').collect();
                if parts.len() >= 4 && parts[1] == "path" {
                    let lib_path = PathBuf::from(parts[3].replace("\\\\", "\\"));
                    paths.push(lib_path.join("steamapps"));
                }
            }
        }
    }

    paths
}

pub fn find_game_path(steam_info: &SteamInfo, app_id: u32) -> Result<PathBuf, String> {
    let library_paths = get_library_paths(steam_info);

    for library in &library_paths {
        let manifest_path = library.join(format!("appmanifest_{}.acf", app_id));
        if manifest_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                let install_dir = parse_acf_value(&content, "installdir");
                if let Some(dir) = install_dir {
                    let game_path = library.join("common").join(dir);
                    if game_path.exists() {
                        return Ok(game_path);
                    }
                }
            }
        }
    }

    Err(format!("Game with app ID {} not found in any Steam library", app_id))
}

fn parse_acf_value<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('"') {
            let parts: Vec<&str> = line.splitn(4, '"').collect();
            if parts.len() >= 4 && parts[1] == key {
                return Some(parts[3]);
            }
        }
    }
    None
}
