use std::{sync::OnceLock, time::Duration};

use reqwest::{RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;

use crate::contracts::{CommandError, CommandErrorCode};

const MAX_RESPONSE_BYTES: u64 = 32 * 1024 * 1024;
const RETRIES: usize = 2;

pub fn client() -> Result<&'static reqwest::Client, CommandError> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(30))
                .user_agent("ModSync/0.1.0")
                .pool_idle_timeout(Duration::from_secs(60))
                .build()
                .map_err(|error| error.to_string())
        })
        .as_ref()
        .map_err(|details| CommandError {
            code: CommandErrorCode::Network,
            message: "Could not initialize provider networking".into(),
            retryable: false,
            details: Some(details.clone()),
        })
}

pub async fn get_json<T: DeserializeOwned>(request: RequestBuilder) -> Result<T, CommandError> {
    let bytes = get_bytes(request).await?;
    serde_json::from_slice(&bytes).map_err(|error| CommandError {
        code: CommandErrorCode::ProviderUnavailable,
        message: "Provider returned invalid data".into(),
        retryable: false,
        details: Some(error.to_string()),
    })
}

pub async fn get_bytes(request: RequestBuilder) -> Result<Vec<u8>, CommandError> {
    for attempt in 0..=RETRIES {
        let Some(next_request) = request.try_clone() else {
            return Err(CommandError::new(
                CommandErrorCode::Network,
                "Could not prepare provider request",
            ));
        };
        match next_request.send().await {
            Ok(response) if response.status().is_success() => {
                if response
                    .content_length()
                    .is_some_and(|size| size > MAX_RESPONSE_BYTES)
                {
                    return Err(CommandError::new(
                        CommandErrorCode::ProviderUnavailable,
                        "Provider response exceeded the safe size limit",
                    ));
                }
                let bytes = response.bytes().await.map_err(network_error)?;
                if bytes.len() as u64 > MAX_RESPONSE_BYTES {
                    return Err(CommandError::new(
                        CommandErrorCode::ProviderUnavailable,
                        "Provider response exceeded the safe size limit",
                    ));
                }
                return Ok(bytes.to_vec());
            }
            Ok(response) if retryable_status(response.status()) && attempt < RETRIES => {
                tokio::time::sleep(Duration::from_millis(300 * (attempt as u64 + 1))).await;
            }
            Ok(response) => return Err(status_error(response.status())),
            Err(error) if attempt < RETRIES && (error.is_timeout() || error.is_connect()) => {
                tokio::time::sleep(Duration::from_millis(250 * (attempt as u64 + 1))).await;
            }
            Err(error) => return Err(network_error(error)),
        }
    }
    Err(CommandError::new(
        CommandErrorCode::Network,
        "Could not reach provider",
    ))
}

fn retryable_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn status_error(status: StatusCode) -> CommandError {
    let (code, message, retryable) = match status {
        StatusCode::NOT_FOUND => (
            CommandErrorCode::NotFound,
            "Provider project was not found",
            false,
        ),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => (
            CommandErrorCode::ProviderUnavailable,
            "Provider rejected the configured credentials",
            false,
        ),
        StatusCode::TOO_MANY_REQUESTS => (
            CommandErrorCode::ProviderUnavailable,
            "Provider rate limit reached",
            true,
        ),
        _ => (
            CommandErrorCode::ProviderUnavailable,
            "Provider request failed",
            status.is_server_error(),
        ),
    };
    CommandError {
        code,
        message: message.into(),
        retryable,
        details: Some(format!("HTTP {status}")),
    }
}

fn network_error(error: reqwest::Error) -> CommandError {
    CommandError {
        code: CommandErrorCode::Network,
        message: if error.is_timeout() {
            "Provider request timed out"
        } else {
            "Could not reach provider"
        }
        .into(),
        retryable: true,
        details: Some(error.to_string()),
    }
}
