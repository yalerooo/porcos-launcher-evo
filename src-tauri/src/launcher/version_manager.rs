use serde::{Deserialize, Serialize};
use reqwest;
use std::path::PathBuf;

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftVersion {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<MinecraftVersion>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[allow(dead_code)]
pub struct VersionManager {
    cache_dir: PathBuf,
}

impl VersionManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    /// Fetch version manifest from Mojang
    pub async fn fetch_version_manifest(&self) -> Result<VersionManifest, String> {
        println!("[VersionManager] Fetching version manifest from Mojang...");
        
        let response = reqwest::get(VERSION_MANIFEST_URL)
            .await
            .map_err(|e| format!("Failed to fetch version manifest: {}", e))?;
        
        let manifest: VersionManifest = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version manifest: {}", e))?;
        
        println!("[VersionManager] Found {} versions", manifest.versions.len());
        Ok(manifest)
    }

    /// Get list of release versions only
    pub async fn get_release_versions(&self) -> Result<Vec<MinecraftVersion>, String> {
        let manifest = self.fetch_version_manifest().await?;
        Ok(manifest
            .versions
            .into_iter()
            .filter(|v| v.version_type == "release")
            .collect())
    }

    /// Get all versions (releases and snapshots)
    #[allow(dead_code)]
    pub async fn get_all_versions(&self) -> Result<Vec<MinecraftVersion>, String> {
        let manifest = self.fetch_version_manifest().await?;
        Ok(manifest.versions)
    }

    pub async fn fetch_version_details(&self, url: &str) -> Result<crate::launcher::VersionDetails, String> {
        println!("[VersionManager] Fetching version details from {}...", url);
        
        let response = reqwest::get(url)
            .await
            .map_err(|e| format!("Failed to fetch version details: {}", e))?;
        
        let details: crate::launcher::VersionDetails = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse version details: {}", e))?;
            
        Ok(details)
    }
}
