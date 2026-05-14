use std::path::{Path, PathBuf};
use std::process::Command;

use crate::mod_linker::{self, ModLinker};

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

fn build_doorstop_args(instance_dir: &Path) -> Result<Vec<String>, String> {
    let version = mod_linker::detect_doorstop_version(instance_dir);
    let preloader = mod_linker::find_preloader_dll(instance_dir)?;
    let preloader_str = preloader.to_string_lossy().into_owned();

    let args = if version >= 4 {
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
    };

    println!("[launch] doorstop args: {:?}", args);
    Ok(args)
}

pub async fn launch_thunderstore_game(
    launch_mode: LaunchMode,
    instance_dir: &Path,
) -> Result<(), String> {
    let game_dir = match &launch_mode {
        LaunchMode::Steam { game_dir, .. } => game_dir,
        LaunchMode::Direct { game_dir, .. } => game_dir,
    };

    println!("[launch] === launch_thunderstore_game ===");
    println!("[launch] instance_dir: {}", instance_dir.display());
    println!("[launch] game_dir: {}", game_dir.display());

    let linker = ModLinker::new(instance_dir.to_path_buf(), game_dir.clone());
    linker.link()?;

    let doorstop_args = build_doorstop_args(instance_dir)?;

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

            let mut args = vec!["-applaunch".to_string(), app_id.to_string()];
            args.extend(doorstop_args);

            println!("[launch] Steam command: {} {:?}", steam_exe.display(), args);

            Command::new(&steam_exe)
                .args(&args)
                .spawn()
                .map_err(|e| format!("Failed to launch via Steam: {}", e))?;

            println!("[launch] Steam process spawned successfully");
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

            println!("[launch] Direct command: {} {:?} (cwd: {})", exe_path.display(), doorstop_args, game_dir.display());

            Command::new(&exe_path)
                .args(&doorstop_args)
                .current_dir(&game_dir)
                .spawn()
                .map_err(|e| format!("Failed to launch game: {}", e))?;

            println!("[launch] Direct process spawned successfully");
        }
    }

    Ok(())
}
