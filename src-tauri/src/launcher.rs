use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

use crate::instance;
use crate::loaders::fabric::FabricLoaderProfile;
use crate::minecraft::{get_native_classifier, get_os_name, should_include_library, VersionMeta};

#[derive(Debug, Clone, Serialize)]
pub struct JavaRuntime {
    pub path: PathBuf,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LaunchOptions {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub memory_min: Option<String>,
    pub memory_max: Option<String>,
    pub java_path: Option<String>,
    pub game_dir: Option<String>,
}

impl Default for LaunchOptions {
    fn default() -> Self {
        Self {
            username: "Player".to_string(),
            uuid: "00000000-0000-0000-0000-000000000000".to_string(),
            access_token: "0".to_string(),
            memory_min: Some("512M".to_string()),
            memory_max: Some("4G".to_string()),
            java_path: None,
            game_dir: None,
        }
    }
}

pub fn find_java() -> Result<JavaRuntime, String> {
    let all_javas = find_all_java();

    if let Some(java) = all_javas.iter().find(|j| {
        j.version.starts_with("17") ||
        j.version.starts_with("21") ||
        j.version.starts_with("22") ||
        j.version.starts_with("23")
    }) {
        return Ok(java.clone());
    }

    all_javas.into_iter().next()
        .ok_or_else(|| "Java not found. Please install Java 17 or later.".to_string())
}

pub fn find_all_java() -> Vec<JavaRuntime> {
    let mut found_javas: Vec<JavaRuntime> = Vec::new();
    let mut seen_paths: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let java_candidates = get_java_candidates();
    for candidate in java_candidates {
        if candidate.exists() && !seen_paths.contains(&candidate) {
            if let Ok(version) = get_java_version(&candidate) {
                seen_paths.insert(candidate.clone());
                found_javas.push(JavaRuntime {
                    path: candidate,
                    version,
                });
            }
        }
    }

    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let java_path = PathBuf::from(&java_home).join("bin").join(java_executable());
        if java_path.exists() && !seen_paths.contains(&java_path) {
            if let Ok(version) = get_java_version(&java_path) {
                seen_paths.insert(java_path.clone());
                found_javas.push(JavaRuntime {
                    path: java_path,
                    version,
                });
            }
        }
    }

    if let Ok(output) = Command::new("java").arg("-version").output() {
        if output.status.success() {
            let version_output = String::from_utf8_lossy(&output.stderr);
            let version = parse_java_version(&version_output).unwrap_or_else(|| "unknown".to_string());
            let path = PathBuf::from("java");
            if !seen_paths.contains(&path) {
                found_javas.push(JavaRuntime {
                    path,
                    version,
                });
            }
        }
    }

    found_javas.sort_by(|a, b| {
        let a_major = extract_major_version(&a.version);
        let b_major = extract_major_version(&b.version);
        b_major.cmp(&a_major)
    });

    found_javas
}

fn extract_major_version(version: &str) -> u32 {
    let v = version.trim_start_matches("1.");
    v.split('.').next()
        .and_then(|s| s.split('_').next())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn java_executable() -> &'static str {
    if cfg!(target_os = "windows") {
        "java.exe"
    } else {
        "java"
    }
}

