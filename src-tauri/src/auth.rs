use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const MICROSOFT_CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb"; // Prism Launcher ID (Third Party, Supports Device Code Flow + Xbox Scopes)
const MICROSOFT_DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const MICROSOFT_TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_LIVE_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Debug, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i32,
    pub interval: i32,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct MicrosoftTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: i64,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct XboxLiveResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxUserInfo>,
}

#[derive(Debug, Deserialize)]
struct XboxUserInfo {
    uhs: String,
}

#[derive(Debug, Deserialize)]
struct XstsResponse {
    #[serde(rename = "Token")]
    token: String,
}

#[derive(Debug, Deserialize)]
struct MinecraftAuthResponse {
    access_token: String,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
    pub skins: Option<Vec<MinecraftSkin>>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
pub struct MinecraftSkin {
    pub id: String,
    pub url: String,
    pub state: String,
    pub variant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftAccount {
    pub uuid: String,
    pub username: String,
    pub access_token: String,
    pub refresh_token: String,
    pub token_expires_at: i64,
    pub skin_url: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountsData {
    pub accounts: Vec<MinecraftAccount>,
}

pub async fn request_device_code() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();

    let params = [
        ("client_id", MICROSOFT_CLIENT_ID),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let response = client
        .post(MICROSOFT_DEVICE_CODE_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to request device code: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Microsoft device code error: {}", error_text));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))
}

pub async fn poll_for_token(device_code: &str, interval: i32) -> Result<(String, String), String> {
    let client = reqwest::Client::new();

    let params = [
        ("client_id", MICROSOFT_CLIENT_ID),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ("device_code", device_code),
    ];

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(interval as u64)).await;

        let response = client
            .post(MICROSOFT_TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token poll error: {}", e))?;

        let status = response.status();
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        if status.is_success() {
            let token_response: MicrosoftTokenResponse = serde_json::from_value(body)
                .map_err(|e| format!("Failed to parse token: {}", e))?;
            return Ok((token_response.access_token, token_response.refresh_token));
        }

        if let Some(error) = body.get("error").and_then(|e| e.as_str()) {
            match error {
                "authorization_pending" => continue,
                "slow_down" => {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
                "expired_token" => return Err("Device code expired. Please try again.".to_string()),
                "authorization_declined" => return Err("Authorization was declined.".to_string()),
                _ => return Err(format!("Authentication error: {}", error)),
            }
        }
    }
}

async fn authenticate_xbox_live(microsoft_token: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", microsoft_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let response = client
        .post(XBOX_LIVE_AUTH_URL)
        .json(&body)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Xbox Live auth error: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Xbox Live auth failed: {}", error_text));
    }

    let xbox_response: XboxLiveResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox Live response: {}", e))?;

    let user_hash = xbox_response
        .display_claims
        .xui
        .first()
        .map(|u| u.uhs.clone())
        .ok_or("No user hash in Xbox Live response")?;

    Ok((xbox_response.token, user_hash))
}

async fn authenticate_xsts(xbox_token: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbox_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let response = client
        .post(XSTS_AUTH_URL)
        .json(&body)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("XSTS auth error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body: serde_json::Value = response.json().await.unwrap_or_default();

        if let Some(xerr) = error_body.get("XErr").and_then(|x| x.as_u64()) {
            return Err(match xerr {
                2148916233 => {
                    "This Microsoft account doesn't have an Xbox account. Please create one first."
                        .to_string()
                }
                2148916235 => "Xbox Live is not available in your country/region.".to_string(),
                2148916236 | 2148916237 => {
                    "Adult verification required. Please complete it on Xbox.com.".to_string()
                }
                2148916238 => {
                    "This is a child account. Please add it to a Family on Xbox.com.".to_string()
                }
                _ => format!("XSTS error {}: {:?}", xerr, error_body),
            });
        }

        return Err(format!("XSTS auth failed ({}): {:?}", status, error_body));
    }

    let xsts_response: XstsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    Ok(xsts_response.token)
}

async fn authenticate_minecraft(xsts_token: &str, user_hash: &str) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token)
    });

    let response = client
        .post(MINECRAFT_AUTH_URL)
        .json(&body)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Minecraft auth error: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Minecraft auth failed: {}", error_text));
    }

    let mc_response: MinecraftAuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Minecraft auth response: {}", e))?;

    Ok(mc_response.access_token)
}

