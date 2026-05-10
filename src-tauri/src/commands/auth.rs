use tauri::{command, Emitter, Window};
use serde::{Deserialize, Serialize};
use crate::errors::{LauncherError, AuthError};
use crate::{log_info, log_error, log_debug, log_warn};

const DEVICE_CODE_URL: &str = "https://login.live.com/oauth20_connect.srf";
const MSA_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const CLIENT_ID: &str = "00000000402b5328";

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

#[derive(Debug, Serialize, Deserialize)]
struct MicrosoftTokenData {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

fn get_ms_tokens_path() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_default()
        .join("porcos-launcher")
        .join("ms_tokens.json")
}

fn save_ms_tokens(access_token: &str, refresh_token: &str, expires_in: u64) -> Result<(), String> {
    let tokens = MicrosoftTokenData {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        expires_in,
    };
    let config_dir = dirs::config_dir()
        .unwrap_or_default()
        .join("porcos-launcher");
    if !config_dir.exists() {
        std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    let path = get_ms_tokens_path();
    let json = serde_json::to_string(&tokens).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    log_info!("[TOKEN_SAVE] Saved Microsoft tokens to {:?}", path);
    Ok(())
}

fn load_ms_tokens() -> Option<MicrosoftTokenData> {
    let path = get_ms_tokens_path();
    if !path.exists() {
        log_debug!("[TOKEN_LOAD] No saved MS tokens at {:?}", path);
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    let tokens: MicrosoftTokenData = serde_json::from_str(&content).ok()?;
    log_info!("[TOKEN_LOAD] Loaded Microsoft tokens from {:?}", path);
    Some(tokens)
}

async fn exchange_ms_to_minecraft(client: &reqwest::Client, ms_access_token: &str) -> Result<(String, String), String> {
    log_info!("[MC_FLOW] Step 1: Getting Xbox token from Microsoft access token...");

    let xbox_resp = client
        .post(XBOX_AUTH_URL)
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("Xbox auth request failed: {}", e))?;

    if !xbox_resp.status().is_success() {
        let err = xbox_resp.text().await.unwrap_or_default();
        eprintln!("[DEBUG] Xbox Error: body={}", err);
        return Err(format!("Xbox auth failed: {}", err));
    }

    let xbox_data: serde_json::Value = xbox_resp.json().await
        .map_err(|e| format!("Failed to parse Xbox response: {}", e))?;

    eprintln!("[DEBUG] Xbox Response received");

    let xbox_token = xbox_data["Token"].as_str().ok_or("No token in Xbox response")?;
    let user_hash = xbox_data["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or("No uhs in Xbox response")?;

    log_info!("[MC_FLOW] Step 2: Getting XSTS token from Xbox token...");
    log_info!("[MC_FLOW] User hash: {}", user_hash);

    let xsts_resp = client
        .post(XSTS_AUTH_URL)
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbox_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("XSTS auth request failed: {}", e))?;

    if !xsts_resp.status().is_success() {
        let err_body = xsts_resp.text().await.unwrap_or_default();
        log_error!("[MC_FLOW] XSTS auth failed: {}", err_body);

        eprintln!("[DEBUG] XSTS Error: body={}", err_body);

        if err_body.contains("2148916238") {
            return Err("Account is a minor and needs to be added to a family group".to_string());
        }
        if err_body.contains("2148916233") {
            return Err("No Xbox account associated with this Microsoft account".to_string());
        }
        return Err(format!("XSTS auth failed: {}", err_body));
    }

    let xsts_data: serde_json::Value = xsts_resp.json().await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    eprintln!("[DEBUG] XSTS Response received");

    let xsts_token = xsts_data["Token"].as_str().ok_or("No token in XSTS response")?;
    let identity_token = format!("XBL3.0 x={};{}", user_hash, xsts_token);

    log_info!("[MC_FLOW] Step 3: Getting Minecraft token from XSTS identity token...");

    eprintln!("[DEBUG] MC Request: identityToken starts with: {}", &identity_token[..30]);

    let mc_resp = client
        .post(MC_LOGIN_URL)
        .json(&serde_json::json!({
            "identityToken": identity_token
        }))
        .send()
        .await
        .map_err(|e| format!("MC login request failed: {}", e))?;

    eprintln!("[DEBUG] MC Response status={}", mc_resp.status().as_u16());

    if !mc_resp.status().is_success() {
        let err = mc_resp.text().await.unwrap_or_default();
        eprintln!("[DEBUG] MC Error body: {}", err);
        return Err(format!("MC login failed: {}", err));
    }

    let mc_data: serde_json::Value = mc_resp.json().await
        .map_err(|e| format!("Failed to parse MC response: {}", e))?;

    let mc_access_token = mc_data["access_token"].as_str().ok_or("No access_token in MC response")?;
    let mc_username = mc_data.get("profiles")
        .and_then(|p| p.get("mc"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let mc_expires_in = mc_data["expires_in"].as_u64().unwrap_or(86400);

    log_info!("[MC_FLOW] Minecraft token obtained! Username: {}", mc_username);

    Ok((mc_access_token.to_string(), mc_username))
}

async fn get_minecraft_profile(client: &reqwest::Client, mc_access_token: &str) -> Result<(String, String), String> {
    log_info!("[MC_FLOW] Step 4: Getting Minecraft profile...");

    let profile_resp = client.get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc_access_token))
        .send()
        .await
        .map_err(|e| format!("MC profile request failed: {}", e))?;

    if !profile_resp.status().is_success() {
        let err = profile_resp.text().await.unwrap_or_default();
        return Err(format!("MC profile failed: {}", err));
    }

    let profile_data: serde_json::Value = profile_resp.json().await
        .map_err(|e| format!("Failed to parse MC profile: {}", e))?;

    let mc_uuid = profile_data["id"].as_str().ok_or("No id in MC profile")?;
    let mc_username = profile_data["name"].as_str().ok_or("No name in MC profile")?;

    log_info!("[MC_FLOW] MC profile obtained! Username: {}, UUID: {}", mc_username, mc_uuid);

    Ok((mc_uuid.to_string(), mc_username.to_string()))
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
    log_info!("===========================================");
    log_info!("login_microsoft STARTED (manual device code flow)");
    log_info!("===========================================");

    let client = reqwest::Client::new();

    log_info!("[LOGIN] Step 1: Requesting device code from Microsoft...");
    let device_code_resp_text = client
        .post(DEVICE_CODE_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin XboxLive.offline_access"),
            ("response_type", "device_code"),
        ])
        .send()
        .await
        .map_err(|e| {
            log_error!("[LOGIN] Device code request failed: {}", e);
            AuthErrorResult {
                message: format!("Device code request failed: {}", e),
                code: "DEVICE_CODE_ERROR".into()
            }
        })?
        .text()
        .await
        .map_err(|e| {
            log_error!("[LOGIN] Failed to read device code response: {}", e);
            AuthErrorResult {
                message: format!("Failed to read device code: {}", e),
                code: "DEVICE_CODE_READ_ERROR".into()
            }
    })?;

    let device_code_json: serde_json::Value = serde_json::from_str(&device_code_resp_text)
        .map_err(|e| {
            log_error!("[LOGIN] Failed to parse device code JSON: {}", e);
            AuthErrorResult {
                message: format!("Failed to parse device code JSON: {}", e),
                code: "DEVICE_CODE_PARSE_ERROR".into()
            }
        })?;

    let device_code = device_code_json["device_code"].as_str().ok_or_else(|| {
        log_error!("[LOGIN] No device_code in response");
        log_error!("[LOGIN] Response keys: {:?}", device_code_json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        AuthErrorResult {
            message: "No device_code in response".into(),
            code: "DEVICE_CODE_MISSING".into()
        }
    })?;
    let user_code = device_code_json["user_code"].as_str().unwrap_or("");
    let verification_uri = device_code_json["verification_uri"].as_str().unwrap_or("https://www.microsoft.com/devicelogin");
    let interval = device_code_json["interval"].as_u64().unwrap_or(5);

    log_info!("[LOGIN] Device code received!");
    log_info!("[LOGIN] Verification URL: {}", verification_uri);
    log_info!("[LOGIN] User code: {}", user_code);

    let event_data = DeviceCodeEvent {
        user_code: user_code.to_string(),
        verification_uri: verification_uri.to_string(),
    };
    window.emit("auth-device-code", &event_data).map_err(|e| {
        log_error!("[LOGIN] Failed to emit device code event: {}", e);
        AuthErrorResult {
            message: format!("Failed to emit device code: {}", e),
            code: "EMIT_ERROR".into()
        }
    })?;

    log_info!("[LOGIN] Step 2: Polling for Microsoft token (interval: {}s)...", interval);

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;

        let token_resp = client
            .post(MSA_TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", CLIENT_ID),
                ("device_code", device_code),
            ])
            .send()
            .await
            .map_err(|e| {
                log_error!("[LOGIN] Token poll request failed: {}", e);
                AuthErrorResult {
                    message: format!("Token poll failed: {}", e),
                    code: "TOKEN_POLL_ERROR".into()
                }
            })?;

        let token_data: serde_json::Value = token_resp.json().await.map_err(|e| {
            log_error!("[LOGIN] Failed to parse token response: {}", e);
            AuthErrorResult {
                message: format!("Failed to parse token: {}", e),
                code: "TOKEN_PARSE_ERROR".into()
            }
        })?;

        if let Some(error) = token_data.get("error").and_then(|e| e.as_str()) {
            if error == "authorization_pending" {
                log_debug!("[LOGIN] Authorization pending, continuing to poll...");
                continue;
            } else if error == "authorization_declined" {
                log_error!("[LOGIN] Authorization declined by user");
                return Err(AuthErrorResult {
                    message: "Authorization declined".into(),
                    code: "AUTH_DECLINED".into()
                });
            } else if error == "expired_token" {
                log_error!("[LOGIN] Device code expired");
                return Err(AuthErrorResult {
                    message: "Device code expired".into(),
                    code: "DEVICE_CODE_EXPIRED".into()
                });
            } else {
                log_error!("[LOGIN] Authorization error: {}", error);
                let desc = token_data.get("error_description").map(|d| d.to_string()).unwrap_or_default();
                return Err(AuthErrorResult {
                    message: format!("Authorization error: {}", desc),
                    code: "AUTH_ERROR".into()
                });
            }
        }

        if token_data.get("access_token").is_some() {
            log_info!("[LOGIN] Microsoft token received!");

            let ms_access_token = token_data["access_token"].as_str().unwrap_or("");
            let ms_refresh_token = token_data["refresh_token"].as_str().unwrap_or("");
            let ms_expires_in = token_data["expires_in"].as_u64().unwrap_or(3600);

            log_info!("[LOGIN] MS access_token (first 30 chars): {}", &ms_access_token.chars().take(30).collect::<String>());

            if !ms_refresh_token.is_empty() {
                log_info!("[LOGIN] MS refresh_token available (first 30 chars): {}", &ms_refresh_token.chars().take(30).collect::<String>());
                if let Err(e) = save_ms_tokens(ms_access_token, ms_refresh_token, ms_expires_in) {
                    log_warn!("[LOGIN] Failed to save MS tokens: {}", e);
                } else {
                    log_info!("[LOGIN] Microsoft tokens saved for future silent refresh");
                }
            }

            log_info!("[LOGIN] Step 3: Exchanging Microsoft token for Minecraft token...");
            let (mc_access_token, mc_username) = match exchange_ms_to_minecraft(&client, ms_access_token).await {
                Ok(result) => result,
                Err(e) => {
                    log_error!("[LOGIN] Minecraft token exchange failed: {}", e);
                    return Err(AuthErrorResult {
                        message: format!("Minecraft auth failed: {}", e),
                        code: "MC_AUTH_ERROR".into()
                    });
                }
            };

            log_info!("[LOGIN] Minecraft token received!");
            log_info!("[LOGIN] MC username from token: {}", mc_username);

            log_info!("[LOGIN] Step 4: Getting Minecraft profile...");
            let (mc_uuid, mc_profile_name) = match get_minecraft_profile(&client, &mc_access_token).await {
                Ok(result) => result,
                Err(e) => {
                    log_error!("[LOGIN] MC profile fetch failed: {}", e);
                    (format!("offline-{}", mc_username), mc_username.clone())
                }
            };

            let mc_expires_in = 86400u64;

            log_info!("[LOGIN] ===========================================");
            log_info!("[LOGIN] LOGIN COMPLETE!");
            log_info!("[LOGIN] Username: {}", mc_profile_name);
            log_info!("[LOGIN] UUID: {}", mc_uuid);
            log_info!("[LOGIN] MC access_token (first 30 chars): {}", &mc_access_token.chars().take(30).collect::<String>());
            log_info!("[LOGIN] MC expires_in: {} seconds ({:.2} hours)", mc_expires_in, mc_expires_in as f64 / 3600.0);
            if !ms_refresh_token.is_empty() {
                log_info!("[LOGIN] MS refresh_token saved for silent refresh!");
            }
            log_info!("[LOGIN] ===========================================");

            return Ok(AuthResult {
                access_token: mc_access_token,
                refresh_token: ms_refresh_token.to_string(),
                expires_in: mc_expires_in,
                username: mc_profile_name,
                uuid: mc_uuid,
                xuid: "0".to_string(),
                mode: "microsoft".to_string(),
            });
        }
    }
}

