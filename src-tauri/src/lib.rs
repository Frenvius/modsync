mod auth;
mod downloader;
mod games;
mod instance;
mod launcher;
mod loaders;
mod minecraft;
mod modpack;
mod modrinth;
mod server;
mod sources;
mod storage;
mod sync;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use games::GameInfo;
use modpack::{CreateModpackRequest, Modpack, ModpackMod, UpdateModpackRequest};
use modrinth::{Category, GameVersion, Loader, SearchParams, SearchResult};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

static INSTALL_PROGRESS: Lazy<Mutex<HashMap<String, InstallProgress>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static INSTALLING: Lazy<Mutex<HashMap<String, bool>>> = Lazy::new(|| Mutex::new(HashMap::new()));

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
async fn list_games() -> Result<Vec<GameInfo>, String> {
    Ok(games::list_games())
}

#[tauri::command]
async fn search_mods(
    app_handle: tauri::AppHandle,
    game_id: Option<String>,
    query: Option<String>,
    game_version: Option<String>,
    loader: Option<String>,
    categories: Option<Vec<String>>,
    sort: Option<String>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> Result<SearchResult, String> {
    let resolved_game_id = game_id.as_deref().unwrap_or("minecraft");

    if resolved_game_id != "minecraft" {
        if let Some(game) = games::get_game(resolved_game_id) {
            if game.mod_source == "thunderstore" {
                if let Some(community) = game.thunderstore_community {
                    let page = offset.map(|o| {
                        let size = limit.unwrap_or(20);
                        (o / size) + 1
                    });
                    let cache_dir = app_handle
                        .path()
                        .app_data_dir()
                        .map_err(|e| format!("Failed to get app data dir: {}", e))?
                        .join("cache");
                    return sources::thunderstore::search_mods(
                        &community,
                        query.as_deref(),
                        categories.as_deref(),
                        sort.as_deref(),
                        page,
                        limit,
                        &cache_dir,
                    )
                    .await;
                }
            }
        }
    }

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
async fn get_mod_categories(
    app_handle: tauri::AppHandle,
    game_id: Option<String>,
) -> Result<Vec<Category>, String> {
    let resolved = game_id.as_deref().unwrap_or("minecraft");

    if resolved != "minecraft" {
        if let Some(game) = games::get_game(resolved) {
            if game.mod_source == "thunderstore" {
                if let Some(community) = game.thunderstore_community {
                    let cache_dir = app_handle
                        .path()
                        .app_data_dir()
                        .map_err(|e| format!("Failed to get app data dir: {}", e))?
                        .join("cache");
                    let cat_names =
                        sources::thunderstore::get_categories(&community, &cache_dir).await?;
                    return Ok(cat_names
                        .into_iter()
                        .map(|name| Category {
                            name: name.clone(),
                            project_type: "mod".to_string(),
                            header: "categories".to_string(),
                            icon: name,
                        })
                        .collect());
                }
            }
        }
        return Ok(vec![]);
    }
    modrinth::get_categories().await
}

#[tauri::command]
async fn get_thunderstore_fetch_progress(
    community: String,
) -> Result<Option<sources::thunderstore::FetchProgress>, String> {
    Ok(sources::thunderstore::get_fetch_progress(&community))
}

#[tauri::command]
async fn check_thunderstore_updates(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    skip_loaders: Option<bool>,
) -> Result<sources::thunderstore::UpdateCheckResult, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let game = games::get_game(&modpack.game_id)
        .ok_or_else(|| format!("Unknown game: {}", modpack.game_id))?;

    if game.mod_source != "thunderstore" {
        return Err("This command is only for Thunderstore games".to_string());
    }

    let community = game
        .thunderstore_community
        .as_ref()
        .ok_or("Game has no Thunderstore community configured")?;

    let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("cache");

    sources::thunderstore::check_for_updates(
        community,
        &instance_dir,
        skip_loaders.unwrap_or(true),
        Some(&cache_dir),
    )
    .await
}

#[tauri::command]
async fn update_thunderstore_mod(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    full_name: String,
) -> Result<sources::thunderstore::UpdateResult, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let game = games::get_game(&modpack.game_id)
        .ok_or_else(|| format!("Unknown game: {}", modpack.game_id))?;

    if game.mod_source != "thunderstore" {
        return Err("This command is only for Thunderstore games".to_string());
    }

    let community = game
        .thunderstore_community
        .as_ref()
        .ok_or("Game has no Thunderstore community configured")?;

    let loader_config = game.loader.as_ref();
    let loader_name = loader_config.map(|lc| lc.loader_type.name());

    let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
    let cache_base = instance::get_cache_dir(&app_handle)?;

    sources::thunderstore::update_mod(
        &cache_base,
        &instance_dir,
        community,
        &full_name,
        &modpack.game_id,
        loader_name,
    )
    .await
}

