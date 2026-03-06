pub mod fabric;

use std::path::Path;

pub type LoaderResult<T> = Result<T, String>;

pub trait ModLoaderInstaller {
    fn get_loader_version(
        minecraft_version: &str,
    ) -> impl std::future::Future<Output = LoaderResult<String>> + Send;

    fn install(
        instance_dir: &Path,
        minecraft_version: &str,
        libraries_dir: &Path,
    ) -> impl std::future::Future<Output = LoaderResult<String>> + Send;
}
