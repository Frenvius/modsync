mod auth;
mod downloader;
mod instance;
mod launcher;
mod loaders;
mod minecraft;
mod modpack;
mod modrinth;
mod server;
mod storage;

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use modpack::{CreateModpackRequest, Modpack, ModpackMod, UpdateModpackRequest};
use modrinth::{Category, GameVersion, Loader, SearchParams, SearchResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::io::Read;
use once_cell::sync::Lazy;

static INSTALL_PROGRESS: Lazy<Mutex<HashMap<String, InstallProgress>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

static INSTALLING: Lazy<Mutex<HashMap<String, bool>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

#[derive(Debug, Serialize)]
pub struct ModWithDependencies {
    pub mod_info: ModInfo,
    pub dependencies: Vec<DependencyInfo>,
}

#[derive(Debug, Serialize)]
pub struct ModInfo {
    pub slug: String,
    pub title: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub version_id: String,
    pub version_number: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DependencyInfo {
    pub slug: String,
    pub title: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub project_id: String,
    pub dependency_type: String,
}

#[tauri::command]
async fn search_mods(
    query: Option<String>,
    game_version: Option<String>,
    loader: Option<String>,
    categories: Option<Vec<String>>,
    sort: Option<String>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> Result<SearchResult, String> {
    let mut facet_parts = vec![];

    if let Some(ref version) = game_version {
        if !version.is_empty() {
            facet_parts.push(format!(r#"["versions:{}"]"#, version));
        }
    }

    if let Some(ref loader_name) = loader {
        if !loader_name.is_empty() {
            facet_parts.push(format!(r#"["categories:{}"]"#, loader_name));
        }
    }

    if let Some(ref cats) = categories {
        for cat in cats {
            if !cat.is_empty() {
                facet_parts.push(format!(r#"["categories:{}"]"#, cat));
            }
        }
    }

    let facets = if facet_parts.is_empty() {
        None
    } else {
        Some(facet_parts.join(","))
    };

    let index = sort.map(|s| match s.as_str() {
        "downloads" => "downloads".to_string(),
        "follows" => "follows".to_string(),
        "updated" => "updated".to_string(),
        "newest" => "newest".to_string(),
        _ => "relevance".to_string(),
    });

    let params = SearchParams {
        query,
        facets,
        index,
        offset,
        limit,
    };

    modrinth::search_mods(params).await
}

#[tauri::command]
async fn get_mod_categories() -> Result<Vec<Category>, String> {
    modrinth::get_categories().await
}

#[tauri::command]
async fn get_mod_loaders() -> Result<Vec<Loader>, String> {
    modrinth::get_loaders().await
}

#[tauri::command]
async fn get_game_versions() -> Result<Vec<GameVersion>, String> {
    modrinth::get_game_versions().await
}

#[tauri::command]
async fn get_mod_versions(
    slug: String,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<modrinth::Version>, String> {
    modrinth::get_project_versions(
        &slug,
        game_version.as_deref(),
        loader.as_deref(),
    ).await
}

#[tauri::command]
async fn create_modpack(
    app_handle: tauri::AppHandle,
    name: String,
    description: Option<String>,
    minecraft_version: String,
    loader: String,
) -> Result<Modpack, String> {
    let request = CreateModpackRequest {
        name,
        description,
        minecraft_version,
        loader,
    };

    let modpack = Modpack::new(request);
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

#[tauri::command]
async fn list_modpacks(app_handle: tauri::AppHandle) -> Result<Vec<Modpack>, String> {
    let mut modpacks = storage::load_all_modpacks(&app_handle)?;

    let server_running = server::is_server_running().await;
    if !server_running {
        for modpack in &mut modpacks {
            if modpack.share_code.is_some() {
                modpack.share_code = None;
                let _ = storage::save_modpack(&app_handle, modpack);
            }
        }
    }

    Ok(modpacks)
}

#[tauri::command]
async fn get_modpack(app_handle: tauri::AppHandle, id: String) -> Result<Modpack, String> {
    storage::load_modpack(&app_handle, &id)
}

#[tauri::command]
async fn update_modpack(
    app_handle: tauri::AppHandle,
    id: String,
    name: Option<String>,
    description: Option<String>,
    minecraft_version: Option<String>,
    loader: Option<String>,
    image_path: Option<String>,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &id)?;

    let updates = UpdateModpackRequest {
        name,
        description,
        minecraft_version,
        loader,
        image_path,
    };

    modpack.apply_updates(updates);
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

#[tauri::command]
async fn set_modpack_image(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    image_data: String,
) -> Result<String, String> {
    use tauri::Manager;

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let images_dir = app_data.join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images directory: {}", e))?;

    let image_bytes = BASE64.decode(image_data.as_bytes())
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let filename = format!("{}.png", modpack_id);
    let image_path = images_dir.join(&filename);

    std::fs::write(&image_path, &image_bytes)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    let relative_path = format!("images/{}", filename);
    modpack.set_image(Some(relative_path.clone()));
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(relative_path)
}

#[tauri::command]
async fn remove_modpack_image(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    use tauri::Manager;

    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if let Some(ref image_path) = modpack.image_path {
        let app_data = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let full_path = app_data.join(image_path);
        if full_path.exists() {
            let _ = std::fs::remove_file(full_path);
        }
    }

    modpack.set_image(None);
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(())
}

#[tauri::command]
async fn get_image_data(
    app_handle: tauri::AppHandle,
    relative_path: String,
) -> Result<String, String> {
    use tauri::Manager;

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let full_path = app_data.join(&relative_path);

    if !full_path.exists() {
        return Err("Image file not found".to_string());
    }

    let image_bytes = std::fs::read(&full_path)
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let base64_data = BASE64.encode(&image_bytes);

    let mime_type = match full_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/png",
    };

    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

#[tauri::command]
async fn delete_modpack(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    instance::delete_instance(&app_handle, &id)?;

    storage::delete_modpack_file(&app_handle, &id)
}

#[tauri::command]
async fn open_instance_folder(app_handle: tauri::AppHandle, modpack_id: String) -> Result<(), String> {
    let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;

    if !instance_dir.exists() {
        std::fs::create_dir_all(&instance_dir)
            .map_err(|e| format!("Failed to create instance directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&instance_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&instance_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&instance_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn add_mod_to_modpack(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    slug: String,
    title: String,
    version: String,
    author: String,
    icon_url: Option<String>,
    project_id: Option<String>,
    version_id: Option<String>,
    filename: Option<String>,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let mod_slug = slug.clone();
    let mod_info = ModpackMod {
        slug,
        title,
        version,
        author,
        icon_url,
        project_id: project_id.clone(),
        version_id: version_id.clone(),
        enabled: true,
        filename: filename.clone(),
    };

    modpack.add_mod(mod_info);
    storage::save_modpack(&app_handle, &modpack)?;

    if let Ok(Some(inst)) = instance::load_instance(&app_handle, &modpack_id) {
        if inst.installed {
            if let Ok(mods_dir) = instance::get_mods_dir(&app_handle, &modpack_id) {
                let version_to_download: Option<modrinth::Version> = if let Some(vid) = version_id {
                    modrinth::get_versions_batch(&[vid]).await.ok()
                        .and_then(|v| v.into_iter().next())
                } else if let Some(pid) = project_id {
                    modrinth::get_project_versions(
                        &pid,
                        Some(&modpack.minecraft_version),
                        Some(&modpack.loader),
                    ).await.ok()
                        .and_then(|versions| versions.into_iter().next())
                } else {
                    None
                };

                if let Some(version_info) = version_to_download {
                    let file = version_info.files.iter()
                        .find(|f| f.primary)
                        .or_else(|| version_info.files.first());

                    if let Some(file) = file {
                        let task = downloader::DownloadTask {
                            url: file.url.clone(),
                            path: mods_dir.join(&file.filename),
                            sha1: Some(file.hashes.sha1.clone()),
                            size: Some(file.size),
                            name: Some(file.filename.clone()),
                        };

                        let _ = downloader::download_batch(vec![task], 1, |_| {}).await;

                        if filename.is_none() {
                            let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;
                            if let Some(m) = modpack.mods.iter_mut().find(|m| m.slug == mod_slug) {
                                m.filename = Some(file.filename.clone());
                            }
                            storage::save_modpack(&app_handle, &modpack)?;
                        }
                    }
                }
            }
        }
    }

    storage::load_modpack(&app_handle, &modpack_id)
}

#[tauri::command]
async fn remove_mod_from_modpack(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    slug: String,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let mod_filename = modpack.mods.iter()
        .find(|m| m.slug == slug)
        .and_then(|m| m.filename.clone());

    if !modpack.remove_mod(&slug) {
        return Err(format!("Mod '{}' not found in modpack", slug));
    }

    storage::save_modpack(&app_handle, &modpack)?;

    if let Some(filename) = mod_filename {
        let mods_dir = instance::get_mods_dir(&app_handle, &modpack_id)?;
        let file_path = mods_dir.join(&filename);
        let disabled_path = mods_dir.join(format!("{}.disabled", filename));

        let _ = std::fs::remove_file(&file_path);
        let _ = std::fs::remove_file(&disabled_path);

        if filename.ends_with(".disabled") {
            let enabled_path = mods_dir.join(filename.trim_end_matches(".disabled"));
            let _ = std::fs::remove_file(&enabled_path);
        }
    }

    Ok(modpack)
}

#[tauri::command]
async fn toggle_mod_enabled(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    slug: String,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let mod_entry = modpack.mods.iter_mut()
        .find(|m| m.slug == slug)
        .ok_or_else(|| format!("Mod '{}' not found in modpack", slug))?;

    let new_enabled = !mod_entry.enabled;
    let stored_filename = mod_entry.filename.clone();

    let mods_dir = instance::get_mods_dir(&app_handle, &modpack_id)?;

    if mods_dir.exists() {
        let mut file_renamed = false;

        if let Some(ref filename) = stored_filename {
            let base_filename = filename.trim_end_matches(".disabled");
            let enabled_path = mods_dir.join(base_filename);
            let disabled_path = mods_dir.join(format!("{}.disabled", base_filename));

            if new_enabled && disabled_path.exists() {
                std::fs::rename(&disabled_path, &enabled_path)
                    .map_err(|e| format!("Failed to enable mod: {}", e))?;
                mod_entry.filename = Some(base_filename.to_string());
                file_renamed = true;
            } else if !new_enabled && enabled_path.exists() {
                std::fs::rename(&enabled_path, &disabled_path)
                    .map_err(|e| format!("Failed to disable mod: {}", e))?;
                mod_entry.filename = Some(format!("{}.disabled", base_filename));
                file_renamed = true;
            }
        }

        if !file_renamed {
            let entries = std::fs::read_dir(&mods_dir)
                .map_err(|e| format!("Failed to read mods directory: {}", e))?;

            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path.file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or("");

                let is_this_mod = filename.to_lowercase().contains(&slug.to_lowercase())
                    || filename.to_lowercase().contains(&mod_entry.title.to_lowercase().replace(" ", "-"))
                    || filename.to_lowercase().contains(&mod_entry.title.to_lowercase().replace(" ", ""));

                if is_this_mod && (filename.ends_with(".jar") || filename.ends_with(".jar.disabled")) {
                    let (new_path, new_filename) = if new_enabled {
                        if filename.ends_with(".jar.disabled") {
                            let new_name = filename.trim_end_matches(".disabled");
                            (mods_dir.join(new_name), new_name.to_string())
                        } else {
                            continue;
                        }
                    } else {
                        if filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
                            let new_name = format!("{}.disabled", filename);
                            (mods_dir.join(&new_name), new_name)
                        } else {
                            continue;
                        }
                    };

                    std::fs::rename(&path, &new_path)
                        .map_err(|e| format!("Failed to rename mod file: {}", e))?;
                    mod_entry.filename = Some(new_filename);
                    break;
                }
            }
        }
    }

    mod_entry.enabled = new_enabled;
    modpack.updated_at = chrono::Utc::now().to_rfc3339();

    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

#[derive(Debug, Deserialize)]
struct FabricModJson {
    id: String,
    name: Option<String>,
    version: Option<String>,
    authors: Option<Vec<FabricAuthor>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum FabricAuthor {
    Simple(String),
    Complex { name: String },
}

impl FabricAuthor {
    fn name(&self) -> &str {
        match self {
            FabricAuthor::Simple(s) => s,
            FabricAuthor::Complex { name } => name,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DetectedMod {
    pub filename: String,
    pub mod_id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub modrinth_slug: Option<String>,
    pub modrinth_title: Option<String>,
    pub modrinth_icon_url: Option<String>,
    pub modrinth_project_id: Option<String>,
}

fn read_fabric_mod_json(jar_path: &std::path::Path) -> Option<FabricModJson> {
    let file = std::fs::File::open(jar_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    let mut fabric_mod = archive.by_name("fabric.mod.json").ok()?;
    let mut contents = String::new();
    fabric_mod.read_to_string(&mut contents).ok()?;

    serde_json::from_str(&contents).ok()
}

#[tauri::command]
async fn scan_mods_folder(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<Vec<DetectedMod>, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    let mods_dir = instance::get_mods_dir(&app_handle, &modpack_id)?;

    if !mods_dir.exists() {
        return Ok(vec![]);
    }

    let tracked_slugs: std::collections::HashSet<String> = modpack.mods.iter()
        .map(|m| m.slug.to_lowercase())
        .collect();

    let tracked_project_ids: std::collections::HashSet<String> = modpack.mods.iter()
        .filter_map(|m| m.project_id.as_ref().map(|id| id.to_lowercase()))
        .collect();

    let tracked_filenames: std::collections::HashSet<String> = modpack.mods.iter()
        .filter_map(|m| m.filename.as_ref().map(|f| f.to_lowercase()))
        .collect();

    let mut detected_mods = Vec::new();

    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read mods directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = path.file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();

        if !filename.ends_with(".jar") || filename.ends_with(".jar.disabled") {
            continue;
        }

        if tracked_filenames.contains(&filename.to_lowercase()) {
            continue;
        }
        let disabled_filename = format!("{}.disabled", filename);
        if tracked_filenames.contains(&disabled_filename.to_lowercase()) {
            continue;
        }

        if let Some(fabric_mod) = read_fabric_mod_json(&path) {
            let mod_id = fabric_mod.id.clone();
            let mod_name = fabric_mod.name.unwrap_or_else(|| mod_id.clone());
            let mod_version = fabric_mod.version.unwrap_or_else(|| "unknown".to_string());
            let mod_author = fabric_mod.authors
                .and_then(|a| a.first().map(|author| author.name().to_string()))
                .unwrap_or_else(|| "Unknown".to_string());

            if tracked_slugs.contains(&mod_id.to_lowercase()) {
                continue;
            }

            let modrinth_info = modrinth::get_project(&mod_id).await.ok();

            if let Some(ref info) = modrinth_info {
                if tracked_slugs.contains(&info.slug.to_lowercase()) {
                    continue;
                }
                if tracked_project_ids.contains(&info.id.to_lowercase()) {
                    continue;
                }
            }

            detected_mods.push(DetectedMod {
                filename,
                mod_id: mod_id.clone(),
                name: mod_name,
                version: mod_version,
                author: mod_author,
                modrinth_slug: modrinth_info.as_ref().map(|p| p.slug.clone()),
                modrinth_title: modrinth_info.as_ref().map(|p| p.title.clone()),
                modrinth_icon_url: modrinth_info.as_ref().and_then(|p| p.icon_url.clone()),
                modrinth_project_id: modrinth_info.map(|p| p.id),
            });
        }
    }

    Ok(detected_mods)
}

#[tauri::command]
async fn sync_mod_filenames(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    let mods_dir = instance::get_mods_dir(&app_handle, &modpack_id)?;

    if !mods_dir.exists() {
        return Ok(modpack);
    }

    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read mods directory: {}", e))?;

    let mut mod_id_to_filename: HashMap<String, String> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = path.file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("")
            .to_string();

        if !filename.ends_with(".jar") && !filename.ends_with(".jar.disabled") {
            continue;
        }

        if let Some(fabric_mod) = read_fabric_mod_json(&path) {
            mod_id_to_filename.insert(fabric_mod.id.to_lowercase(), filename);
        }
    }

    let mut updated = false;
    for mod_entry in &mut modpack.mods {
        if mod_entry.filename.is_none() {
            if let Some(filename) = mod_id_to_filename.get(&mod_entry.slug.to_lowercase()) {
                mod_entry.filename = Some(filename.clone());
                updated = true;
            }
        }
    }

    if updated {
        storage::save_modpack(&app_handle, &modpack)?;
    }

    Ok(modpack)
}

#[tauri::command]
async fn import_detected_mod(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    mod_id: String,
    name: String,
    version: String,
    author: String,
    filename: String,
    modrinth_slug: Option<String>,
    modrinth_icon_url: Option<String>,
    modrinth_project_id: Option<String>,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let slug = modrinth_slug.unwrap_or_else(|| mod_id.clone());

    let mod_info = ModpackMod {
        slug,
        title: name,
        version,
        author,
        icon_url: modrinth_icon_url,
        project_id: modrinth_project_id,
        version_id: None,
        enabled: true,
        filename: Some(filename),
    };

    modpack.add_mod(mod_info);
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

#[tauri::command]
async fn get_mod_with_dependencies(
    slug: String,
    game_version: String,
    loader: String,
) -> Result<ModWithDependencies, String> {
    let project = modrinth::get_project(&slug).await?;

    let versions = modrinth::get_project_versions(
        &slug,
        Some(&game_version),
        Some(&loader),
    )
    .await?;

    if versions.is_empty() {
        return Err(format!(
            "No compatible version found for {} on {} with {}",
            slug, game_version, loader
        ));
    }

    let latest_version = &versions[0];

    let team = modrinth::get_project_team(&project.id).await.unwrap_or_default();
    let author = team
        .iter()
        .find(|m| m.role == "Owner")
        .map(|m| m.user.username.clone())
        .unwrap_or_else(|| "Unknown".to_string());

    let dep_project_ids: Vec<String> = latest_version
        .dependencies
        .iter()
        .filter(|d| d.dependency_type == "required" || d.dependency_type == "optional")
        .filter_map(|d| d.project_id.clone())
        .collect();

    let mut dependencies = Vec::new();

    if !dep_project_ids.is_empty() {
        let dep_projects = modrinth::get_projects_batch(&dep_project_ids).await?;

        let dep_types: std::collections::HashMap<String, String> = latest_version
            .dependencies
            .iter()
            .filter_map(|d| {
                d.project_id
                    .clone()
                    .map(|id| (id, d.dependency_type.clone()))
            })
            .collect();

        for dep_project in dep_projects {
            let dep_team = modrinth::get_project_team(&dep_project.id)
                .await
                .unwrap_or_default();
            let dep_author = dep_team
                .iter()
                .find(|m| m.role == "Owner")
                .map(|m| m.user.username.clone())
                .unwrap_or_else(|| "Unknown".to_string());

            let dep_type = dep_types
                .get(&dep_project.id)
                .cloned()
                .unwrap_or_else(|| "required".to_string());

            dependencies.push(DependencyInfo {
                slug: dep_project.slug,
                title: dep_project.title,
                author: dep_author,
                icon_url: dep_project.icon_url,
                project_id: dep_project.id,
                dependency_type: dep_type,
            });
        }
    }

    Ok(ModWithDependencies {
        mod_info: ModInfo {
            slug: project.slug,
            title: project.title,
            author,
            icon_url: project.icon_url,
            version_id: latest_version.id.clone(),
            version_number: latest_version.version_number.clone(),
        },
        dependencies,
    })
}

#[tauri::command]
async fn start_sharing(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    port: u16,
    public_ip: String,
) -> Result<String, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if !modpack.is_owner {
        return Err("You can only share modpacks you own".to_string());
    }

    server::start_server(app_handle.clone(), modpack_id.clone(), port).await?;

    let raw = format!("{}:{}:{}", public_ip, port, modpack_id);
    let share_code = BASE64.encode(raw.as_bytes());

    modpack.share_code = Some(share_code.clone());
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(share_code)
}

#[tauri::command]
async fn stop_sharing(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    let _ = server::stop_server().await;

    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    modpack.share_code = None;
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(())
}

#[tauri::command]
async fn get_sharing_status() -> Result<bool, String> {
    Ok(server::is_server_running().await)
}

#[tauri::command]
async fn join_modpack(
    app_handle: tauri::AppHandle,
    share_code: String,
) -> Result<Modpack, String> {
    let decoded_bytes = BASE64.decode(share_code.as_bytes())
        .map_err(|_| "Invalid share code format")?;
    let decoded = String::from_utf8(decoded_bytes)
        .map_err(|_| "Invalid share code encoding")?;

    let parts: Vec<&str> = decoded.split(':').collect();
    if parts.len() != 3 {
        return Err("Invalid share code format".to_string());
    }

    let (ip, port, _modpack_id) = (parts[0], parts[1], parts[2]);
    let owner_address = format!("{}:{}", ip, port);

    let url = format!("http://{}/modpack", owner_address);
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to owner: {}. Make sure they are online and sharing.", e))?;

    if !response.status().is_success() {
        return Err(format!("Owner returned error: {}", response.status()));
    }

    let remote_modpack: Modpack = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse modpack data: {}", e))?;

    let existing = storage::load_all_modpacks(&app_handle)?;
    for existing_pack in existing {
        if existing_pack.owner_address.as_deref() == Some(&owner_address)
            && existing_pack.name == remote_modpack.name
        {
            return Err(format!(
                "You've already joined this modpack. Use sync to update it."
            ));
        }
    }

    let local_modpack = Modpack::from_joined(remote_modpack, owner_address);
    storage::save_modpack(&app_handle, &local_modpack)?;

    Ok(local_modpack)
}

#[tauri::command]
async fn sync_modpack(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if modpack.is_owner {
        return Err("Cannot sync a modpack you own. You are the source!".to_string());
    }

    let owner_address = modpack
        .owner_address
        .as_ref()
        .ok_or("This modpack doesn't have an owner address. It may not be a joined modpack.")?;

    let url = format!("http://{}/modpack", owner_address);
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to owner: {}. They may be offline.", e))?;

    if !response.status().is_success() {
        return Err(format!("Owner returned error: {}", response.status()));
    }

    let remote_modpack: Modpack = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse modpack data: {}", e))?;

    modpack.name = remote_modpack.name;
    modpack.description = remote_modpack.description;
    modpack.minecraft_version = remote_modpack.minecraft_version;
    modpack.loader = remote_modpack.loader;
    modpack.mods = remote_modpack.mods;
    modpack.updated_at = chrono::Utc::now().to_rfc3339();

    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

#[derive(Debug, Serialize)]
pub struct SyncStatus {
    pub is_synced: bool,
    pub owner_online: bool,
    pub remote_mod_count: Option<usize>,
    pub local_mod_count: usize,
}

#[tauri::command]
async fn check_sync_status(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<SyncStatus, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if modpack.is_owner {
        return Ok(SyncStatus {
            is_synced: true,
            owner_online: true,
            remote_mod_count: None,
            local_mod_count: modpack.mods.len(),
        });
    }

    let owner_address = modpack
        .owner_address
        .as_ref()
        .ok_or("No owner address")?;

    let url = format!("http://{}/modpack", owner_address);
    let client = reqwest::Client::new();

    let response = match client
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(_) => {
            return Ok(SyncStatus {
                is_synced: false,
                owner_online: false,
                remote_mod_count: None,
                local_mod_count: modpack.mods.len(),
            });
        }
    };

    if !response.status().is_success() {
        return Ok(SyncStatus {
            is_synced: false,
            owner_online: false,
            remote_mod_count: None,
            local_mod_count: modpack.mods.len(),
        });
    }

    let remote_modpack: Modpack = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse: {}", e))?;

    let local_slugs: std::collections::HashSet<_> = modpack.mods.iter().map(|m| &m.slug).collect();
    let remote_slugs: std::collections::HashSet<_> = remote_modpack.mods.iter().map(|m| &m.slug).collect();

    let is_synced = local_slugs == remote_slugs
        && modpack.name == remote_modpack.name
        && modpack.minecraft_version == remote_modpack.minecraft_version
        && modpack.loader == remote_modpack.loader;

    Ok(SyncStatus {
        is_synced,
        owner_online: true,
        remote_mod_count: Some(remote_modpack.mods.len()),
        local_mod_count: modpack.mods.len(),
    })
}

#[derive(Debug, Serialize, Clone)]
pub struct InstallProgress {
    pub stage: String,
    pub current: u64,
    pub total: u64,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct InstallStatus {
    pub installed: bool,
    pub installing: bool,
    pub minecraft_version: Option<String>,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub last_played: Option<String>,
    pub progress: Option<InstallProgress>,
}

#[tauri::command]
async fn get_install_status(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<InstallStatus, String> {
    let installing = {
        let installing_map = INSTALLING.lock().map_err(|e| e.to_string())?;
        installing_map.get(&modpack_id).copied().unwrap_or(false)
    };

    let progress = if installing {
        let progress_map = INSTALL_PROGRESS.lock().map_err(|e| e.to_string())?;
        progress_map.get(&modpack_id).cloned()
    } else {
        None
    };

    match instance::load_instance(&app_handle, &modpack_id)? {
        Some(inst) => Ok(InstallStatus {
            installed: inst.installed,
            installing,
            minecraft_version: Some(inst.minecraft_version),
            loader: Some(inst.loader),
            loader_version: inst.loader_version,
            last_played: inst.last_played,
            progress,
        }),
        None => Ok(InstallStatus {
            installed: false,
            installing,
            minecraft_version: None,
            loader: None,
            loader_version: None,
            last_played: None,
            progress,
        }),
    }
}

fn update_progress(app_handle: &tauri::AppHandle, modpack_id: &str, progress: InstallProgress) {
    use tauri::Emitter;

    if let Ok(mut progress_map) = INSTALL_PROGRESS.lock() {
        progress_map.insert(modpack_id.to_string(), progress.clone());
    }

    let _ = app_handle.emit("install-progress", progress);
}

async fn do_install_instance(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    {
        let mut installing_map = INSTALLING.lock().map_err(|e| e.to_string())?;
        installing_map.insert(modpack_id.clone(), true);
    }

    let result = do_install_instance_inner(&app_handle, &modpack_id).await;

    {
        if let Ok(mut installing_map) = INSTALLING.lock() {
            installing_map.remove(&modpack_id);
        }
        if let Ok(mut progress_map) = INSTALL_PROGRESS.lock() {
            progress_map.remove(&modpack_id);
        }
    }

    result
}

async fn do_install_instance_inner(
    app_handle: &tauri::AppHandle,
    modpack_id: &str,
) -> Result<(), String> {
    let modpack = storage::load_modpack(app_handle, modpack_id)?;

    instance::create_instance_dirs(app_handle, modpack_id, &modpack.name)?;

    let instance_dir = instance::get_instance_dir(app_handle, modpack_id)?;
    let libraries_dir = instance::get_libraries_dir(app_handle, modpack_id)?;
    let mods_dir = instance::get_mods_dir(app_handle, modpack_id)?;

    let mut inst = instance::Instance::new(
        modpack_id.to_string(),
        modpack.minecraft_version.clone(),
        modpack.loader.clone(),
    );

    let app_handle_clone = app_handle.clone();
    let modpack_id_clone = modpack_id.to_string();
    let emit_progress = move |progress: downloader::DownloadProgress| {
        update_progress(&app_handle_clone, &modpack_id_clone, InstallProgress {
            stage: "downloading_minecraft".to_string(),
            current: progress.downloaded_files,
            total: progress.total_files,
            message: format!("Downloading: {}", progress.current_file),
        });
    };

    let version_meta = minecraft::download_minecraft(
        app_handle,
        modpack_id,
        &modpack.minecraft_version,
        emit_progress,
    ).await?;

    update_progress(app_handle, modpack_id, InstallProgress {
        stage: "extracting_natives".to_string(),
        current: 0,
        total: 1,
        message: "Extracting native libraries...".to_string(),
    });

    launcher::extract_natives(&instance_dir, &version_meta).await?;

    let _fabric_profile = if modpack.loader.to_lowercase() == "fabric" {
        update_progress(app_handle, modpack_id, InstallProgress {
            stage: "installing_loader".to_string(),
            current: 0,
            total: 1,
            message: "Installing Fabric loader...".to_string(),
        });

        let app_handle_clone = app_handle.clone();
        let modpack_id_clone = modpack_id.to_string();
        let loader_progress = move |progress: downloader::DownloadProgress| {
            update_progress(&app_handle_clone, &modpack_id_clone, InstallProgress {
                stage: "installing_loader".to_string(),
                current: progress.downloaded_files,
                total: progress.total_files,
                message: format!("Downloading: {}", progress.current_file),
            });
        };

        let (loader_version, profile) = loaders::fabric::install_fabric(
            &instance_dir,
            &modpack.minecraft_version,
            &libraries_dir,
            loader_progress,
        ).await?;

        inst.loader_version = Some(loader_version);
        Some(profile)
    } else {
        None
    };

    let mods_with_version_id: Vec<_> = modpack.mods.iter()
        .filter(|m| m.version_id.is_some())
        .collect();

    let mods_with_only_project_id: Vec<_> = modpack.mods.iter()
        .filter(|m| m.version_id.is_none() && m.project_id.is_some())
        .collect();

    let total_mods = mods_with_version_id.len() + mods_with_only_project_id.len();

    if total_mods > 0 {
        update_progress(app_handle, modpack_id, InstallProgress {
            stage: "downloading_mods".to_string(),
            current: 0,
            total: total_mods as u64,
            message: "Fetching mod information...".to_string(),
        });

        let mut mod_tasks: Vec<downloader::DownloadTask> = vec![];

        if !mods_with_version_id.is_empty() {
            let version_ids: Vec<String> = mods_with_version_id.iter()
                .filter_map(|m| m.version_id.clone())
                .collect();

            let versions = modrinth::get_versions_batch(&version_ids).await?;

            for version in &versions {
                let file = version.files.iter()
                    .find(|f| f.primary)
                    .or_else(|| version.files.first());

                if let Some(file) = file {
                    mod_tasks.push(downloader::DownloadTask {
                        url: file.url.clone(),
                        path: mods_dir.join(&file.filename),
                        sha1: Some(file.hashes.sha1.clone()),
                        size: Some(file.size),
                        name: Some(file.filename.clone()),
                    });
                }
            }
        }

        for dep_mod in &mods_with_only_project_id {
            if let Some(ref project_id) = dep_mod.project_id {
                match modrinth::get_project_versions(
                    project_id,
                    Some(&modpack.minecraft_version),
                    Some(&modpack.loader),
                ).await {
                    Ok(versions) if !versions.is_empty() => {
                        let version = &versions[0];
                        let file = version.files.iter()
                            .find(|f| f.primary)
                            .or_else(|| version.files.first());

                        if let Some(file) = file {
                            mod_tasks.push(downloader::DownloadTask {
                                url: file.url.clone(),
                                path: mods_dir.join(&file.filename),
                                sha1: Some(file.hashes.sha1.clone()),
                                size: Some(file.size),
                                name: Some(file.filename.clone()),
                            });
                        }
                    }
                    Ok(_) => {
                        eprintln!("[WARN] No compatible version found for dependency {} on {} with {}",
                            dep_mod.slug, modpack.minecraft_version, modpack.loader);
                    }
                    Err(e) => {
                        eprintln!("[WARN] Failed to fetch versions for dependency {}: {}", dep_mod.slug, e);
                    }
                }
            }
        }

        let app_handle_clone = app_handle.clone();
        let modpack_id_clone = modpack_id.to_string();
        let mod_progress = move |progress: downloader::DownloadProgress| {
            update_progress(&app_handle_clone, &modpack_id_clone, InstallProgress {
                stage: "downloading_mods".to_string(),
                current: progress.downloaded_files,
                total: progress.total_files,
                message: format!("Downloading: {}", progress.current_file),
            });
        };

        downloader::download_batch(mod_tasks, 5, mod_progress).await?;
    }

    inst.installed = true;
    instance::save_instance(app_handle, &inst)?;

    update_progress(app_handle, modpack_id, InstallProgress {
        stage: "complete".to_string(),
        current: 1,
        total: 1,
        message: "Installation complete!".to_string(),
    });

    Ok(())
}

#[tauri::command]
async fn install_instance(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    do_install_instance(app_handle, modpack_id).await
}

#[tauri::command]
async fn start_install(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    {
        let installing_map = INSTALLING.lock().map_err(|e| e.to_string())?;
        if installing_map.get(&modpack_id).copied().unwrap_or(false) {
            return Err("Installation already in progress".to_string());
        }
    }

    let app_handle_clone = app_handle.clone();
    let modpack_id_clone = modpack_id.clone();

    tokio::spawn(async move {
        if let Err(e) = do_install_instance(app_handle_clone, modpack_id_clone).await {
            eprintln!("Installation failed: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
async fn launch_instance(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
    let account = auth::get_default_account(&app_handle)?
        .ok_or("No account logged in. Please add a Microsoft account first.")?;

    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    let inst = instance::load_instance(&app_handle, &modpack_id)?
        .ok_or("Instance not found. Please install first.")?;

    if !inst.installed {
        return Err("Instance not installed. Please install first.".to_string());
    }

    let fabric_profile = if modpack.loader.to_lowercase() == "fabric" {
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
        let loader_version = inst.loader_version.as_ref()
            .ok_or("Loader version not found")?;

        let fabric_version_id = format!("fabric-loader-{}-{}", loader_version, modpack.minecraft_version);
        let fabric_json_path = instance_dir
            .join("versions")
            .join(&fabric_version_id)
            .join(format!("{}.json", fabric_version_id));

        eprintln!("[DEBUG] Looking for Fabric profile at: {:?}", fabric_json_path);
        eprintln!("[DEBUG] Fabric profile exists: {}", fabric_json_path.exists());

        if fabric_json_path.exists() {
            let content = std::fs::read_to_string(&fabric_json_path)
                .map_err(|e| format!("Failed to read Fabric profile: {}", e))?;
            Some(serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse Fabric profile: {}", e))?)
        } else {
            eprintln!("[ERROR] Fabric profile not found! Fabric libraries will not be in classpath.");
            None
        }
    } else {
        None
    };

    let settings = storage::load_settings(&app_handle).unwrap_or_default();

    let options = launcher::LaunchOptions {
        username: account.username,
        uuid: account.uuid,
        access_token: account.access_token,
        memory_min: settings.memory_min.or(Some("512M".to_string())),
        memory_max: settings.memory_max.or(Some("4G".to_string())),
        java_path: settings.java_path,
        game_dir: None,
    };

    launcher::launch_game(&app_handle, &modpack_id, options, fabric_profile).await
}

#[tauri::command]
async fn find_java() -> Result<launcher::JavaRuntime, String> {
    launcher::find_java()
}

#[tauri::command]
async fn find_all_java() -> Result<Vec<launcher::JavaRuntime>, String> {
    Ok(launcher::find_all_java())
}

#[tauri::command]
async fn get_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    storage::load_settings(&app_handle)
}

#[tauri::command]
async fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    storage::save_settings(&app_handle, &settings)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct AppSettings {
    pub java_path: Option<String>,
    pub memory_min: Option<String>,
    pub memory_max: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DeviceCodeInfo {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
    pub interval: i32,
}

#[tauri::command]
async fn start_login() -> Result<DeviceCodeInfo, String> {
    let response = auth::request_device_code().await?;
    Ok(DeviceCodeInfo {
        device_code: response.device_code,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        message: response.message,
        interval: response.interval,
    })
}

#[tauri::command]
async fn complete_login(
    app_handle: tauri::AppHandle,
    device_code: String,
    interval: i32,
) -> Result<auth::MinecraftAccount, String> {
    let (ms_token, refresh_token) = auth::poll_for_token(&device_code, interval).await?;

    let account = auth::complete_authentication(&ms_token, &refresh_token).await?;

    auth::add_account(&app_handle, account.clone())?;

    Ok(account)
}

#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub uuid: String,
    pub username: String,
    pub skin_url: Option<String>,
    pub is_default: bool,
}

#[tauri::command]
async fn list_accounts(app_handle: tauri::AppHandle) -> Result<Vec<AccountInfo>, String> {
    let data = auth::load_accounts(&app_handle)?;
    Ok(data.accounts.into_iter().map(|a| AccountInfo {
        uuid: a.uuid,
        username: a.username,
        skin_url: a.skin_url,
        is_default: a.is_default,
    }).collect())
}

#[tauri::command]
async fn set_default_account(
    app_handle: tauri::AppHandle,
    uuid: String,
) -> Result<(), String> {
    auth::set_default_account(&app_handle, &uuid)
}

#[tauri::command]
async fn remove_account(
    app_handle: tauri::AppHandle,
    uuid: String,
) -> Result<(), String> {
    auth::remove_account(&app_handle, &uuid)
}

#[tauri::command]
async fn get_default_account(app_handle: tauri::AppHandle) -> Result<Option<AccountInfo>, String> {
    let account = auth::get_default_account(&app_handle)?;
    Ok(account.map(|a| AccountInfo {
        uuid: a.uuid,
        username: a.username,
        skin_url: a.skin_url,
        is_default: a.is_default,
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            search_mods,
            get_mod_categories,
            get_mod_loaders,
            get_game_versions,
            get_mod_versions,
            create_modpack,
            list_modpacks,
            get_modpack,
            update_modpack,
            delete_modpack,
            add_mod_to_modpack,
            remove_mod_from_modpack,
            toggle_mod_enabled,
            scan_mods_folder,
            sync_mod_filenames,
            import_detected_mod,
            get_mod_with_dependencies,
            start_sharing,
            stop_sharing,
            get_sharing_status,
            join_modpack,
            sync_modpack,
            check_sync_status,
            get_install_status,
            install_instance,
            start_install,
            launch_instance,
            find_java,
            open_instance_folder,
            start_login,
            complete_login,
            list_accounts,
            set_default_account,
            remove_account,
            get_default_account,
            find_all_java,
            get_settings,
            save_settings,
            set_modpack_image,
            remove_modpack_image,
            get_image_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