#[tauri::command]
async fn update_all_thunderstore_mods(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    skip_loaders: Option<bool>,
) -> Result<sources::thunderstore::BatchUpdateResult, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let game = games::get_game(&modpack.game_id)
        .ok_or_else(|| format!("Unknown game: {}", modpack.game_id))?;

    if game.mod_source != "thunderstore" {
        return Err("This command is only for Thunderstore games".to_string());
    }

    let community = game
        .thunderstore_community
        .as_ref()
        .ok_or("Game has no Thunderstore community configured")?;

    let loader_config = game.loader.as_ref();
    let loader_name = loader_config.map(|lc| lc.loader_type.name());

    let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
    let cache_base = instance::get_cache_dir(&app_handle)?;

    sources::thunderstore::update_all_mods(
        &cache_base,
        &instance_dir,
        community,
        &modpack.game_id,
        loader_name,
        skip_loaders.unwrap_or(true),
    )
    .await
}

#[tauri::command]
async fn get_mod_loaders(game_id: Option<String>) -> Result<Vec<Loader>, String> {
    let resolved = game_id.as_deref().unwrap_or("minecraft");
    if resolved != "minecraft" {
        return Ok(vec![]);
    }
    modrinth::get_loaders().await
}

#[tauri::command]
async fn get_game_versions(game_id: Option<String>) -> Result<Vec<GameVersion>, String> {
    let resolved = game_id.as_deref().unwrap_or("minecraft");
    if resolved != "minecraft" {
        return Ok(vec![]);
    }
    modrinth::get_game_versions().await
}

#[tauri::command]
async fn get_mod_versions(
    slug: String,
    game_version: Option<String>,
    loader: Option<String>,
    source: Option<String>,
    thunderstore_community: Option<String>,
) -> Result<Vec<modrinth::Version>, String> {
    match source.as_deref() {
        Some("thunderstore") => {
            let community = thunderstore_community
                .ok_or_else(|| "Thunderstore community is required".to_string())?;

            let parts: Vec<&str> = slug.splitn(2, '-').collect();
            if parts.len() != 2 {
                return Err(format!("Invalid Thunderstore slug format: {}", slug));
            }
            let (owner, name) = (parts[0], parts[1]);

            let ts_versions =
                sources::thunderstore::get_package_versions(&community, owner, name).await?;

            let versions: Vec<modrinth::Version> = ts_versions
                .into_iter()
                .map(|v| modrinth::Version {
                    id: v.id,
                    project_id: slug.clone(),
                    name: v.name,
                    version_number: v.version_number,
                    game_versions: vec![],
                    loaders: vec![],
                    dependencies: vec![],
                    date_published: v.date_published,
                    files: vec![modrinth::VersionFile {
                        url: v.download_url,
                        filename: format!("{}.zip", slug),
                        hashes: modrinth::FileHashes {
                            sha1: String::new(),
                            sha512: String::new(),
                        },
                        size: 0,
                        primary: true,
                    }],
                })
                .collect();

            Ok(versions)
        }
        _ => {
            modrinth::get_project_versions(&slug, game_version.as_deref(), loader.as_deref()).await
        }
    }
}

#[tauri::command]
async fn create_modpack(
    app_handle: tauri::AppHandle,
    name: String,
    description: Option<String>,
    game_id: Option<String>,
    game_version: String,
    loader: Option<String>,
) -> Result<Modpack, String> {
    let resolved_game_id = game_id.unwrap_or_else(|| "minecraft".to_string());
    let request = CreateModpackRequest {
        name: name.clone(),
        description,
        game_id: resolved_game_id.clone(),
        game_version,
        loader,
    };

    let modpack = Modpack::new(request);
    storage::save_modpack(&app_handle, &modpack)?;

    let game = games::get_game(&resolved_game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        instance::create_instance_dirs_for_game(
            &app_handle,
            &modpack.id,
            &name,
            Some("thunderstore"),
        )?;
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack.id)?;
        sources::thunderstore::profile::save_mods_yml(&instance_dir, &vec![])?;
    }

    Ok(modpack)
}

#[tauri::command]
async fn list_modpacks(app_handle: tauri::AppHandle) -> Result<Vec<Modpack>, String> {
    let mut modpacks = storage::load_all_modpacks(&app_handle)?;

    for modpack in &mut modpacks {
        let game = games::get_game(&modpack.game_id);
        let is_thunderstore = game
            .as_ref()
            .map(|g| g.mod_source == "thunderstore")
            .unwrap_or(false);

        if is_thunderstore {
            if let Ok(instance_dir) = instance::get_instance_dir(&app_handle, &modpack.id) {
                if instance_dir.exists() {
                    if let Ok(mods) = sources::thunderstore::profile::load_mods_yml(&instance_dir) {
                        modpack.mods = mods
                            .into_iter()
                            .map(|m| ModpackMod {
                                slug: m.name.clone(),
                                title: m.display_name.clone(),
                                version: m.version_number.to_string(),
                                author: m.author_name.clone(),
                                icon_url: m.icon.clone(),
                                project_id: None,
                                version_id: None,
                                enabled: m.enabled,
                                filename: None,
                                is_loader: games::is_loader_package(&m.name),
                            })
                            .collect();
                    }
                }
            }
        }
    }

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
    let mut modpack = storage::load_modpack(&app_handle, &id)?;

    let game = games::get_game(&modpack.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        if let Ok(instance_dir) = instance::get_instance_dir(&app_handle, &id) {
            if instance_dir.exists() {
                if let Ok(mods) = sources::thunderstore::profile::load_mods_yml(&instance_dir) {
                    modpack.mods = mods
                        .into_iter()
                        .map(|m| ModpackMod {
                            slug: m.name.clone(),
                            title: m.display_name.clone(),
                            version: m.version_number.to_string(),
                            author: m.author_name.clone(),
                            icon_url: m.icon.clone(),
                            project_id: None,
                            version_id: None,
                            enabled: m.enabled,
                            filename: None,
                            is_loader: games::is_loader_package(&m.name),
                        })
                        .collect();
                }
            }
        }
    }

    Ok(modpack)
}

