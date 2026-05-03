use tauri::{command, Emitter, Window};
use serde::{Deserialize, Serialize};
use xal::{
    app_params::MC_BEDROCK_SWITCH,
    client_params::CLIENT_NINTENDO,
    Flows, XalAuthenticator,
    AuthPromptCallback, AuthPromptData,
    AccessTokenPrefix
};
use async_trait::async_trait;
use crate::errors::{LauncherError, AuthError};
use crate::{log_info, log_error, log_debug, log_warn};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub username: String,
    pub uuid: String,
    pub xuid: String,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthErrorResult {
    pub message: String,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DeviceCodeEvent {
    user_code: String,
    verification_uri: String,
}

struct TauriCallbackHandler {
    window: Window,
}

#[async_trait]
impl AuthPromptCallback for TauriCallbackHandler {
    async fn call(&self, data: AuthPromptData) -> Result<Option<xal::url::Url>, Box<dyn std::error::Error + 'static>> {
        log_debug!("XAL Callback received: {:?}", data);

        match data {
            AuthPromptData::DeviceCode { code, full_verificiation_url, .. } => {
                let event_data = DeviceCodeEvent {
                    user_code: code.secret().to_string(),
                    verification_uri: full_verificiation_url.secret().to_string(),
                };

                self.window.emit("auth-device-code", &event_data)
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + 'static>)?;
            },
            AuthPromptData::RedirectUrl { url, .. } => {
                log_debug!("RedirectUrl flow - opening URL in browser");
                let event_data = DeviceCodeEvent {
                    user_code: "NO_CODE".to_string(),
                    verification_uri: url.to_string(),
                };

                self.window.emit("auth-redirect-url", &event_data)
                    .map_err(|e| Box::new(e) as Box<dyn std::error::Error + 'static>)?;
            }
        }

        Ok(None)
    }
}

#[command]
pub async fn login_offline(username: String) -> Result<AuthResult, AuthErrorResult> {
    log_info!("Initiating Offline Login for: {}", username);
    let uuid = format!("offline-{}", username);
    Ok(AuthResult {
        access_token: "offline_token".to_string(),
        refresh_token: "none".to_string(),
        expires_in: 0,
        username,
        uuid,
        xuid: "0".to_string(),
        mode: "offline".to_string(),
    })
}

#[command]
pub async fn login_microsoft(window: Window) -> Result<AuthResult, AuthErrorResult> {
    log_info!("login_microsoft called (XAL-RS - Device Code Flow)");

    let mut authenticator = XalAuthenticator::new(
        MC_BEDROCK_SWITCH(),
        CLIENT_NINTENDO(),
        "RETAIL".into(),
    );

    let callback_handler = TauriCallbackHandler { window: window.clone() };

    log_debug!("Starting Device Code authentication flow...");
    let token_store = Flows::ms_device_code_flow(
        &mut authenticator,
        callback_handler,
        tokio::time::sleep
    ).await.map_err(|e| {
        log_error!("XAL Auth Failed: {}", e);
        AuthErrorResult {
            message: format!("XAL Auth Failed: {}", e),
            code: "XAL_AUTH_ERROR".into()
        }
    })?;

    log_debug!("Device Code Auth successful, proceeding with Xbox Live authorization");

    let token_store = Flows::xbox_live_authorization_traditional_flow(
        &mut authenticator,
        token_store.live_token,
        xal::Constants::RELYING_PARTY_XBOXLIVE.into(),
        AccessTokenPrefix::None,
        false,
    ).await.map_err(|e| {
        log_error!("Xbox Live Auth Failed: {}", e);
        AuthErrorResult {
            message: format!("Xbox Live Auth Failed: {}", e),
            code: "XBL_AUTH_ERROR".into()
        }
    })?;

    log_info!("Xbox Live Auth Successful!");

    let xsts_mc_services = authenticator
        .get_xsts_token(
            token_store.device_token.as_ref(),
            token_store.title_token.as_ref(),
            token_store.user_token.as_ref(),
            "rp://api.minecraftservices.com/"
        )
        .await
        .map_err(|e| {
            log_error!("XSTS Exchange Failed: {}", e);
            AuthErrorResult {
                message: format!("XSTS Exchange Failed: {}", e),
                code: "XSTS_ERROR".into()
            }
        })?;

    let identity_token = xsts_mc_services.authorization_header_value();
    let xuid = xsts_mc_services.userhash();
    log_debug!("Got Identity Token for Minecraft. XUID: {}", xuid);

    let client = reqwest::Client::new();
    let mc_resp = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&serde_json::json!({"identityToken": identity_token}))
        .send()
        .await
        .map_err(|e| {
            log_error!("MC Login network request failed: {}", e);
            AuthErrorResult {
                message: e.to_string(),
                code: "MC_NET_ERROR".into()
            }
        })?;

    if !mc_resp.status().is_success() {
        let text = mc_resp.text().await.unwrap_or_default();
        log_error!("MC Login Failed: {}", text);
        return Err(AuthErrorResult {
            message: format!("MC Login Failed: {}", text),
            code: "MC_AUTH_FAIL".into()
        });
    }

    let mc_token_data: serde_json::Value = mc_resp.json().await
        .map_err(|e| {
            log_error!("MC token parse failed: {}", e);
            AuthErrorResult {
                message: e.to_string(),
                code: "MC_PARSE_ERROR".into()
            }
        })?;

    let mc_access_token = mc_token_data["access_token"].as_str()
        .ok_or_else(|| AuthErrorResult {
            message: "No MC Access Token".into(),
            code: "MC_TOKEN_MISSING".into()
        })?;

    let profile_resp = client.get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc_access_token))
        .send()
        .await
        .map_err(|e| {
            log_error!("Profile Fetch network request failed: {}", e);
            AuthErrorResult {
                message: e.to_string(),
                code: "PROFILE_NET_ERROR".into()
            }
        })?;

    if !profile_resp.status().is_success() {
        let text = profile_resp.text().await.unwrap_or_default();
        log_error!("Profile Fetch Failed: {}", text);
        return Err(AuthErrorResult {
            message: format!("Profile Fetch Failed: {}", text),
            code: "PROFILE_FAIL".into()
        });
    }

    let profile_data: serde_json::Value = profile_resp.json().await
        .map_err(|e| {
            log_error!("Profile data parse failed: {}", e);
            AuthErrorResult {
                message: e.to_string(),
                code: "PROFILE_PARSE_ERROR".into()
            }
        })?;

    let username = profile_data["name"].as_str().unwrap_or("Unknown").to_string();
    let uuid = profile_data["id"].as_str().unwrap_or("").to_string();

    log_info!("Login Complete! User: {}", username);

    Ok(AuthResult {
        access_token: mc_access_token.to_string(),
        refresh_token: "managed_by_xal".to_string(),
        expires_in: 3153600000,
        username,
        uuid,
        xuid,
        mode: "microsoft".to_string(),
    })
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    log_debug!("Rust open_url called with: {}", url);
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}
