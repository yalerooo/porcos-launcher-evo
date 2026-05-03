use tauri::command;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::errors::{LauncherError, ModLoaderError, NetworkError};
use crate::{log_info, log_error, log_debug};

#[derive(Debug, Serialize, Deserialize)]
pub struct LoaderVersion {
    pub id: String,
    pub loader: String,
    pub version: String,
    pub stable: bool,
}

#[derive(Deserialize)]
struct FabricLoaderResponse {
    loader: FabricLoaderObj,
}

#[derive(Deserialize)]
struct FabricLoaderObj {
    version: String,
    stable: bool,
}

#[derive(Deserialize)]
struct QuiltLoaderResponse {
    loader: QuiltLoaderObj,
}

#[derive(Deserialize)]
struct QuiltLoaderObj {
    version: String,
}

#[command]
pub async fn get_fabric_versions(minecraft_version: String) -> Result<Vec<LoaderVersion>, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", minecraft_version);
    log_info!("Fetching Fabric versions for {} from: {}", minecraft_version, url);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| ModLoaderError::network_error("fabric", e.to_string()).to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        log_error!("Fabric versions request failed with status {}: {}", status, url);
        if status == 404 {
            return Ok(Vec::new());
        }
        return Err(ModLoaderError::network_error("fabric", format!("Status: {}", status)).to_string());
    }

    let versions: Vec<FabricLoaderResponse> = response.json()
        .await
        .map_err(|e| ModLoaderError::invalid_response("fabric").to_string())?;

    let mut loader_versions: Vec<LoaderVersion> = versions.into_iter().map(|v| LoaderVersion {
        id: format!("fabric-{}", v.loader.version),
        loader: "fabric".to_string(),
        version: v.loader.version,
        stable: v.loader.stable,
    }).collect();

    loader_versions.sort_by(|a, b| {
        if a.stable != b.stable {
            return b.stable.cmp(&a.stable);
        }
        compare_versions(&b.version, &a.version)
    });

    Ok(loader_versions)
}

fn compare_versions(v1: &str, v2: &str) -> std::cmp::Ordering {
    let parts1: Vec<u32> = v1.split(|c: char| !c.is_numeric())
        .filter_map(|s| s.parse().ok())
        .collect();
    let parts2: Vec<u32> = v2.split(|c: char| !c.is_numeric())
        .filter_map(|s| s.parse().ok())
        .collect();

    for (p1, p2) in parts1.iter().zip(parts2.iter()) {
        match p1.cmp(p2) {
            std::cmp::Ordering::Equal => continue,
            ord => return ord,
        }
    }

    parts1.len().cmp(&parts2.len())
}

#[command]
pub async fn get_quilt_versions(minecraft_version: String) -> Result<Vec<LoaderVersion>, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", minecraft_version);
    log_info!("Fetching Quilt versions for {} from: {}", minecraft_version, url);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| ModLoaderError::network_error("quilt", e.to_string()).to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        log_error!("Quilt versions request failed with status {}: {}", status, url);
        if status == 404 {
            return Ok(Vec::new());
        }
        return Err(ModLoaderError::network_error("quilt", format!("Status: {}", status)).to_string());
    }

    let versions: Vec<QuiltLoaderResponse> = response.json()
        .await
        .map_err(|e| ModLoaderError::invalid_response("quilt").to_string())?;

    let mut loader_versions: Vec<LoaderVersion> = versions.into_iter().map(|v| {
        let stable = !v.loader.version.contains("-beta") && !v.loader.version.contains("-alpha");
        LoaderVersion {
            id: format!("quilt-{}", v.loader.version),
            loader: "quilt".to_string(),
            version: v.loader.version,
            stable,
        }
    }).collect();

    loader_versions.sort_by(|a, b| {
        if a.stable != b.stable {
            return b.stable.cmp(&a.stable);
        }
        compare_versions(&b.version, &a.version)
    });

    Ok(loader_versions)
}

#[derive(Deserialize)]
struct NeoForgeResponse {
    versions: Vec<String>,
}

