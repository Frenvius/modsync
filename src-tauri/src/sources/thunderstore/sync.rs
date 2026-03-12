use std::path::Path;

use super::api::{self, PackageVersionInfo};

pub async fn get_package_version(
    community: &str,
    full_name: &str,
    target_version: &str,
    cache_dir: Option<&Path>,
) -> Result<PackageVersionInfo, String> {
    let (owner, name) = parse_full_name(full_name)?;
    let versions = api::get_package_versions(community, &owner, &name, cache_dir).await?;

    versions
        .into_iter()
        .find(|v| v.version_number == target_version)
        .ok_or_else(|| format!("Version {} not found for {}", target_version, full_name))
}

fn parse_full_name(full_name: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = full_name.splitn(2, '-').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid package name: {}", full_name));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_full_name() {
        let (owner, name) = parse_full_name("BepInEx-BepInExPack").unwrap();
        assert_eq!(owner, "BepInEx");
        assert_eq!(name, "BepInExPack");
    }

    #[test]
    fn test_parse_full_name_with_dashes() {
        let (owner, name) = parse_full_name("Author-Some-Mod-Name").unwrap();
        assert_eq!(owner, "Author");
        assert_eq!(name, "Some-Mod-Name");
    }
}
