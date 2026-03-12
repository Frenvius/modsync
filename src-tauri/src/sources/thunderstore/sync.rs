use std::path::Path;

use super::api::{self, PackageVersionInfo};
use super::manifest;

pub async fn get_package_version(
    community: &str,
    full_name: &str,
    target_version: &str,
    cache_dir: Option<&Path>,
) -> Result<PackageVersionInfo, String> {
    let (owner, name) = manifest::parse_full_name(full_name)?;
    let versions = api::get_package_versions(community, &owner, &name, cache_dir).await?;

    versions
        .into_iter()
        .find(|v| v.version_number == target_version)
        .ok_or_else(|| format!("Version {} not found for {}", target_version, full_name))
}