#[tauri::command]
async fn update_modpack(
    app_handle: tauri::AppHandle,
    id: String,
    name: Option<String>,
    description: Option<String>,
    game_version: Option<String>,
    loader: Option<String>,
    image_path: Option<String>,
) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &id)?;

    if !modpack.is_owner {
        return Err("Cannot modify a joined modpack. Clone it first to make changes.".to_string());
    }

    let updates = UpdateModpackRequest {
        name,
        description,
        game_version,
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

    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    if !modpack.is_owner {
        return Err("Cannot modify a joined modpack. Clone it first to make changes.".to_string());
    }

    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let images_dir = app_data.join("images");
    std::fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images directory: {}", e))?;

    let image_bytes = BASE64
        .decode(image_data.as_bytes())
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

    if !modpack.is_owner {
        return Err("Cannot modify a joined modpack. Clone it first to make changes.".to_string());
    }

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

    let image_bytes =
        std::fs::read(&full_path).map_err(|e| format!("Failed to read image: {}", e))?;

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
async fn clone_modpack(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<Modpack, String> {
    let source = storage::load_modpack(&app_handle, &modpack_id)?;
    let now = chrono::Utc::now().to_rfc3339();
    let new_id = uuid::Uuid::new_v4().to_string();

    let cloned = Modpack {
        id: new_id.clone(),
        name: format!("{} (Copy)", source.name),
        description: source.description,
        game_id: source.game_id.clone(),
        game_version: source.game_version,
        loader: source.loader,
        mods: source.mods,
        is_owner: true,
        share_code: None,
        owner_address: None,
        image_path: None,
        created_at: now.clone(),
        updated_at: now,
    };

    storage::save_modpack(&app_handle, &cloned)?;

    let game = games::get_game(&cloned.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        instance::create_instance_dirs_for_game(
            &app_handle,
            &new_id,
            &cloned.name,
            Some("thunderstore"),
        )?;
        let instance_dir = instance::get_instance_dir(&app_handle, &new_id)?;
        sources::thunderstore::profile::save_mods_yml(&instance_dir, &vec![])?;
    }

    Ok(cloned)
}

#[tauri::command]
async fn open_instance_folder(
    app_handle: tauri::AppHandle,
    modpack_id: String,
) -> Result<(), String> {
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
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let is_loader = games::is_loader_package(&slug);

    let mod_slug = slug.clone();

    let game = games::get_game(&modpack.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    let modpack_name = modpack.name.clone();
    let modpack_game_id = modpack.game_id.clone();
    let modpack_game_version = modpack.game_version.clone();
    let modpack_loader = modpack.loader.clone();

    if !is_thunderstore {
        let mut modpack = modpack;
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
            is_loader,
        };
        modpack.add_mod(mod_info);
        storage::save_modpack(&app_handle, &modpack)?;
    }

    if is_thunderstore {
        let community = game
            .as_ref()
            .and_then(|g| g.thunderstore_community.as_deref())
            .unwrap_or("unknown");
        let loader_config = game.as_ref().and_then(|g| g.loader.as_ref());

        instance::create_instance_dirs_for_game(
            &app_handle,
            &modpack_id,
            &modpack_name,
            Some("thunderstore"),
        )?;
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
        let cache_base = instance::get_cache_dir(&app_handle)?;

        let loader_name = loader_config.map(|lc| lc.loader_type.name());
        let loader_ver = if let Some(lc) = loader_config {
            Some(
                sources::thunderstore::ensure_loader_installed(
                    &cache_base,
                    &instance_dir,
                    community,
                    lc,
                    &modpack_game_id,
                )
                .await?,
            )
        } else {
            None
        };

        if !is_loader {
            if let Some((owner, name)) = mod_slug
                .splitn(2, '-')
                .collect::<Vec<_>>()
                .split_first()
                .and_then(|(o, rest)| rest.first().map(|n| (o.to_string(), n.to_string())))
            {
                if let Ok(versions) =
                    sources::thunderstore::get_package_versions(community, &owner, &name).await
                {
                    if let Some(ver) = versions.first() {
                        let _ = sources::thunderstore::install_mod_full(
                            &cache_base,
                            &instance_dir,
                            &mod_slug,
                            &ver.version_number,
                            &ver.download_url,
                            &ver.dependencies,
                            false,
                            &modpack_game_id,
                            loader_name,
                        )
                        .await;
                    }
                }
            }
        }

        let mut inst = instance::load_instance(&app_handle, &modpack_id)?.unwrap_or_else(|| {
            let loader_name = loader_config
                .map(|lc| lc.loader_type.name())
                .unwrap_or("unknown");
            instance::Instance::new_thunderstore(
                modpack_id.clone(),
                modpack_game_id.clone(),
                modpack_game_version.clone(),
                loader_name,
            )
        });
        inst.installed = true;
        if let Some(ver) = loader_ver {
            inst.loader_version = Some(ver);
        }
        instance::save_instance(&app_handle, &inst)?;
    } else if let Ok(Some(inst)) = instance::load_instance(&app_handle, &modpack_id) {
        if inst.installed {
            if let Ok(mods_dir) = instance::get_mods_dir(&app_handle, &modpack_id) {
                let version_to_download: Option<modrinth::Version> = if let Some(vid) = version_id {
                    modrinth::get_versions_batch(&[vid])
                        .await
                        .ok()
                        .and_then(|v| v.into_iter().next())
                } else if let Some(pid) = project_id {
                    modrinth::get_project_versions(
                        &pid,
                        Some(&modpack_game_version),
                        modpack_loader.as_deref(),
                    )
                    .await
                    .ok()
                    .and_then(|versions| versions.into_iter().next())
                } else {
                    None
                };

                if let Some(version_info) = version_to_download {
                    let file = version_info
                        .files
                        .iter()
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

    get_modpack(app_handle, modpack_id).await
}

#[tauri::command]
async fn remove_mod_from_modpack(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    slug: String,
) -> Result<Modpack, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    let game = games::get_game(&modpack.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
        let loader_config = game.as_ref().and_then(|g| g.loader.as_ref());
        let loader_name = loader_config.map(|lc| lc.loader_type.name());
        sources::thunderstore::remove_mod_from_profile(
            &instance_dir,
            &slug,
            &modpack.game_id,
            loader_name,
        )?;
    } else {
        let mut modpack = modpack;
        let mod_filename = modpack
            .mods
            .iter()
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
    }

    get_modpack(app_handle, modpack_id).await
}

#[tauri::command]
async fn toggle_mod_enabled(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    slug: String,
) -> Result<Modpack, String> {
    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if !modpack.is_owner {
        return Err("Cannot modify a joined modpack. Clone it first to make changes.".to_string());
    }

    let game = games::get_game(&modpack.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
        let mods = sources::thunderstore::profile::load_mods_yml(&instance_dir)?;

        let mod_entry = sources::thunderstore::profile::find_mod_in_list(&mods, &slug)
            .ok_or_else(|| format!("Mod '{}' not found in modpack", slug))?;

        if games::is_loader_package(&slug) {
            return Err("Cannot disable mod loader - it is required for other mods".to_string());
        }

        let new_enabled = !mod_entry.enabled;

        let loader_config = game.as_ref().and_then(|g| g.loader.as_ref());
        let loader_name = loader_config.map(|lc| lc.loader_type.name());
        sources::thunderstore::toggle_mod_enabled(
            &instance_dir,
            &slug,
            new_enabled,
            &modpack.game_id,
            loader_name,
        )?;
    } else {
        let mut modpack = modpack;
        let mod_entry = modpack
            .mods
            .iter_mut()
            .find(|m| m.slug == slug)
            .ok_or_else(|| format!("Mod '{}' not found in modpack", slug))?;

        if mod_entry.is_loader {
            return Err("Cannot disable mod loader - it is required for other mods".to_string());
        }

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
                    let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("");

                    let is_this_mod = filename.to_lowercase().contains(&slug.to_lowercase())
                        || filename
                            .to_lowercase()
                            .contains(&mod_entry.title.to_lowercase().replace(" ", "-"))
                        || filename
                            .to_lowercase()
                            .contains(&mod_entry.title.to_lowercase().replace(" ", ""));

                    if is_this_mod
                        && (filename.ends_with(".jar") || filename.ends_with(".jar.disabled"))
                    {
                        let (new_path, new_filename) = if new_enabled {
                            if filename.ends_with(".jar.disabled") {
                                let new_name = filename.trim_end_matches(".disabled");
                                (mods_dir.join(new_name), new_name.to_string())
                            } else {
                                continue;
                            }
                        } else if filename.ends_with(".jar") && !filename.ends_with(".jar.disabled")
                        {
                            let new_name = format!("{}.disabled", filename);
                            (mods_dir.join(&new_name), new_name)
                        } else {
                            continue;
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
    }

    get_modpack(app_handle, modpack_id).await
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

    let tracked_slugs: std::collections::HashSet<String> =
        modpack.mods.iter().map(|m| m.slug.to_lowercase()).collect();

    let tracked_project_ids: std::collections::HashSet<String> = modpack
        .mods
        .iter()
        .filter_map(|m| m.project_id.as_ref().map(|id| id.to_lowercase()))
        .collect();

    let tracked_filenames: std::collections::HashSet<String> = modpack
        .mods
        .iter()
        .filter_map(|m| m.filename.as_ref().map(|f| f.to_lowercase()))
        .collect();

    let mut detected_mods = Vec::new();

    let entries = std::fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read mods directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = path
            .file_name()
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
            let mod_author = fabric_mod
                .authors
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
        let filename = path
            .file_name()
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
        is_loader: false,
    };

    modpack.add_mod(mod_info);
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(modpack)
}

async fn get_modrinth_mod_with_dependencies(
    slug: String,
    game_version: Option<String>,
    loader: Option<String>,
) -> Result<ModWithDependencies, String> {
    let project = modrinth::get_project(&slug).await?;

    let versions =
        modrinth::get_project_versions(&slug, game_version.as_deref(), loader.as_deref()).await?;

    if versions.is_empty() {
        return Err(format!(
            "No compatible version found for {} on {} with {}",
            slug,
            game_version.as_deref().unwrap_or("any"),
            loader.as_deref().unwrap_or("any")
        ));
    }

    let latest_version = &versions[0];

    let team = modrinth::get_project_team(&project.id)
        .await
        .unwrap_or_default();
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

async fn get_thunderstore_mod_with_dependencies(
    slug: String,
    community: Option<String>,
) -> Result<ModWithDependencies, String> {
    let community = community.ok_or_else(|| "Thunderstore community is required".to_string())?;

    let parts: Vec<&str> = slug.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(format!(
            "Invalid Thunderstore slug format: {}. Expected 'Owner-Name'",
            slug
        ));
    }
    let owner = parts[0];
    let name = parts[1];

    let versions = sources::thunderstore::get_package_versions(&community, owner, name).await?;

    if versions.is_empty() {
        return Err(format!("No versions found for {} on Thunderstore", slug));
    }

    let latest_version = &versions[0];

    let mut dependencies = Vec::new();

    if !latest_version.dependencies.is_empty() {
        let mut visited = std::collections::HashSet::new();
        visited.insert(slug.clone());

        let resolved_deps = sources::thunderstore::resolve_dependencies_with_visited(
            &community,
            &latest_version.dependencies,
            &mut visited,
        )
        .await?;

        for dep in resolved_deps {
            dependencies.push(DependencyInfo {
                slug: dep.full_name.clone(),
                title: dep.name.clone(),
                author: dep.owner.clone(),
                icon_url: dep.icon.clone(),
                project_id: dep.full_name.clone(),
                dependency_type: "required".to_string(),
            });
        }
    }

    Ok(ModWithDependencies {
        mod_info: ModInfo {
            slug: slug.clone(),
            title: name.to_string(),
            author: owner.to_string(),
            icon_url: latest_version.icon.clone(),
            version_id: latest_version.id.clone(),
            version_number: latest_version.version_number.clone(),
        },
        dependencies,
    })
}

#[tauri::command]
async fn get_mod_with_dependencies(
    slug: String,
    game_version: Option<String>,
    loader: Option<String>,
    source: Option<String>,
    thunderstore_community: Option<String>,
) -> Result<ModWithDependencies, String> {
    match source.as_deref().unwrap_or("modrinth") {
        "thunderstore" => {
            get_thunderstore_mod_with_dependencies(slug, thunderstore_community).await
        }
        _ => get_modrinth_mod_with_dependencies(slug, game_version, loader).await,
    }
}

#[tauri::command]
async fn get_public_ip() -> Result<String, String> {
    reqwest::get("https://api.ipify.org")
        .await
        .map_err(|e| format!("Failed to fetch public IP: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read IP response: {}", e))
}

#[tauri::command]
async fn begin_sharing(
    app_handle: tauri::AppHandle,
    modpack_id: String,
    port: u16,
) -> Result<String, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    if !modpack.is_owner {
        return Err("You can only share modpacks you own".to_string());
    }

    let public_ip = get_public_ip().await?;
    server::start_server(app_handle.clone(), modpack_id.clone(), port).await?;

    let share_data = format!("{}:{}:{}", public_ip, port, modpack_id);
    let share_code = BASE64.encode(share_data.as_bytes());

    modpack.share_code = Some(share_code.clone());
    storage::save_modpack(&app_handle, &modpack)?;

    Ok(share_code)
}

#[tauri::command]
async fn stop_sharing(app_handle: tauri::AppHandle, modpack_id: String) -> Result<(), String> {
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
async fn join_modpack(app_handle: tauri::AppHandle, share_code: String) -> Result<Modpack, String> {
    let decoded_bytes = BASE64
        .decode(share_code.as_bytes())
        .map_err(|_| "Invalid share code format")?;
    let decoded = String::from_utf8(decoded_bytes).map_err(|_| "Invalid share code encoding")?;

    let parts: Vec<String> = decoded.split(':').map(|s| s.to_string()).collect();
    if parts.len() != 3 {
        return Err("Invalid share code format".to_string());
    }

    let owner_address = format!("{}:{}", parts[0], parts[1]);

    let url = format!("http://{}/modpack", owner_address);
    let client = reqwest::Client::new();

    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to connect to owner: {}. Make sure they are online and sharing.",
                e
            )
        })?;

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
            return Err("You've already joined this modpack. Use sync to update it.".to_string());
        }
    }

    let local_modpack = Modpack::from_joined(remote_modpack, owner_address.clone());
    storage::save_modpack(&app_handle, &local_modpack)?;

    Ok(local_modpack)
}

#[tauri::command]
async fn sync_modpack(app_handle: tauri::AppHandle, modpack_id: String) -> Result<Modpack, String> {
    let mut modpack = storage::load_modpack(&app_handle, &modpack_id)?;

    if modpack.is_owner {
        return Err("Cannot sync a modpack you own. You are the source!".to_string());
    }

    let owner_address = modpack
        .owner_address
        .as_ref()
        .ok_or("This modpack doesn't have an owner address. It may not be a joined modpack.")?
        .clone();

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

    let sync_result = sync::hybrid_sync_from_owner(
        app_handle.clone(),
        modpack.id.clone(),
        modpack.name.clone(),
        owner_address.clone(),
    )
    .await;

    if let Err(e) = &sync_result {
        let _ = app_handle.emit("sync:error", serde_json::json!({ "message": e }));
    }

    modpack.name = remote_modpack.name;
    modpack.description = remote_modpack.description;
    modpack.game_version = remote_modpack.game_version;
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

    let owner_address = modpack.owner_address.as_ref().ok_or("No owner address")?;

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
    let remote_slugs: std::collections::HashSet<_> =
        remote_modpack.mods.iter().map(|m| &m.slug).collect();

    let is_synced = local_slugs == remote_slugs
        && modpack.name == remote_modpack.name
        && modpack.game_version == remote_modpack.game_version
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
            minecraft_version: Some(inst.game_version),
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

    let game = games::get_game(&modpack.game_id);
    let is_thunderstore = game
        .as_ref()
        .map(|g| g.mod_source == "thunderstore")
        .unwrap_or(false);

    if is_thunderstore {
        return do_install_thunderstore_instance(app_handle, modpack_id, &modpack, game.as_ref())
            .await;
    }

    instance::create_instance_dirs(app_handle, modpack_id, &modpack.name)?;

    let instance_dir = instance::get_instance_dir(app_handle, modpack_id)?;
    let libraries_dir = instance::get_libraries_dir(app_handle, modpack_id)?;
    let mods_dir = instance::get_mods_dir(app_handle, modpack_id)?;

    let mut inst = instance::Instance::new(
        modpack_id.to_string(),
        modpack.game_version.clone(),
        modpack.loader.as_deref().unwrap_or("none").to_string(),
    );

    let app_handle_clone = app_handle.clone();
    let modpack_id_clone = modpack_id.to_string();
    let emit_progress = move |progress: downloader::DownloadProgress| {
        update_progress(
            &app_handle_clone,
            &modpack_id_clone,
            InstallProgress {
                stage: "downloading_minecraft".to_string(),
                current: progress.downloaded_files,
                total: progress.total_files,
                message: format!("Downloading: {}", progress.current_file),
            },
        );
    };

    let version_meta =
        minecraft::download_minecraft(app_handle, modpack_id, &modpack.game_version, emit_progress)
            .await?;

    update_progress(
        app_handle,
        modpack_id,
        InstallProgress {
            stage: "extracting_natives".to_string(),
            current: 0,
            total: 1,
            message: "Extracting native libraries...".to_string(),
        },
    );

    launcher::extract_natives(&instance_dir, &version_meta).await?;

    let _fabric_profile = if modpack
        .loader
        .as_deref()
        .map(|l| l.to_lowercase())
        .as_deref()
        == Some("fabric")
    {
        update_progress(
            app_handle,
            modpack_id,
            InstallProgress {
                stage: "installing_loader".to_string(),
                current: 0,
                total: 1,
                message: "Installing Fabric loader...".to_string(),
            },
        );

        let app_handle_clone = app_handle.clone();
        let modpack_id_clone = modpack_id.to_string();
        let loader_progress = move |progress: downloader::DownloadProgress| {
            update_progress(
                &app_handle_clone,
                &modpack_id_clone,
                InstallProgress {
                    stage: "installing_loader".to_string(),
                    current: progress.downloaded_files,
                    total: progress.total_files,
                    message: format!("Downloading: {}", progress.current_file),
                },
            );
        };

        let (loader_version, profile) = loaders::fabric::install_fabric(
            &instance_dir,
            &modpack.game_version,
            &libraries_dir,
            loader_progress,
        )
        .await?;

        inst.loader_version = Some(loader_version);
        Some(profile)
    } else {
        None
    };

    let mods_with_version_id: Vec<_> = modpack
        .mods
        .iter()
        .filter(|m| m.version_id.is_some())
        .collect();

    let mods_with_only_project_id: Vec<_> = modpack
        .mods
        .iter()
        .filter(|m| m.version_id.is_none() && m.project_id.is_some())
        .collect();

    let total_mods = mods_with_version_id.len() + mods_with_only_project_id.len();

    if total_mods > 0 {
        update_progress(
            app_handle,
            modpack_id,
            InstallProgress {
                stage: "downloading_mods".to_string(),
                current: 0,
                total: total_mods as u64,
                message: "Fetching mod information...".to_string(),
            },
        );

        let mut mod_tasks: Vec<downloader::DownloadTask> = vec![];

        if !mods_with_version_id.is_empty() {
            let version_ids: Vec<String> = mods_with_version_id
                .iter()
                .filter_map(|m| m.version_id.clone())
                .collect();

            let versions = modrinth::get_versions_batch(&version_ids).await?;

            for version in &versions {
                let file = version
                    .files
                    .iter()
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
                    Some(&modpack.game_version),
                    modpack.loader.as_deref(),
                )
                .await
                {
                    Ok(versions) if !versions.is_empty() => {
                        let version = &versions[0];
                        let file = version
                            .files
                            .iter()
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
                        eprintln!(
                            "[WARN] No compatible version found for dependency {} on {} with {}",
                            dep_mod.slug,
                            modpack.game_version,
                            modpack.loader.as_deref().unwrap_or("none")
                        );
                    }
                    Err(e) => {
                        eprintln!(
                            "[WARN] Failed to fetch versions for dependency {}: {}",
                            dep_mod.slug, e
                        );
                    }
                }
            }
        }

        let app_handle_clone = app_handle.clone();
        let modpack_id_clone = modpack_id.to_string();
        let mod_progress = move |progress: downloader::DownloadProgress| {
            update_progress(
                &app_handle_clone,
                &modpack_id_clone,
                InstallProgress {
                    stage: "downloading_mods".to_string(),
                    current: progress.downloaded_files,
                    total: progress.total_files,
                    message: format!("Downloading: {}", progress.current_file),
                },
            );
        };

        downloader::download_batch(mod_tasks, 5, mod_progress).await?;
    }

    inst.installed = true;
    instance::save_instance(app_handle, &inst)?;

    update_progress(
        app_handle,
        modpack_id,
        InstallProgress {
            stage: "complete".to_string(),
            current: 1,
            total: 1,
            message: "Installation complete!".to_string(),
        },
    );

    Ok(())
}

