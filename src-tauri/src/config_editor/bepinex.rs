use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "value")]
pub enum ConfigValue {
    Boolean(bool),
    Integer(i64),
    Float(f64),
    String(String),
    KeyboardShortcut(String),
    Choice { value: String, options: Vec<String> },
}

impl ConfigValue {
    pub fn as_string(&self) -> String {
        match self {
            ConfigValue::Boolean(b) => if *b { "true" } else { "false" }.to_string(),
            ConfigValue::Integer(i) => i.to_string(),
            ConfigValue::Float(f) => f.to_string(),
            ConfigValue::String(s) => s.clone(),
            ConfigValue::KeyboardShortcut(s) => s.clone(),
            ConfigValue::Choice { value, .. } => value.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: ConfigValue,
    pub default_value: Option<String>,
    pub description: Option<String>,
    pub acceptable_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSection {
    pub name: String,
    pub entries: Vec<ConfigEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFile {
    pub path: String,
    pub filename: String,
    pub mod_name: Option<String>,
    pub sections: Vec<ConfigSection>,
}

pub fn parse_config_file(path: &Path) -> Result<ConfigFile, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let filename = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mod_name = filename.strip_suffix(".cfg").map(|s| s.to_string());

    let mut sections: Vec<ConfigSection> = Vec::new();
    let mut current_section: Option<ConfigSection> = None;
    let mut current_description: Vec<String> = Vec::new();
    let mut current_default: Option<String> = None;
    let mut current_acceptable: Option<Vec<String>> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if let Some(section) = current_section.take() {
                sections.push(section);
            }

            let section_name = trimmed[1..trimmed.len()-1].to_string();
            current_section = Some(ConfigSection {
                name: section_name,
                entries: Vec::new(),
            });
            continue;
        }

        if trimmed.starts_with("##") || trimmed.starts_with('#') {
            let comment = trimmed.trim_start_matches('#').trim();

            if comment.starts_with("Default value:") {
                current_default = Some(comment.strip_prefix("Default value:").unwrap().trim().to_string());
            } else if comment.starts_with("Acceptable values:") {
                let values_str = comment.strip_prefix("Acceptable values:").unwrap().trim();
                current_acceptable = Some(
                    values_str.split(',')
                        .map(|s| s.trim().to_string())
                        .collect()
                );
            } else if !comment.starts_with("Setting type:") {
                current_description.push(comment.to_string());
            }
            continue;
        }

        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let raw_value = trimmed[eq_pos + 1..].trim().to_string();

            let value = parse_value(&raw_value, &current_acceptable);

            let entry = ConfigEntry {
                key,
                value,
                default_value: current_default.take(),
                description: if current_description.is_empty() {
                    None
                } else {
                    Some(current_description.join("\n"))
                },
                acceptable_values: current_acceptable.take(),
            };

            current_description.clear();

            if let Some(section) = current_section.as_mut() {
                section.entries.push(entry);
            }
        }
    }

    if let Some(section) = current_section {
        sections.push(section);
    }

    Ok(ConfigFile {
        path: path.to_string_lossy().to_string(),
        filename,
        mod_name,
        sections,
    })
}

fn parse_value(raw: &str, acceptable: &Option<Vec<String>>) -> ConfigValue {
    if let Some(options) = acceptable {
        if options.contains(&raw.to_string()) {
            return ConfigValue::Choice {
                value: raw.to_string(),
                options: options.clone(),
            };
        }
    }

    match raw.to_lowercase().as_str() {
        "true" => return ConfigValue::Boolean(true),
        "false" => return ConfigValue::Boolean(false),
        _ => {}
    }

    if let Ok(i) = raw.parse::<i64>() {
        return ConfigValue::Integer(i);
    }

    if let Ok(f) = raw.parse::<f64>() {
        return ConfigValue::Float(f);
    }

    if raw.contains("Mouse") || raw.contains("Key") || raw.starts_with("F") && raw.len() <= 3 {
        return ConfigValue::KeyboardShortcut(raw.to_string());
    }

    ConfigValue::String(raw.to_string())
}

pub fn update_config_entry(
    path: &Path,
    section_name: &str,
    key: &str,
    new_value: &str,
) -> Result<(), String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    let mut in_target_section = false;
    let mut found = false;

    for line in &mut lines {
        let trimmed = line.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let name = &trimmed[1..trimmed.len()-1];
            in_target_section = name == section_name;
            continue;
        }
 
        if in_target_section && !found {
            if let Some(eq_pos) = trimmed.find('=') {
                let line_key = trimmed[..eq_pos].trim();
                if line_key == key {
                    let prefix = &line[..line.find('=').unwrap() + 1];
                    *line = format!("{} {}", prefix, new_value);
                    found = true;
                }
            }
        }
    }

    if !found {
        return Err(format!("Entry '{}' not found in section '{}'", key, section_name));
    }

    fs::write(path, lines.join("\n"))
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

pub fn reset_config_entry(
    path: &Path,
    section_name: &str,
    key: &str,
) -> Result<String, String> {
    let config = parse_config_file(path)?;

    let section = config.sections.iter()
        .find(|s| s.name == section_name)
        .ok_or_else(|| format!("Section '{}' not found", section_name))?;

    let entry = section.entries.iter()
        .find(|e| e.key == key)
        .ok_or_else(|| format!("Entry '{}' not found", key))?;

    let default_value = entry.default_value.as_ref()
        .ok_or_else(|| format!("No default value for '{}'", key))?;

    update_config_entry(path, section_name, key, default_value)?;

    Ok(default_value.clone())
}

pub fn list_config_files(dir: &Path) -> Result<Vec<String>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    for entry in fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "cfg" {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_value() {
        assert_eq!(
            parse_value("true", &None),
            ConfigValue::Boolean(true)
        );
        assert_eq!(
            parse_value("false", &None),
            ConfigValue::Boolean(false)
        );
        assert_eq!(
            parse_value("42", &None),
            ConfigValue::Integer(42)
        );
        assert_eq!(
            parse_value("3.14", &None),
            ConfigValue::Float(3.14)
        );
    }
}
