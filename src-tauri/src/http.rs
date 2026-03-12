use once_cell::sync::Lazy;
use std::time::Duration;

pub static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent("ModSync/0.1.0 (https://github.com/Frenvius/modpack-sync)")
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .expect("Failed to build HTTP client")
});