pub async fn get_minecraft_profile(access_token: &str) -> Result<MinecraftProfile, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(MINECRAFT_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Profile fetch error: {}", e))?;

    if response.status().as_u16() == 404 {
        return Err(
            "This Microsoft account doesn't own Minecraft. Please purchase the game.".to_string(),
        );
    }

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Profile fetch failed: {}", error_text));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Failed to parse profile: {}", e))
}

pub async fn complete_authentication(
    microsoft_token: &str,
    refresh_token: &str,
) -> Result<MinecraftAccount, String> {
    let (xbox_token, user_hash) = authenticate_xbox_live(microsoft_token).await?;

    let xsts_token = authenticate_xsts(&xbox_token).await?;

    let mc_access_token = authenticate_minecraft(&xsts_token, &user_hash).await?;

    let profile = get_minecraft_profile(&mc_access_token).await?;

    let skin_url = profile
        .skins
        .as_ref()
        .and_then(|skins| skins.first())
        .map(|skin| skin.url.clone());

    let token_expires_at = chrono::Utc::now().timestamp() + 86400 - 3600;

    Ok(MinecraftAccount {
        uuid: profile.id,
        username: profile.name,
        access_token: mc_access_token,
        refresh_token: refresh_token.to_string(),
        token_expires_at,
        skin_url,
        is_default: false,
    })
}

pub async fn refresh_account(account: &MinecraftAccount) -> Result<MinecraftAccount, String> {
    let client = reqwest::Client::new();

    let params = [
        ("client_id", MICROSOFT_CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", &account.refresh_token),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let response = client
        .post(MICROSOFT_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh error: {}", e))?;

    if !response.status().is_success() {
        return Err("Session expired. Please login again.".to_string());
    }

    let token_response: MicrosoftTokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    complete_authentication(&token_response.access_token, &token_response.refresh_token).await
}

fn get_accounts_file(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }

    Ok(app_data_dir.join("accounts.json"))
}

pub fn load_accounts(app_handle: &tauri::AppHandle) -> Result<AccountsData, String> {
    let file_path = get_accounts_file(app_handle)?;

    if !file_path.exists() {
        return Ok(AccountsData::default());
    }

    let json = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read accounts file: {}", e))?;

    serde_json::from_str(&json).map_err(|e| format!("Failed to parse accounts: {}", e))
}

pub fn save_accounts(app_handle: &tauri::AppHandle, data: &AccountsData) -> Result<(), String> {
    let file_path = get_accounts_file(app_handle)?;

    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize accounts: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write accounts file: {}", e))?;

    Ok(())
}

pub fn add_account(
    app_handle: &tauri::AppHandle,
    mut account: MinecraftAccount,
) -> Result<(), String> {
    let mut data = load_accounts(app_handle)?;

    data.accounts.retain(|a| a.uuid != account.uuid);

    if data.accounts.is_empty() {
        account.is_default = true;
    }

    data.accounts.push(account);
    save_accounts(app_handle, &data)
}

pub fn remove_account(app_handle: &tauri::AppHandle, uuid: &str) -> Result<(), String> {
    let mut data = load_accounts(app_handle)?;

    let was_default = data
        .accounts
        .iter()
        .find(|a| a.uuid == uuid)
        .map(|a| a.is_default)
        .unwrap_or(false);

    data.accounts.retain(|a| a.uuid != uuid);

    if was_default && !data.accounts.is_empty() {
        data.accounts[0].is_default = true;
    }

    save_accounts(app_handle, &data)
}

pub fn set_default_account(app_handle: &tauri::AppHandle, uuid: &str) -> Result<(), String> {
    let mut data = load_accounts(app_handle)?;

    for account in &mut data.accounts {
        account.is_default = account.uuid == uuid;
    }

    save_accounts(app_handle, &data)
}

pub fn get_default_account(
    app_handle: &tauri::AppHandle,
) -> Result<Option<MinecraftAccount>, String> {
    let data = load_accounts(app_handle)?;
    Ok(data.accounts.into_iter().find(|a| a.is_default))
}