async fn do_install_thunderstore_instance(
    app_handle: &tauri::AppHandle,
    modpack_id: &str,
    modpack: &Modpack,
    game: Option<&GameInfo>,
) -> Result<(), String> {
    use std::collections::HashSet;

    let community = game
        .and_then(|g| g.thunderstore_community.as_deref())
        .ok_or("Thunderstore community not configured for this game")?;

    let loader_config = game.and_then(|g| g.loader.as_ref());

    instance::create_instance_dirs_for_game(
        app_handle,
        modpack_id,
        &modpack.name,
        Some("thunderstore"),
    )?;

    let instance_dir = instance::get_instance_dir(app_handle, modpack_id)?;
    let cache_base = instance::get_cache_dir(app_handle)?;

    let loader_name = loader_config
        .map(|lc| lc.loader_type.name())
        .unwrap_or("unknown");
    let mut inst = instance::Instance::new_thunderstore(
        modpack_id.to_string(),
        modpack.game_id.clone(),
        modpack.game_version.clone(),
        loader_name,
    );

    let _mods_base = loader_config
        .map(|lc| lc.loader_type.mods_base_path(&instance_dir))
        .unwrap_or_else(|| instance_dir.join("BepInEx/plugins"));

    if !modpack.mods.is_empty() {
        if let Some(lc) = loader_config {
            update_progress(
                app_handle,
                modpack_id,
                InstallProgress {
                    stage: "installing_loader".to_string(),
                    current: 0,
                    total: 1,
                    message: "Installing mod loader...".to_string(),
                },
            );

            let ver = sources::thunderstore::ensure_loader_installed(
                &cache_base,
                &instance_dir,
                community,
                lc,
                &modpack.game_id,
            )
            .await?;

            inst.loader_version = Some(ver);

            update_progress(
                app_handle,
                modpack_id,
                InstallProgress {
                    stage: "installing_loader".to_string(),
                    current: 1,
                    total: 1,
                    message: "Mod loader installed".to_string(),
                },
            );
        }
    }

    let total_mods = modpack.mods.len();
    if total_mods > 0 {
        update_progress(
            app_handle,
            modpack_id,
            InstallProgress {
                stage: "downloading_mods".to_string(),
                current: 0,
                total: total_mods as u64,
                message: "Resolving mod dependencies...".to_string(),
            },
        );

        let mut installed_count: u64 = 0;
        let mut globally_installed: HashSet<String> = HashSet::new();

        if let Some(lc) = loader_config {
            globally_installed.insert(lc.package_name.clone());
        }

        for mod_entry in &modpack.mods {
            let slug = &mod_entry.slug;

            update_progress(
                app_handle,
                modpack_id,
                InstallProgress {
                    stage: "downloading_mods".to_string(),
                    current: installed_count,
                    total: total_mods as u64,
                    message: format!("Installing: {}", mod_entry.title),
                },
            );

            let parts: Vec<&str> = slug.splitn(2, '-').collect();
            if parts.len() != 2 {
                eprintln!("[WARN] Invalid Thunderstore slug: {}", slug);
                continue;
            }
            let (owner, name) = (parts[0], parts[1]);

            let versions =
                match sources::thunderstore::get_package_versions(community, owner, name).await {
                    Ok(v) => v,
                    Err(e) => {
                        eprintln!("[WARN] Failed to get versions for {}: {}", slug, e);
                        continue;
                    }
                };

            let version_info = versions.first();
            if version_info.is_none() {
                eprintln!("[WARN] No versions found for {}", slug);
                continue;
            }
            let version_info = version_info.unwrap();

            let mut visited = globally_installed.clone();
            visited.insert(slug.clone());

            let deps = sources::thunderstore::resolve_dependencies_with_visited(
                community,
                &version_info.dependencies,
                &mut visited,
            )
            .await
            .unwrap_or_default();

            for dep in &deps {
                if globally_installed.contains(&dep.full_name) {
                    continue;
                }

                let is_loader_dep = loader_config
                    .map(|lc| dep.full_name == lc.package_name)
                    .unwrap_or(false)
                    || games::is_loader_package(&dep.full_name);
                if is_loader_dep {
                    globally_installed.insert(dep.full_name.clone());
                    continue;
                }

                let _ = sources::thunderstore::install_mod_full(
                    &cache_base,
                    &instance_dir,
                    &dep.full_name,
                    &dep.version,
                    &dep.download_url,
                    &dep.dependencies,
                    false,
                    &modpack.game_id,
                    Some(loader_name),
                )
                .await;

                globally_installed.insert(dep.full_name.clone());
            }

            if !globally_installed.contains(slug) {
                if games::is_loader_package(slug) {
                    globally_installed.insert(slug.clone());
                } else {
                    let _ = sources::thunderstore::install_mod_full(
                        &cache_base,
                        &instance_dir,
                        slug,
                        &version_info.version_number,
                        &version_info.download_url,
                        &version_info.dependencies,
                        false,
                        &modpack.game_id,
                        Some(loader_name),
                    )
                    .await;

                    globally_installed.insert(slug.clone());
                }
            }

            installed_count += 1;
        }
    }

    inst.installed = true;
    instance::save_instance(app_handle, &inst)?;

    update_progress(
        app_handle,
        modpack_id,
        InstallProgress {
            stage: "complete".to_string(),
            current: 1,
            total: 1,
            message: "Installation complete!".to_string(),
        },
    );

    Ok(())
}

