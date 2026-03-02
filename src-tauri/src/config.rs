use serde_json::Value;
use std::fs::{self, File};
use std::io::{self, Write};

async fn config_file() -> Result<String, String> {
	let app_data_dir = dirs::data_dir().ok_or("Could not find AppData directory")?;
	let dir_path = app_data_dir.join("Mod Updater");
	let file_path = dir_path.join("mod_updater_data.json");
	Ok(file_path.to_str().unwrap().to_string())
}

#[tauri::command]
pub async fn config_folder() -> Result<String, String> {
	let app_data_dir = dirs::data_dir().ok_or("Could not find AppData directory")?;
	let dir_path = app_data_dir.join("Mod Updater");
	Ok(dir_path.to_str().unwrap().to_string())
}

async fn get_config_file() -> Result<String, io::Error> {
	let path = config_file().await.unwrap();
	let path_exists = fs::metadata(&path).is_ok();
	if path_exists {
		Ok(fs::read_to_string(&path)?)
	} else {
		fs::write(&path, "{}")?;
		Ok("{}".to_string())
	}
}

#[tauri::command]
pub async fn get_config_data() -> Result<String, String> {
	match get_config_file().await {
		Ok(config) => Ok(config),
		Err(e) => Err(e.to_string())
	}
}

#[tauri::command]
pub async fn get_config(key: &str) -> Result<Option<Value>, String> {
	match get_config_file().await {
		Ok(config) => {
			match serde_json::from_str::<Value>(&config) {
				Ok(json) => Ok(json.get(key).cloned()),
				Err(e) => {
					reset_config_file().await?;
					Err(e.to_string())
				}
			}
		},
		Err(e) => {
			reset_config_file().await?;
			Err(e.to_string())
		}
	}
}

#[tauri::command]
pub async fn set_config(key: &str, value: Value) -> Result<(), String> {
	let path = config_file().await?;
	match get_config_file().await {
		Ok(config_content) => {
			let mut json: Value = match serde_json::from_str::<Value>(&config_content) {
				Ok(json) => json,
				Err(e) => {
					reset_config_file().await?;
					return Err(e.to_string());
				}
			};
			json[key] = value;
			match serde_json::to_string(&json) {
				Ok(config_string) => {
					match File::create(&path).and_then(|mut file| file.write_all(config_string.as_bytes())) {
						Ok(_) => Ok(()),
						Err(e) => {
							reset_config_file().await?;
							Err(e.to_string())
						}
					}
				},
				Err(e) => {
					reset_config_file().await?;
					Err(e.to_string())
				}
			}
		},
		Err(e) => {
			reset_config_file().await?;
			Err(e.to_string())
		}
	}
}

#[tauri::command]
pub async fn reset_config_file() -> Result<bool, String> {
	let path = config_file().await?;
	match File::create(&path).and_then(|mut file| file.write_all(b"{}")) {
		Ok(_) => Ok(true),
		Err(e) => Err(e.to_string())
	}
}