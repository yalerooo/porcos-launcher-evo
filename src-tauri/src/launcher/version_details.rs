use serde::{Deserialize, Serialize};
use std::collections::HashMap;
// use std::path::PathBuf;
// use reqwest;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct VersionDetails {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub assets: String,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndex,
    pub downloads: Downloads,
    pub libraries: Vec<Library>,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments", default)]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AssetIndex {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Downloads {
    pub client: DownloadInfo,
    #[serde(default)]
    pub server: Option<DownloadInfo>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DownloadInfo {
    pub sha1: String,
    pub size: u64,
    pub url: String,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub natives: Option<HashMap<String, String>>,
    #[serde(default)]
    pub rules: Option<Vec<Rule>>,
    #[serde(default)]
    pub extract: Option<Extract>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<DownloadInfo>,
    #[serde(default)]
    pub classifiers: Option<HashMap<String, DownloadInfo>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Extract {
    pub exclude: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum Arguments {
    New(NewArguments),
    Old(String),
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct NewArguments {
    #[serde(default)]
    pub game: Vec<ArgumentItem>,
    #[serde(default)]
    pub jvm: Vec<ArgumentItem>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum ArgumentItem {
    Simple(String),
    Conditional(ConditionalArgument),
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ConditionalArgument {
    pub rules: Vec<Rule>,
    pub value: ArgumentValue,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(untagged)]
pub enum ArgumentValue {
    Single(String),
    Multiple(Vec<String>),
}

impl VersionDetails {
    /// Check if a library should be used based on rules
    pub fn should_use_library(library: &Library) -> bool {
        if let Some(rules) = &library.rules {
            for rule in rules {
                let mut os_match = true;
                let mut arch_match = true;

                if let Some(os) = &rule.os {
                    if let Some(os_name) = &os.name {
                        #[cfg(target_os = "windows")]
                        let current_os = "windows";
                        #[cfg(target_os = "macos")]
                        let current_os = "osx";
                        #[cfg(target_os = "linux")]
                        let current_os = "linux";
                        
                        if os_name != current_os {
                            os_match = false;
                        }
                    }
                    
                    if let Some(os_arch) = &os.arch {
                        #[cfg(target_arch = "x86")]
                        let current_arch = "x86";
                        #[cfg(target_arch = "x86_64")]
                        let current_arch = "x64"; 
                        #[cfg(target_arch = "aarch64")]
                        let current_arch = "arm64";

                        // Note: Mojang rules often use "x86" for 32-bit.
                        // If rule says "x86", it means 32-bit.
                        // If we are x86_64, we should NOT match "x86".
                        
                        if os_arch != current_arch {
                             arch_match = false;
                        }
                    }
                }

                if rule.action == "allow" && os_match && arch_match {
                    return true;
                } else if rule.action == "disallow" && os_match && arch_match {
                    return false;
                }
            }
            false // Default to false if rules exist but none matched (allow)
        } else {
            true // No rules means include
        }
    }
}