#[tauri::command]
async fn install_instance(app_handle: tauri::AppHandle, modpack_id: String) -> Result<(), String> {
    do_install_instance(app_handle, modpack_id).await
}

#[tauri::command]
async fn start_install(app_handle: tauri::AppHandle, modpack_id: String) -> Result<(), String> {
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
async fn launch_instance(app_handle: tauri::AppHandle, modpack_id: String) -> Result<(), String> {
    let account = auth::get_default_account(&app_handle)?
        .ok_or("No account logged in. Please add a Microsoft account first.")?;

    let modpack = storage::load_modpack(&app_handle, &modpack_id)?;
    let inst = instance::load_instance(&app_handle, &modpack_id)?
        .ok_or("Instance not found. Please install first.")?;

    if !inst.installed {
        return Err("Instance not installed. Please install first.".to_string());
    }

    let fabric_profile = if modpack
        .loader
        .as_deref()
        .map(|l| l.to_lowercase())
        .as_deref()
        == Some("fabric")
    {
        let instance_dir = instance::get_instance_dir(&app_handle, &modpack_id)?;
        let loader_version = inst
            .loader_version
            .as_ref()
            .ok_or("Loader version not found")?;

        let fabric_version_id =
            format!("fabric-loader-{}-{}", loader_version, modpack.game_version);
        let fabric_json_path = instance_dir
            .join("versions")
            .join(&fabric_version_id)
            .join(format!("{}.json", fabric_version_id));

        eprintln!(
            "[DEBUG] Looking for Fabric profile at: {:?}",
            fabric_json_path
        );
        eprintln!(
            "[DEBUG] Fabric profile exists: {}",
            fabric_json_path.exists()
        );

        if fabric_json_path.exists() {
            let content = std::fs::read_to_string(&fabric_json_path)
                .map_err(|e| format!("Failed to read Fabric profile: {}", e))?;
            Some(
                serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse Fabric profile: {}", e))?,
            )
        } else {
            eprintln!(
                "[ERROR] Fabric profile not found! Fabric libraries will not be in classpath."
            );
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
    Ok(data
        .accounts
        .into_iter()
        .map(|a| AccountInfo {
            uuid: a.uuid,
            username: a.username,
            skin_url: a.skin_url,
            is_default: a.is_default,
        })
        .collect())
}

#[tauri::command]
async fn set_default_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
    auth::set_default_account(&app_handle, &uuid)
}

#[tauri::command]
async fn remove_account(app_handle: tauri::AppHandle, uuid: String) -> Result<(), String> {
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
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.with_webview(|webview| {
                #[cfg(windows)]
                unsafe {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4;
                    use windows_core::Interface;
                    let settings = webview
                        .controller()
                        .CoreWebView2()
                        .unwrap()
                        .Settings()
                        .unwrap();
                    if let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() {
                        let _ = settings4.SetIsGeneralAutofillEnabled(false);
                        let _ = settings4.SetIsPasswordAutosaveEnabled(false);
                    }
                }
            })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_games,
            search_mods,
            get_mod_categories,
            get_thunderstore_fetch_progress,
            check_thunderstore_updates,
            update_thunderstore_mod,
            update_all_thunderstore_mods,
            get_mod_loaders,
            get_game_versions,
            get_mod_versions,
            create_modpack,
            list_modpacks,
            get_modpack,
            update_modpack,
            delete_modpack,
            clone_modpack,
            add_mod_to_modpack,
            remove_mod_from_modpack,
            toggle_mod_enabled,
            scan_mods_folder,
            sync_mod_filenames,
            import_detected_mod,
            get_mod_with_dependencies,
            get_public_ip,
            begin_sharing,
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