#[command]
pub async fn open_url(url: String) -> Result<(), String> {
    log_debug!("Rust open_url called with: {}", url);
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

#[command]
pub async fn validate_and_refresh_token(
    access_token: String,
    refresh_token: String,
) -> Result<AuthResult, AuthErrorResult> {
    log_info!("===========================================");
    log_info!("validate_and_refresh_token STARTED");
    log_info!("===========================================");

    let client = reqwest::Client::new();

    log_info!("[STEP 1] Validating current MC token with /minecraft/profile");

    let validate_resp = client.get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await;

    match validate_resp {
        Ok(resp) => {
            let status = resp.status();
            log_info!("[STEP 1] Profile check response status: {}", status);
            if status.is_success() {
                log_info!("[STEP 1] SUCCESS - MC token is still valid!");

                let profile_data: serde_json::Value = resp.json().await
                    .map_err(|e| AuthErrorResult {
                        message: format!("Failed to parse profile: {}", e),
                        code: "PROFILE_PARSE_ERROR".into()
                    })?;
                let mc_uuid = profile_data["id"].as_str().unwrap_or("").to_string();
                let mc_profile_name = profile_data["name"].as_str().unwrap_or("Unknown").to_string();

                log_info!("===========================================");
                log_info!("validate_and_refresh_token ENDED - TOKEN_STILL_VALID");
                log_info!("===========================================");

                return Ok(AuthResult {
                    access_token: access_token.clone(),
                    refresh_token: refresh_token.clone(),
                    expires_in: 86400,
                    username: mc_profile_name,
                    uuid: mc_uuid,
                    xuid: String::new(),
                    mode: "microsoft".to_string(),
                });
            }
            let body = resp.text().await.unwrap_or_default();
            log_warn!("[STEP 1] MC token validation failed. Status: {}, Body: {}", status, body);
        }
        Err(e) => {
            log_error!("[STEP 1] Network error during MC token validation: {}", e);
        }
    }

    log_info!("[STEP 2] MC token invalid, attempting Microsoft token refresh...");
    log_info!("[STEP 2] Refresh token (first 30 chars): {}", &refresh_token.chars().take(30).collect::<String>());

    if refresh_token.is_empty() {
        log_warn!("[STEP 2] No Microsoft refresh token available");
    } else {
        log_info!("[STEP 2] Attempting to refresh Microsoft tokens using OAuth2...");

        let token_resp = client
            .post(MSA_TOKEN_URL)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token.as_str()),
                ("client_id", CLIENT_ID),
            ])
            .send()
            .await;

        match token_resp {
            Ok(resp) => {
                if resp.status().is_success() {
                    let token_data: serde_json::Value = match resp.json().await {
                        Ok(d) => d,
                        Err(e) => {
                            log_error!("[STEP 2] Failed to parse refresh response: {}", e);
                            return Err(AuthErrorResult {
                                message: format!("Parse error: {}", e),
                                code: "REFRESH_PARSE_ERROR".into()
                            });
                        }
                    };

                    log_info!("[STEP 2] Microsoft token refresh SUCCESS!");
                    let new_ms_access = token_data["access_token"].as_str().unwrap_or("");
                    let new_ms_refresh = token_data["refresh_token"].as_str().unwrap_or(&refresh_token);
                    let new_expires = token_data["expires_in"].as_u64().unwrap_or(3600);

                    if let Err(e) = save_ms_tokens(new_ms_access, new_ms_refresh, new_expires) {
                        log_warn!("[STEP 2] Failed to save new MS tokens: {}", e);
                    }

                    log_info!("[STEP 2] Exchanging new Microsoft token for MC token...");
                    let (mc_access_token, mc_username) = match exchange_ms_to_minecraft(&client, new_ms_access).await {
                        Ok(result) => result,
                        Err(e) => {
                            log_error!("[STEP 2] MC token exchange failed: {}", e);
                            return Err(AuthErrorResult {
                                message: format!("MC token refresh failed: {}", e),
                                code: "MC_REFRESH_ERROR".into()
                            });
                        }
                    };

                    log_info!("[STEP 2] New MC token obtained!");
                    log_info!("[STEP 2] MC access_token (first 30 chars): {}", &mc_access_token.chars().take(30).collect::<String>());
                    log_info!("[STEP 2] MC username from token: {}", mc_username);

                    log_info!("[STEP 2] Getting MC profile after refresh...");
                    let (mc_uuid, mc_profile_name) = match get_minecraft_profile(&client, &mc_access_token).await {
                        Ok(result) => result,
                        Err(e) => {
                            log_error!("[STEP 2] MC profile fetch failed: {}", e);
                            (format!("offline-{}", mc_username), mc_username.clone())
                        }
                    };

                    log_info!("===========================================");
                    log_info!("validate_and_refresh_token ENDED - MS_REFRESH_SUCCESS");
                    log_info!("===========================================");

                    return Ok(AuthResult {
                        access_token: mc_access_token,
                        refresh_token: new_ms_refresh.to_string(),
                        expires_in: 86400,
                        username: mc_profile_name,
                        uuid: mc_uuid,
                        xuid: String::new(),
                        mode: "microsoft".to_string(),
                    });
                } else {
                    let error_text = resp.text().await.unwrap_or_default();
                    log_error!("[STEP 2] Microsoft token refresh failed: {}", error_text);
                }
            }
            Err(e) => {
                log_error!("[STEP 2] Microsoft token refresh request failed: {}", e);
            }
        }
    }

    log_info!("[STEP 3] All refresh attempts failed - user will need fresh login");
    log_info!("===========================================");
    log_info!("validate_and_refresh_token ENDED - NO_REFRESH_TOKEN");
    log_info!("===========================================");

    return Err(AuthErrorResult {
        message: "Token expired and requires re-authentication".into(),
        code: "NO_REFRESH_TOKEN".into(),
    });
}