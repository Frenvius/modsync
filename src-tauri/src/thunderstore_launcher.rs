use std::path::{Path, PathBuf};
use std::process::Command;

pub enum LaunchMode {
    Steam {
        steam_exe: PathBuf,
        app_id: u32,
        game_dir: PathBuf,
    },
    Direct {
        exe_path: PathBuf,
        game_dir: PathBuf,
    },
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

fn setup_doorstop(instance_dir: &Path, game_dir: &Path) -> Result<(), String> {
    let src_dll = instance_dir.join("winhttp.dll");
    let dst_dll = game_dir.join("winhttp.dll");
    if src_dll.exists() {
        std::fs::copy(&src_dll, &dst_dll)
            .map_err(|e| format!("Failed to copy winhttp.dll to game directory: {}", e))?;
    } else {
        return Err(format!(
            "winhttp.dll not found in instance directory: {}. Is BepInEx installed?",
            instance_dir.display()
        ));
    }

    let version = detect_doorstop_version(instance_dir);
    let preloader = instance_dir
        .join("BepInEx")
        .join("core")
        .join("BepInEx.Preloader.dll");
    let preloader_str = preloader.to_string_lossy();

    let config_content = if version >= 4 {
        format!(
            "[General]\r\nenabled=true\r\ntarget_assembly={}\r\n",
            preloader_str
        )
    } else {
        format!(
            "[UnityDoorstop]\r\nenabled=true\r\ntargetAssembly={}\r\n",
            preloader_str
        )
    };

    let config_path = game_dir.join("doorstop_config.ini");
    std::fs::write(&config_path, &config_content)
        .map_err(|e| format!("Failed to write doorstop_config.ini: {}", e))?;

    Ok(())
}

pub async fn launch_thunderstore_game(
    launch_mode: LaunchMode,
    instance_dir: &Path,
) -> Result<(), String> {
    let doorstop_args = build_doorstop_args(instance_dir);

    match launch_mode {
        LaunchMode::Steam {
            steam_exe,
            app_id,
            game_dir,
        } => {
            if !steam_exe.exists() {
                return Err(format!(
                    "Steam executable not found at: {}",
                    steam_exe.display()
                ));
            }
            if !game_dir.exists() {
                return Err(format!(
                    "Game directory not found at: {}",
                    game_dir.display()
                ));
            }

            setup_doorstop(instance_dir, &game_dir)?;

            let mut args = vec!["-applaunch".to_string(), app_id.to_string()];
            args.extend(doorstop_args);

            Command::new(&steam_exe)
                .args(&args)
                .spawn()
                .map_err(|e| format!("Failed to launch via Steam: {}", e))?;
        }
        LaunchMode::Direct {
            exe_path,
            game_dir,
        } => {
            if !exe_path.exists() {
                return Err(format!(
                    "Game executable not found at: {}",
                    exe_path.display()
                ));
            }

            setup_doorstop(instance_dir, &game_dir)?;

            Command::new(&exe_path)
                .args(&doorstop_args)
                .current_dir(&game_dir)
                .spawn()
                .map_err(|e| format!("Failed to launch game: {}", e))?;
        }
    }

    Ok(())
}
