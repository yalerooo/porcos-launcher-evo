use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct McProfileSkin {
    pub id: String,
    pub state: String,
    pub url: String,
    #[serde(rename = "variant")]
    pub skin_variant: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McProfileCape {
    pub id: String,
    pub state: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McProfile {
    pub id: String,
    pub name: String,
    pub skins: Vec<McProfileSkin>,
    pub capes: Vec<McProfileCape>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadSkinResponse {
    pub id: Option<String>,
    pub state: Option<String>,
    pub url: Option<String>,
    #[serde(rename = "variant")]
    pub variant: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UploadCapeResponse {
    pub id: Option<String>,
    pub state: Option<String>,
    pub url: Option<String>,
}

pub async fn get_minecraft_profile(client: &reqwest::Client, token: &str) -> Result<McProfile, String> {
    let resp = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch profile: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Profile fetch failed ({}): {}", status, text));
    }

    let profile: McProfile = resp.json().await
        .map_err(|e| format!("Failed to parse profile: {}", e))?;

    Ok(profile)
}

pub async fn upload_skin(
    client: &reqwest::Client,
    token: &str,
    image_data: &[u8],
    variant: &str,
) -> Result<UploadSkinResponse, String> {
    let part = reqwest::multipart::Part::bytes(image_data.to_vec())
        .file_name("skin.png")
        .mime_str("image/png")
        .map_err(|e| format!("Failed to create part: {}", e))?;

    let variant_owned = variant.to_string();

    let form = reqwest::multipart::Form::new()
        .text("variant", variant_owned)
        .part("file", part);

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload skin: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Skin upload failed ({}): {}", status, text));
    }

    let result: UploadSkinResponse = resp.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(result)
}

pub async fn set_active_skin(
    client: &reqwest::Client,
    token: &str,
    skin_id: &str,
    variant: &str,
) -> Result<(), String> {
    #[derive(Serialize)]
    struct SetActiveSkinRequest<'a> {
        #[serde(rename = "skinId")]
        skin_id: &'a str,
        variant: &'a str,
    }

    let request_body = SetActiveSkinRequest {
        skin_id,
        variant,
    };

    let resp = client
        .put("https://api.minecraftservices.com/minecraft/profile/skins/active")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to set active skin: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Set active skin failed ({}): {}", status, text));
    }

    Ok(())
}

pub async fn upload_cape(
    client: &reqwest::Client,
    token: &str,
    image_data: &[u8],
) -> Result<UploadCapeResponse, String> {
    let part = reqwest::multipart::Part::bytes(image_data.to_vec())
        .file_name("cape.png")
        .mime_str("image/png")
        .map_err(|e| format!("Failed to create part: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part);

    let resp = client
        .post("https://api.minecraftservices.com/minecraft/profile/capes")
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload cape: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Cape upload failed ({}): {}", status, text));
    }

    let result: UploadCapeResponse = resp.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(result)
}

pub async fn set_active_cape(
    client: &reqwest::Client,
    token: &str,
    cape_id: &str,
) -> Result<(), String> {
    #[derive(Serialize)]
    struct SetActiveCapeRequest<'a> {
        #[serde(rename = "capeId")]
        cape_id: &'a str,
    }

    let request_body = SetActiveCapeRequest { cape_id };

    let resp = client
        .put("https://api.minecraftservices.com/minecraft/profile/capes/active")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to set active cape: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Set active cape failed ({}): {}", status, text));
    }

    Ok(())
}

pub async fn download_image(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }

    let bytes = resp.bytes().await
        .map_err(|e| format!("Failed to read image bytes: {}", e))?;

    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn get_minecraft_profile_full(token: String) -> Result<McProfile, String> {
    let client = reqwest::Client::new();
    get_minecraft_profile(&client, &token).await
}

#[tauri::command]
pub async fn upload_minecraft_skin(
    token: String,
    image_data: Vec<u8>,
    variant: String,
) -> Result<UploadSkinResponse, String> {
    let client = reqwest::Client::new();
    upload_skin(&client, &token, &image_data, &variant).await
}

#[tauri::command]
pub async fn upload_minecraft_cape(
    token: String,
    image_data: Vec<u8>,
) -> Result<UploadCapeResponse, String> {
    let client = reqwest::Client::new();
    upload_cape(&client, &token, &image_data).await
}

#[tauri::command]
pub async fn set_minecraft_active_cape(
    token: String,
    cape_id: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    set_active_cape(&client, &token, &cape_id).await
}

#[tauri::command]
pub async fn download_skin_from_url(url: String) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;
    download_image(&client, &url).await
}

#[tauri::command]
pub async fn set_minecraft_active_skin(
    token: String,
    skin_id: String,
    variant: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    set_active_skin(&client, &token, &skin_id, &variant).await
}

#[tauri::command]
pub async fn get_skin_as_base64(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let bytes = download_image(&client, &url).await?;

    let base64 = base64_encode(&bytes);

    let mime_type = if url.contains(".png") || url.contains("skin") {
        "image/png"
    } else if url.contains(".jpg") || url.contains(".jpeg") {
        "image/jpeg"
    } else {
        "image/png"
    };

    Ok(format!("data:{};base64,{}", mime_type, base64))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;

        result.push(CHARSET[b0 >> 2] as char);
        result.push(CHARSET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);

        if chunk.len() > 1 {
            result.push(CHARSET[((b1 & 0x0f) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARSET[b2 & 0x3f] as char);
        } else {
            result.push('=');
        }
    }

    result
}