#[command]
pub async fn get_neoforge_versions(minecraft_version: String) -> Result<Vec<LoaderVersion>, String> {
    log_info!("Fetching NeoForge versions for {}", minecraft_version);

    if minecraft_version == "1.20.1" {
        let url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge";
        let response = reqwest::get(url)
            .await
            .map_err(|e| ModLoaderError::network_error("neoforge", e.to_string()).to_string())?;

        if !response.status().is_success() {
            log_error!("NeoForge versions request failed for 1.20.1: {}", response.status());
            return Ok(Vec::new());
        }

        let data: NeoForgeResponse = response.json()
            .await
            .map_err(|e| ModLoaderError::invalid_response("neoforge").to_string())?;

        let mut filtered_versions: Vec<LoaderVersion> = data.versions.into_iter()
            .filter(|v| v.starts_with("1.20.1-"))
            .map(|v| {
                let stable = !v.contains("-beta");
                LoaderVersion {
                    id: format!("neoforge-{}", v),
                    loader: "neoforge".to_string(),
                    version: v,
                    stable,
                }
            })
            .collect();

        filtered_versions.sort_by(|a, b| compare_versions(&b.version, &a.version));
        return Ok(filtered_versions);
    }

    let url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
    let response = reqwest::get(url)
        .await
        .map_err(|e| ModLoaderError::network_error("neoforge", e.to_string()).to_string())?;

    if !response.status().is_success() {
        log_error!("NeoForge versions request failed: {}", response.status());
        return Ok(Vec::new());
    }

    let data: NeoForgeResponse = response.json()
        .await
        .map_err(|e| ModLoaderError::invalid_response("neoforge").to_string())?;

    let parts: Vec<&str> = minecraft_version.split('.').collect();
    let nf_prefix = if parts.len() >= 2 && parts[0] == "1" {
        let major = parts[1];
        let minor = if parts.len() > 2 { parts[2] } else { "0" };
        format!("{}.{}.", major, minor)
    } else {
        if minecraft_version.starts_with("1.") {
             format!("{}.", &minecraft_version[2..])
        } else {
             format!("{}.", minecraft_version)
        }
    };

    let mut filtered_versions: Vec<LoaderVersion> = data.versions.into_iter()
        .filter(|v| v.starts_with(&nf_prefix))
        .map(|v| {
            let stable = !v.contains("-beta");
            LoaderVersion {
                id: format!("neoforge-{}", v),
                loader: "neoforge".to_string(),
                version: v,
                stable,
            }
        })
        .collect();

    filtered_versions.sort_by(|a, b| compare_versions(&b.version, &a.version));

    Ok(filtered_versions)
}

#[derive(Deserialize)]
struct _ForgePromos {
    promos: HashMap<String, String>,
}

#[derive(Deserialize)]
struct ForgeResponse {
    promos: HashMap<String, String>,
}

#[command]
pub async fn get_forge_versions(minecraft_version: String) -> Result<Vec<LoaderVersion>, String> {
    log_info!("Fetching Forge versions for {}", minecraft_version);

    let promos_url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let mut recommended_ver = String::new();

    if let Ok(response) = reqwest::get(promos_url).await {
        if let Ok(data) = response.json::<ForgeResponse>().await {
            let key = format!("{}-recommended", minecraft_version);
            if let Some(v) = data.promos.get(&key) {
                recommended_ver = v.clone();
            }
        }
    }

    let metadata_url = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
    let response = reqwest::get(metadata_url)
        .await
        .map_err(|e| ModLoaderError::network_error("forge", e.to_string()).to_string())?;

    if !response.status().is_success() {
        log_error!("Forge metadata request failed: {}", response.status());
        return Err(ModLoaderError::network_error("forge", format!("Status: {}", response.status())).to_string());
    }

    let xml_content = response.text()
        .await
        .map_err(|e| ModLoaderError::invalid_response("forge").to_string())?;

    let mut versions = Vec::new();
    let prefix = format!("{}-", minecraft_version);

    for line in xml_content.lines() {
        let line = line.trim();
        if line.starts_with("<version>") && line.ends_with("</version>") {
            if line.len() > 19 {
                let content = &line[9..line.len()-10];
                if content.starts_with(&prefix) {
                    let forge_ver = &content[prefix.len()..];

                    versions.push(LoaderVersion {
                        id: format!("forge-{}", forge_ver),
                        loader: "forge".to_string(),
                        version: forge_ver.to_string(),
                        stable: forge_ver == recommended_ver,
                    });
                }
            }
        }
    }

    versions.sort_by(|a, b| compare_versions(&b.version, &a.version));

    Ok(versions)
}