fn get_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let mut base_dirs = Vec::new();

        if let Ok(program_files) = std::env::var("ProgramFiles") {
            base_dirs.push(PathBuf::from(&program_files).join("Java"));
            base_dirs.push(PathBuf::from(&program_files).join("Eclipse Adoptium"));
            base_dirs.push(PathBuf::from(&program_files).join("Microsoft"));
            base_dirs.push(PathBuf::from(&program_files).join("Zulu"));
            base_dirs.push(PathBuf::from(&program_files).join("AdoptOpenJDK"));
            base_dirs.push(PathBuf::from(&program_files).join("BellSoft"));
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            base_dirs.push(PathBuf::from(&program_files_x86).join("Java"));
        }

        base_dirs.push(PathBuf::from("C:\\Java"));
        base_dirs.push(PathBuf::from("C:\\Program Files\\Java"));

        for base in &base_dirs {
            if base.exists() {
                if let Ok(entries) = std::fs::read_dir(base) {
                    for entry in entries.flatten() {
                        let entry_path = entry.path();
                        for exe in &["java.exe", "javaw.exe"] {
                            let path = entry_path.join("bin").join(exe);
                            if path.exists() {
                                let java_path = entry_path.join("bin").join("java.exe");
                                if java_path.exists() {
                                    candidates.push(java_path);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/Library/Java/JavaVirtualMachines"));
        candidates.push(PathBuf::from("/usr/local/opt/openjdk/bin/java"));
        candidates.push(PathBuf::from("/opt/homebrew/opt/openjdk/bin/java"));

        let jvm_dir = PathBuf::from("/Library/Java/JavaVirtualMachines");
        if jvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&jvm_dir) {
                for entry in entries.flatten() {
                    let path = entry.path().join("Contents/Home/bin/java");
                    if path.exists() {
                        candidates.push(path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/lib/jvm"));
        candidates.push(PathBuf::from("/usr/java"));

        let jvm_dir = PathBuf::from("/usr/lib/jvm");
        if jvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&jvm_dir) {
                for entry in entries.flatten() {
                    let path = entry.path().join("bin/java");
                    if path.exists() {
                        candidates.push(path);
                    }
                }
            }
        }
    }

    candidates
}

fn get_java_version(java_path: &Path) -> Result<String, String> {
    let output = Command::new(java_path)
        .arg("-version")
        .output()
        .map_err(|e| format!("Failed to run Java: {}", e))?;

    let version_output = String::from_utf8_lossy(&output.stderr);
    parse_java_version(&version_output).ok_or_else(|| "Could not parse Java version".to_string())
}

fn parse_java_version(output: &str) -> Option<String> {
    for line in output.lines() {
        if let Some(start) = line.find('"') {
            if let Some(end) = line[start + 1..].find('"') {
                return Some(line[start + 1..start + 1 + end].to_string());
            }
        }
    }
    None
}

fn build_classpath(
    instance_dir: &Path,
    version_meta: &VersionMeta,
    fabric_profile: Option<&FabricLoaderProfile>,
) -> String {
    let libraries_dir = instance_dir.join("libraries");
    let versions_dir = instance_dir.join("versions");

    let mut classpath = Vec::new();
    let mut missing_files = Vec::new();

    for library in &version_meta.libraries {
        if !should_include_library(library) {
            continue;
        }

        if let Some(ref downloads) = library.downloads {
            if let Some(ref artifact) = downloads.artifact {
                let native_path: PathBuf = artifact.path.split('/').collect();
                let lib_path = libraries_dir.join(&native_path);
                if !lib_path.exists() {
                    missing_files.push(lib_path.to_string_lossy().to_string());
                }
                classpath.push(lib_path);
            }
        }
    }

    if let Some(profile) = fabric_profile {
        eprintln!("[DEBUG] Adding {} Fabric libraries", profile.libraries.len());
        for lib in &profile.libraries {
            let rel_path = maven_to_path(&lib.name);
            if let Some(rel_path) = rel_path {
                let lib_path = libraries_dir.join(&rel_path);
                eprintln!("[DEBUG] Fabric lib: {} -> {:?} (exists: {})", lib.name, lib_path, lib_path.exists());
                if !lib_path.exists() {
                    missing_files.push(format!("{} ({})", lib.name, lib_path.to_string_lossy()));
                }
                classpath.push(lib_path);
            }
        }
    } else {
        eprintln!("[DEBUG] No Fabric profile - Fabric libraries not added to classpath!");
    }

    let client_jar = versions_dir
        .join(&version_meta.id)
        .join(format!("{}.jar", version_meta.id));
    if !client_jar.exists() {
        missing_files.push(client_jar.to_string_lossy().to_string());
    }
    classpath.push(client_jar);

    if !missing_files.is_empty() {
        eprintln!("[WARNING] Missing {} classpath files:", missing_files.len());
        for f in &missing_files[..missing_files.len().min(10)] {
            eprintln!("  - {}", f);
        }
    }

    let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    let result = classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator);

    eprintln!("[DEBUG] Classpath entry count: {}", classpath.len());
    eprintln!("[DEBUG] First Fabric lib in classpath: {:?}", classpath.iter().find(|p| p.to_string_lossy().contains("fabric")));

    let debug_cp_file = instance_dir.join("debug_classpath.txt");
    if let Err(e) = std::fs::write(&debug_cp_file, &result) {
        eprintln!("[DEBUG] Failed to write debug classpath: {}", e);
    } else {
        eprintln!("[DEBUG] Full classpath written to: {:?}", debug_cp_file);
    }

    result
}

fn maven_to_path(maven: &str) -> Option<PathBuf> {
    let parts: Vec<&str> = maven.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group_path: PathBuf = parts[0].split('.').collect();
    let artifact = parts[1];
    let version = parts[2];

    Some(
        group_path
            .join(artifact)
            .join(version)
            .join(format!("{}-{}.jar", artifact, version))
    )
}

fn build_jvm_args_file(
    instance_dir: &Path,
    options: &LaunchOptions,
    version_meta: &VersionMeta,
    classpath: &str,
) -> Result<PathBuf, String> {
    let natives_dir = instance_dir.join("natives");
    let mut args = Vec::new();

    let quote_path = |path: &str| -> String {
        let escaped = path.replace('\\', "\\\\");
        format!("\"{}\"", escaped)
    };

    if let Some(ref min) = options.memory_min {
        args.push(format!("-Xms{}", min));
    }
    if let Some(ref max) = options.memory_max {
        args.push(format!("-Xmx{}", max));
    }

    let natives_path = natives_dir.to_string_lossy();
    args.push(format!("\"-Djava.library.path={}\"", natives_path.replace('\\', "\\\\")));

    args.push("-cp".to_string());
    args.push(quote_path(classpath));

    if let Some(ref arguments) = version_meta.arguments {
        if let Some(ref jvm_args) = arguments.jvm {
            for arg in jvm_args {
                if let crate::minecraft::ArgumentValue::Simple(s) = arg {
                    if s == "-cp" || s.contains("${classpath}") {
                        continue;
                    }
                    let resolved = resolve_arg_placeholder(s, instance_dir, options, version_meta);
                    if resolved.is_empty() {
                        continue;
                    }
                    if resolved.contains(' ') || resolved.contains('\\') {
                        args.push(quote_path(&resolved));
                    } else {
                        args.push(resolved);
                    }
                }
            }
        }
    }

    let temp_dir = std::env::temp_dir();
    let arg_file = temp_dir.join(format!("mc_jvm_args_{}.txt", std::process::id()));
    let content = args.join("\n");
    std::fs::write(&arg_file, &content)
        .map_err(|e| format!("Failed to write JVM args file: {}", e))?;

    eprintln!("[DEBUG] JVM args file written to: {:?}", arg_file);
    eprintln!("[DEBUG] JVM args file content length: {} bytes", content.len());

    Ok(arg_file)
}

fn build_game_args(
    instance_dir: &Path,
    options: &LaunchOptions,
    version_meta: &VersionMeta,
) -> Vec<String> {
    let mut args = Vec::new();
    let game_dir = options
        .game_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| instance_dir.to_path_buf());
    let assets_dir = instance_dir.join("assets");

    if let Some(ref mc_args) = version_meta.minecraft_arguments {
        for arg in mc_args.split_whitespace() {
            let resolved = arg
                .replace("${auth_player_name}", &options.username)
                .replace("${version_name}", &version_meta.id)
                .replace("${game_directory}", &game_dir.to_string_lossy())
                .replace("${assets_root}", &assets_dir.to_string_lossy())
                .replace("${assets_index_name}", &version_meta.assets)
                .replace("${auth_uuid}", &options.uuid)
                .replace("${auth_access_token}", &options.access_token)
                .replace("${user_type}", "msa")
                .replace("${version_type}", &version_meta.version_type);
            args.push(resolved);
        }
    }

    if let Some(ref arguments) = version_meta.arguments {
        if let Some(ref game_args) = arguments.game {
            for arg in game_args {
                if let crate::minecraft::ArgumentValue::Simple(s) = arg {
                    let resolved = resolve_arg_placeholder(s, instance_dir, options, version_meta);
                    args.push(resolved);
                }
            }
        }
    }

    args
}

fn resolve_arg_placeholder(
    arg: &str,
    instance_dir: &Path,
    options: &LaunchOptions,
    version_meta: &VersionMeta,
) -> String {
    let game_dir = options
        .game_dir
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| instance_dir.to_path_buf());
    let assets_dir = instance_dir.join("assets");
    let natives_dir = instance_dir.join("natives");

    arg.replace("${auth_player_name}", &options.username)
        .replace("${version_name}", &version_meta.id)
        .replace("${game_directory}", &game_dir.to_string_lossy())
        .replace("${assets_root}", &assets_dir.to_string_lossy())
        .replace("${assets_index_name}", &version_meta.assets)
        .replace("${auth_uuid}", &options.uuid)
        .replace("${auth_access_token}", &options.access_token)
        .replace("${user_type}", "msa")
        .replace("${version_type}", &version_meta.version_type)
        .replace("${natives_directory}", &natives_dir.to_string_lossy())
        .replace("${launcher_name}", "ModpackSync")
        .replace("${launcher_version}", "0.1.0")
        .replace("${classpath}", "")
}

pub async fn launch_game(
    app_handle: &AppHandle,
    modpack_id: &str,
    options: LaunchOptions,
    fabric_profile: Option<FabricLoaderProfile>,
) -> Result<(), String> {
    let instance_dir = instance::get_instance_dir(app_handle, modpack_id)?;
    let versions_dir = instance::get_versions_dir(app_handle, modpack_id)?;

    eprintln!("[DEBUG] Instance dir: {:?}", instance_dir);
    eprintln!("[DEBUG] Fabric profile present: {}", fabric_profile.is_some());

    let instance_data = instance::load_instance(app_handle, modpack_id)?
        .ok_or("Instance not found")?;

    if !instance_data.installed {
        return Err("Instance is not installed. Please install it first.".to_string());
    }

    let version_json_path = versions_dir
        .join(&instance_data.minecraft_version)
        .join(format!("{}.json", instance_data.minecraft_version));

    let version_json = std::fs::read_to_string(&version_json_path)
        .map_err(|e| format!("Failed to read version JSON: {}", e))?;

    let version_meta: VersionMeta = serde_json::from_str(&version_json)
        .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

    let main_class = fabric_profile
        .as_ref()
        .map(|p| p.main_class.clone())
        .unwrap_or_else(|| version_meta.main_class.clone());

    let java = if let Some(ref path) = options.java_path {
        JavaRuntime {
            path: PathBuf::from(path),
            version: "custom".to_string(),
        }
    } else {
        find_java()?
    };

    let classpath = build_classpath(&instance_dir, &version_meta, fabric_profile.as_ref());

    let jvm_args_file = build_jvm_args_file(&instance_dir, &options, &version_meta, &classpath)?;
    let game_args = build_game_args(&instance_dir, &options, &version_meta);

    let mut command = Command::new(&java.path);
    command.current_dir(&instance_dir);

    command.arg(format!("@{}", jvm_args_file.to_string_lossy()));
    command.arg(&main_class);
    command.args(&game_args);

    eprintln!("[DEBUG] Java path: {:?}", java.path);
    eprintln!("[DEBUG] Main class: {}", main_class);
    eprintln!("[DEBUG] JVM args file: {:?}", jvm_args_file);
    eprintln!("[DEBUG] Game args count: {}", game_args.len());

    let child = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch game: {}", e))?;

    std::thread::spawn(move || {
        if let Some(stderr) = child.stderr {
            use std::io::BufRead;
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().flatten().take(50) {
                eprintln!("[JAVA STDERR] {}", line);
            }
        }
    });

    instance::update_last_played(app_handle, modpack_id)?;

    Ok(())
}

pub async fn extract_natives(
    instance_dir: &Path,
    version_meta: &VersionMeta,
) -> Result<(), String> {
    let libraries_dir = instance_dir.join("libraries");
    let natives_dir = instance_dir.join("natives");

    std::fs::create_dir_all(&natives_dir)
        .map_err(|e| format!("Failed to create natives directory: {}", e))?;

    for library in &version_meta.libraries {
        if !should_include_library(library) {
            continue;
        }

        if let Some(classifier) = get_native_classifier(library) {
            if let Some(ref downloads) = library.downloads {
                if let Some(ref classifiers) = downloads.classifiers {
                    if let Some(native_artifact) = classifiers.get(&classifier) {
                        let native_jar = libraries_dir.join(&native_artifact.path);
                        if native_jar.exists() {
                            extract_jar_natives(&native_jar, &natives_dir, library)?;
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

fn extract_jar_natives(
    jar_path: &Path,
    natives_dir: &Path,
    library: &crate::minecraft::Library,
) -> Result<(), String> {
    use std::io::Read;

    let file = std::fs::File::open(jar_path)
        .map_err(|e| format!("Failed to open native jar: {}", e))?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read native jar: {}", e))?;

    let exclude_patterns: Vec<&str> = library
        .extract
        .as_ref()
        .and_then(|e| e.exclude.as_ref())
        .map(|v| v.iter().map(|s| s.as_str()).collect())
        .unwrap_or_default();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {}", e))?;

        let name = file.name().to_string();

        if exclude_patterns.iter().any(|p| name.starts_with(p)) {
            continue;
        }

        if name.ends_with('/') || name.starts_with("META-INF") {
            continue;
        }

        let out_path = natives_dir.join(&name);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let mut out_file = std::fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create native file: {}", e))?;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read native file: {}", e))?;

        std::io::Write::write_all(&mut out_file, &buffer)
            .map_err(|e| format!("Failed to write native file: {}", e))?;
    }

    Ok(())
}
