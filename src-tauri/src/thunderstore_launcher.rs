use std::path::{Path, PathBuf};
use std::process::Command;

pub enum LaunchMode {
    Steam { steam_exe: PathBuf, app_id: u32 },
    Direct { exe_path: PathBuf },
}

fn detect_doorstop_version(instance_dir: &Path) -> u32 {
    let version_file = instance_dir.join(".doorstop_version");
    if let Ok(content) = std::fs::read_to_string(&version_file) {
        let trimmed = content.trim();
        if trimmed.starts_with('4') {
            return 4;
        }
    }
    3
}

fn build_doorstop_args(instance_dir: &Path) -> Vec<String> {
    let version = detect_doorstop_version(instance_dir);
    let preloader = instance_dir
        .join("BepInEx")
        .join("core")
        .join("BepInEx.Preloader.dll");
    let preloader_str = preloader.to_string_lossy().into_owned();

    if version >= 4 {
        vec![
            "--doorstop-enabled".to_string(),
            "true".to_string(),
            "--doorstop-target-assembly".to_string(),
            preloader_str,
        ]
    } else {
        vec![
            "--doorstop-enable".to_string(),
            "true".to_string(),
            "--doorstop-target".to_string(),
            preloader_str,
        ]
    }
}

pub async fn launch_thunderstore_game(
    launch_mode: LaunchMode,
    instance_dir: &Path,
) -> Result<(), String> {
    let doorstop_args = build_doorstop_args(instance_dir);

    match launch_mode {
        LaunchMode::Steam { steam_exe, app_id } => {
            if !steam_exe.exists() {
                return Err(format!("Steam executable not found at: {}", steam_exe.display()));
            }

            let mut args = vec![
                "-applaunch".to_string(),
                app_id.to_string(),
            ];
            args.extend(doorstop_args);

            Command::new(&steam_exe)
                .args(&args)
                .spawn()
                .map_err(|e| format!("Failed to launch via Steam: {}", e))?;
        }
        LaunchMode::Direct { exe_path } => {
            if !exe_path.exists() {
                return Err(format!("Game executable not found at: {}", exe_path.display()));
            }

            Command::new(&exe_path)
                .args(&doorstop_args)
                .current_dir(exe_path.parent().unwrap_or(Path::new(".")))
                .spawn()
                .map_err(|e| format!("Failed to launch game: {}", e))?;
        }
    }

    Ok(())
}
