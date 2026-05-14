use std::path::{Path, PathBuf};

const KNOWN_PRELOADERS: &[&str] = &[
    "BepInEx.Preloader.dll",
    "BepInEx.Unity.Mono.Preloader.dll",
    "BepInEx.Unity.IL2CPP.dll",
    "BepInEx.IL2CPP.dll",
];

const EXCLUDED_DIRS: &[&str] = &[
    "bepinex",
    "bepinex_server",
    "_state",
    "mods",
];

const EXCLUDED_FILES: &[&str] = &[
    "mods.yml",
    "instance.json",
    "doorstop_config.ini",
];

pub struct ModLinker {
    instance_dir: PathBuf,
    game_dir: PathBuf,
}

impl ModLinker {
    pub fn new(instance_dir: PathBuf, game_dir: PathBuf) -> Self {
        Self {
            instance_dir,
            game_dir,
        }
    }

    pub fn link(&self) -> Result<(), String> {
        println!("[mod_linker] === ModLinker::link() ===");
        println!("[mod_linker] instance_dir: {}", self.instance_dir.display());
        println!("[mod_linker] game_dir: {}", self.game_dir.display());

        if !self.instance_dir.exists() {
            return Err(format!(
                "Instance directory not found: {}",
                self.instance_dir.display()
            ));
        }

        let entries = std::fs::read_dir(&self.instance_dir)
            .map_err(|e| format!("Failed to read instance directory: {}", e))?;

        let mut linked_count = 0;
        let mut skipped_count = 0;

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let src = entry.path();

            if src.is_file() {
                if is_excluded_file(&name) {
                    println!("[mod_linker] SKIP file (excluded): {}", name);
                    skipped_count += 1;
                    continue;
                }
                let dst = self.game_dir.join(&name);
                println!("[mod_linker] LINK file: {} -> {}", src.display(), dst.display());
                copy_if_changed(&src, &dst)?;
                linked_count += 1;
            } else if src.is_dir() {
                if is_excluded_dir(&name) {
                    println!("[mod_linker] SKIP dir (excluded): {}/", name);
                    skipped_count += 1;
                    continue;
                }
                println!("[mod_linker] LINK dir: {}/ -> {}/", name, self.game_dir.join(&name).display());
                copy_dir_recursive(&src, &self.game_dir.join(&name))?;
                linked_count += 1;
            }
        }

        println!("[mod_linker] Done: {} linked, {} skipped", linked_count, skipped_count);

        if let Err(e) = generate_doorstop_config(&self.instance_dir, &self.game_dir) {
            println!("[mod_linker] Warning: failed to generate doorstop_config.ini: {}", e);
        }

        Ok(())
    }
}

pub fn detect_doorstop_version(instance_dir: &Path) -> u32 {
    let version_file = instance_dir.join(".doorstop_version");
    let version = if let Ok(content) = std::fs::read_to_string(&version_file) {
        let trimmed = content.trim();
        if trimmed.starts_with('4') {
            4
        } else {
            3
        }
    } else {
        3
    };
    println!("[mod_linker] doorstop version: {} (file: {})", version, version_file.display());
    version
}

pub fn find_preloader_dll(instance_dir: &Path) -> Result<PathBuf, String> {
    let core_dir = instance_dir.join("BepInEx").join("core");
    println!("[mod_linker] Scanning for preloader DLL in: {}", core_dir.display());

    if !core_dir.exists() {
        return Err(format!(
            "BepInEx/core/ not found in instance directory: {}. Is BepInEx installed?",
            instance_dir.display()
        ));
    }

    let entries = std::fs::read_dir(&core_dir)
        .map_err(|e| format!("Failed to read BepInEx/core/: {}", e))?;

    let file_names: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();

    println!("[mod_linker] Files in BepInEx/core/: {:?}", file_names);

    for known in KNOWN_PRELOADERS {
        if file_names.iter().any(|f| f == *known) {
            let path = core_dir.join(known);
            println!("[mod_linker] Found preloader: {}", path.display());
            return Ok(path);
        }
    }

    Err(format!(
        "No BepInEx preloader DLL found in {}. Expected one of: {}",
        core_dir.display(),
        KNOWN_PRELOADERS.join(", ")
    ))
}

pub fn generate_doorstop_config(instance_dir: &Path, game_dir: &Path) -> Result<(), String> {
    let preloader = find_preloader_dll(instance_dir)?;
    let version = detect_doorstop_version(instance_dir);

    let preloader_abs = preloader
        .canonicalize()
        .unwrap_or_else(|_| preloader.clone());

    let content = if version >= 4 {
        format!(
            "[General]\r\n\
             enabled = true\r\n\
             target_assembly = {}\r\n",
            preloader_abs.display()
        )
    } else {
        format!(
            "[UnityDoorstop]\r\n\
             enabled=true\r\n\
             targetAssembly={}\r\n",
            preloader_abs.display()
        )
    };

    let ini_path = game_dir.join("doorstop_config.ini");
    std::fs::write(&ini_path, &content)
        .map_err(|e| format!("Failed to write doorstop_config.ini: {}", e))?;
    println!(
        "[mod_linker] Generated doorstop_config.ini (v{}) at {}",
        version,
        ini_path.display()
    );
    Ok(())
}

fn is_excluded_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    EXCLUDED_DIRS.iter().any(|exc| lower == *exc)
}

fn is_excluded_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    EXCLUDED_FILES.iter().any(|exc| lower == *exc)
}

fn copy_if_changed(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        if let (Ok(src_meta), Ok(dst_meta)) = (std::fs::metadata(src), std::fs::metadata(dst)) {
            if src_meta.len() == dst_meta.len() {
                if let (Ok(src_mtime), Ok(dst_mtime)) =
                    (src_meta.modified(), dst_meta.modified())
                {
                    if src_mtime == dst_mtime {
                        return Ok(());
                    }
                }
            }
        }
    }

    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
    }

    std::fs::copy(src, dst)
        .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src, dst, e))?;

    if let Ok(src_meta) = std::fs::metadata(src) {
        if let Ok(mtime) = src_meta.modified() {
            let times = std::fs::FileTimes::new().set_modified(mtime);
            if let Ok(file) = std::fs::File::options().write(true).open(dst) {
                let _ = file.set_times(times);
            }
        }
    }

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;

    let entries = std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {:?}: {}", src, e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        if name == ".git" {
            continue;
        }

        let src_path = entry.path();
        let dst_path = dst.join(&name);

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            copy_if_changed(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
