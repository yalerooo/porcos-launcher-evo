use tauri::command;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoaderVersion {
    pub id: String,
    pub loader: String, // "fabric", "forge", "neoforge", "quilt"
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
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Ok(Vec::new()); // Return empty if not found or error
    }

    let versions: Vec<FabricLoaderResponse> = response.json().await.map_err(|e| e.to_string())?;

    let mut loader_versions: Vec<LoaderVersion> = versions.into_iter().map(|v| LoaderVersion {
        id: format!("fabric-{}", v.loader.version),
        loader: "fabric".to_string(),
        version: v.loader.version,
        stable: v.loader.stable,
    }).collect();

    // Sort versions: Stable first, then by version number descending
    loader_versions.sort_by(|a, b| {
        if a.stable != b.stable {
            return b.stable.cmp(&a.stable); // Stable (true) first
        }
        compare_versions(&b.version, &a.version) // Newest version first
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
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let versions: Vec<QuiltLoaderResponse> = response.json().await.map_err(|e| e.to_string())?;

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
    let url = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let data: NeoForgeResponse = response.json().await.map_err(|e| e.to_string())?;
    
    // NeoForge versions are like "20.4.106-beta" where "20.4" corresponds to MC "1.20.4"
    // We need to map minecraft_version (e.g. "1.20.4") to NeoForge major version (e.g. "20.4")
    
    // Simple heuristic: remove "1." prefix if present
    let nf_prefix = if minecraft_version.starts_with("1.") {
        &minecraft_version[2..]
    } else {
        &minecraft_version
    };

    let filtered_versions: Vec<LoaderVersion> = data.versions.into_iter()
        .filter(|v| v.starts_with(nf_prefix))
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

    Ok(filtered_versions)
}

#[derive(Deserialize)]
struct ForgePromos {
    promos: HashMap<String, String>,
}

#[derive(Deserialize)]
struct ForgeResponse {
    promos: HashMap<String, String>,
}

#[command]
pub async fn get_forge_versions(minecraft_version: String) -> Result<Vec<LoaderVersion>, String> {
    let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(Vec::new());
    }

    let data: ForgeResponse = response.json().await.map_err(|e| e.to_string())?;
    
    let mut versions = Vec::new();
    
    let latest_key = format!("{}-latest", minecraft_version);
    let recommended_key = format!("{}-recommended", minecraft_version);

    if let Some(v) = data.promos.get(&recommended_key) {
        versions.push(LoaderVersion {
            id: format!("forge-{}", v),
            loader: "forge".to_string(),
            version: v.clone(),
            stable: true,
        });
    }

    if let Some(v) = data.promos.get(&latest_key) {
        // Avoid duplicate if latest == recommended
        if !versions.iter().any(|existing| existing.version == *v) {
             versions.push(LoaderVersion {
                id: format!("forge-{}", v),
                loader: "forge".to_string(),
                version: v.clone(),
                stable: false, // Latest is considered unstable/beta usually
            });
        }
    }

    Ok(versions)
}
