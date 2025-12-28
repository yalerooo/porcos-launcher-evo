import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2, AlertCircle, Check, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join, appCacheDir, homeDir } from '@tauri-apps/api/path';
import { useLauncherStore } from '@/stores/launcherStore';
import styles from './ModpackInstallModal.module.css';
import { cn } from '@/lib/utils';

// Force re-render
const TIMESTAMP = Date.now();

const BACKGROUNDS = [
    "1021170.png", "1102409.png", "1117616.jpg", "1117617.jpg", "1117618.jpg", "1117621.jpg", 
    "1138899.png", "1168337.jpg", "1184187.jpg", "1186419.png", "1234635.png", "1240231.png", 
    "1313226.png", "1313258.png", "1317021.png", "1317033.png", "1317036.png", "1321959.png", 
    "1325278.jpeg", "1329100.png", "1333794.jpeg", "1333796.jpeg", "1333797.jpeg", "1353836.png", 
    "1353838.png", "1363102.png", "1368460.png", "1370592.jpeg", "1374582.png", "1374585.png", 
    "1377209.jpg", "1389013.png", "1391270.png", "1394736.png", "1394737.png", "377757.jpg", 
    "473168.jpg", "556713.png", "556719.jpg", "556720.jpg", "556722.jpg", "556724.jpg", 
    "556729.jpg", "556736.jpg", "557913.jpg", "558708.jpg", "733612.png"
];

interface ModpackInstallModalProps {
    isOpen: boolean;
    onClose: () => void;
    modpack: any; // The selected modpack item
}

const ModpackInstallModal: React.FC<ModpackInstallModalProps> = ({ isOpen, onClose, modpack }) => {
    const { addInstance } = useLauncherStore();
    const [versions, setVersions] = useState<any[]>([]);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<any>(null);
    const [installStage, setInstallStage] = useState<string>('');
    const [progress, setProgress] = useState(0);
    const [isInstalling, setIsInstalling] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Ref to track if we are currently downloading a large file to show detailed progress
    const isDownloadingRef = useRef(false);

    // Filters
    const [filterGameVersion, setFilterGameVersion] = useState<string>('');
    const [filterLoader, setFilterLoader] = useState<string>('');
    const [availableGameVersions, setAvailableGameVersions] = useState<string[]>([]);
    const [availableLoaders, setAvailableLoaders] = useState<string[]>([]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('download-progress', (event: any) => {
                if (isDownloadingRef.current) {
                    // Update progress directly from the event payload (0-100)
                    setProgress(Math.round(event.payload as number));
                }
            });
        };
        
        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (isOpen && modpack) {
            console.log("ModpackInstallModal opened for:", modpack, "Timestamp:", TIMESTAMP);
            fetchVersions();
        } else {
            // Reset state on close
            setVersions([]);
            setSelectedVersion(null);
            setInstallStage('');
            setProgress(0);
            setIsInstalling(false);
            setError(null);
            setFilterGameVersion('');
            setFilterLoader('');
            setIsSuccess(false);
            isDownloadingRef.current = false;
        }
    }, [isOpen, modpack]);

    const fetchVersions = async () => {
        setIsLoadingVersions(true);
        setError(null);
        try {
            let data = [];
            if (modpack.source === 'modrinth') {
                const url = `https://api.modrinth.com/v2/project/${modpack.id}/version`;
                const responseText = await invoke('fetch_cors', { url }) as string;
                data = JSON.parse(responseText);
            } else if (modpack.source === 'porcos') {
                data = modpack.versions || [modpack];
            } else {
                // CurseForge
                const url = `https://api.curseforge.com/v1/mods/${modpack.id}/files`;
                const responseText = await invoke('fetch_cors', { 
                    url,
                    headers: {
                        'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC',
                        'Accept': 'application/json'
                    }
                }) as string;
                const parsed = JSON.parse(responseText);
                data = parsed.data;
            }

            setVersions(data);

            // Extract unique versions and loaders
            const gameVersions = new Set<string>();
            const loaders = new Set<string>();

            data.forEach((v: any) => {
                if (modpack.source === 'modrinth') {
                    v.game_versions.forEach((gv: string) => gameVersions.add(gv));
                    v.loaders.forEach((l: string) => loaders.add(l));
                } else if (modpack.source === 'porcos') {
                    if (v.minecraftVersion) gameVersions.add(v.minecraftVersion);
                    
                    if (v.forgeVersion) loaders.add('Forge');
                    else if (v.fabricVersion) loaders.add('Fabric');
                    else if (v.quiltVersion) loaders.add('Quilt');
                    else if (v.neoForgeVersion) loaders.add('NeoForge');
                    else if (v.modLoader) loaders.add(v.modLoader); // Use the explicit field from JSON
                    else loaders.add('Forge'); // Fallback
                } else {
                    v.gameVersions.forEach((gv: string) => {
                        // CurseForge mixes game versions and loaders in the same array sometimes, or uses numbers
                        // We need to be careful. Usually strings like "1.20.1", "Fabric", "Forge"
                        if (!isNaN(Number(gv[0]))) {
                            gameVersions.add(gv);
                        } else {
                            loaders.add(gv);
                        }
                    });
                }
            });

            // Sort versions descending (semver-ish)
            const sortedVersions = Array.from(gameVersions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            const sortedLoaders = Array.from(loaders).sort();

            setAvailableGameVersions(sortedVersions);
            setAvailableLoaders(sortedLoaders);

            // Default filters to latest
            if (sortedVersions.length > 0) setFilterGameVersion(sortedVersions[0]);
            if (sortedLoaders.length > 0) {
                // Prefer Fabric/Forge if available
                if (sortedLoaders.includes('Fabric')) setFilterLoader('Fabric');
                else if (sortedLoaders.includes('fabric')) setFilterLoader('fabric');
                else if (sortedLoaders.includes('Forge')) setFilterLoader('Forge');
                else if (sortedLoaders.includes('forge')) setFilterLoader('forge');
                else setFilterLoader(sortedLoaders[0]);
            }

        } catch (e) {
            console.error("Failed to fetch versions", e);
            setError("Error al cargar versiones.");
        } finally {
            setIsLoadingVersions(false);
        }
    };

    // Filtered versions
    const filteredVersions = versions.filter(v => {
        if (!filterGameVersion || !filterLoader) return true;
        
        if (modpack.source === 'modrinth') {
            return v.game_versions.includes(filterGameVersion) && v.loaders.includes(filterLoader);
        } else if (modpack.source === 'porcos') {
            // Simple filter
            return v.minecraftVersion === filterGameVersion;
        } else {
            return v.gameVersions.includes(filterGameVersion) && v.gameVersions.includes(filterLoader);
        }
    });

    // Auto-select first filtered version
    useEffect(() => {
        if (filteredVersions.length > 0) {
            setSelectedVersion(filteredVersions[0]);
        } else {
            setSelectedVersion(null);
        }
    }, [filterGameVersion, filterLoader, versions]);

    const handleInstall = async () => {
        if (!selectedVersion) return;
        setIsInstalling(true);
        setError(null);
        
        try {
            // 1. Prepare Paths
            const cacheDir = await appCacheDir();
            const tempDir = await join(cacheDir, 'temp_modpacks');
            // Ensure temp dir exists (extract_zip handles parent dirs, but good to be safe)

            if (modpack.source === 'porcos') {
                // Porcos Installation Logic
                
                // Determine the chain of versions to install (Sequential Install)
                const allVersions = modpack.versions || [modpack];
                // Sort ascending (v1.0 -> v1.1)
                const sortedVersions = [...allVersions].sort((a: any, b: any) => a.version.localeCompare(b.version, undefined, { numeric: true }));
                
                // Find index of selected version
                const targetIndex = sortedVersions.findIndex((v: any) => v.version === selectedVersion.version);
                
                // We install from index 0 up to targetIndex
                const versionsToInstall = sortedVersions.slice(0, targetIndex + 1);
                
                // 1. Create Instance FIRST (using target version metadata)
                setInstallStage('Creando instancia...');
                
                let iconPath = null;
                if (modpack.icon) {
                     const iconFileName = `icon_${modpack.id}.png`;
                     const tempIconPath = await join(tempDir, iconFileName);
                     await invoke('download_file', { url: modpack.icon, path: tempIconPath });
                     iconPath = tempIconPath;
                }
                
                let modLoader = 'forge';
                let modLoaderVersion = selectedVersion.forgeVersion;

                if (selectedVersion.fabricVersion) {
                    modLoader = 'fabric';
                    modLoaderVersion = selectedVersion.fabricVersion;
                } else if (selectedVersion.quiltVersion) {
                    modLoader = 'quilt';
                    modLoaderVersion = selectedVersion.quiltVersion;
                } else if (selectedVersion.neoForgeVersion) {
                    modLoader = 'neoforge';
                    modLoaderVersion = selectedVersion.neoForgeVersion;
                } else if (selectedVersion.modLoader) {
                    // Handle generic JSON format (e.g. "modLoader": "Fabric", "loaderVersion": "0.16.10")
                    modLoader = selectedVersion.modLoader.toLowerCase();
                    modLoaderVersion = selectedVersion.loaderVersion;
                }
                
                const newInstance = await invoke('create_instance', {
                    name: modpack.name,
                    version: selectedVersion.minecraftVersion,
                    modLoader,
                    modLoaderVersion,
                    imagePath: iconPath
                }) as any;

                // Update instance with complex version string for robustness
                if (modLoader && modLoader !== 'Vanilla') {
                    const complexVersion = `${selectedVersion.minecraftVersion} (${modLoader.charAt(0).toUpperCase() + modLoader.slice(1)} ${modLoaderVersion})`;
                    newInstance.versions = [complexVersion];
                    newInstance.selectedVersion = complexVersion;
                    newInstance.modLoader = modLoader;
                    newInstance.modLoaderVersion = modLoaderVersion;
                } else {
                    newInstance.versions = [selectedVersion.minecraftVersion];
                    newInstance.selectedVersion = selectedVersion.minecraftVersion;
                }
                
                // Save Porcos metadata
                const instancePath = await invoke('get_instance_path', { id: newInstance.id }) as string;

                // Handle Icon and Wallpaper
                let finalIcon = newInstance.icon;
                let finalBackground = newInstance.backgroundImage;

                // If we provided an icon to create_instance, it's currently set as backgroundImage
                if (newInstance.backgroundImage && iconPath) {
                    finalIcon = newInstance.backgroundImage;
                }

                if (selectedVersion.wallpaper) {
                    try {
                        const wallpaperUrl = selectedVersion.wallpaper;
                        // Create a unique filename based on URL hash or similar to avoid collisions but allow reuse
                        // Simple hash:
                        let hash = 0;
                        for (let i = 0; i < wallpaperUrl.length; i++) {
                            hash = ((hash << 5) - hash) + wallpaperUrl.charCodeAt(i);
                            hash |= 0;
                        }
                        const ext = wallpaperUrl.split('.').pop()?.split('?')[0] || 'jpg';
                        const wallpaperFilename = `wp_${Math.abs(hash)}.${ext}`;
                        
                        // Use .porcos/wallpapers
                        const home = await homeDir();
                        const wallpapersDir = await join(home, '.porcos', 'wallpapers');
                        
                        // Ensure dir exists (using invoke if available, or just try download)
                        // We'll assume download_file creates parent dirs or we might need a create_dir command
                        // If not, we might fail. Let's try to create it via a command if possible, or just rely on download_file
                        // Since we don't have create_dir exposed in context, we'll try to download.
                        
                        const wallpaperPath = await join(wallpapersDir, wallpaperFilename);
                        
                        // Check if exists to avoid redownload
                        const exists = await invoke('file_exists', { path: wallpaperPath }) as boolean;
                        if (!exists) {
                             await invoke('download_file', { url: wallpaperUrl, path: wallpaperPath });
                        }
                        
                        finalBackground = wallpaperPath; // Store absolute path
                    } catch (e) {
                        console.error("Failed to download wallpaper to central store", e);
                        // Fallback to instance folder if central fails
                        try {
                             const ext = selectedVersion.wallpaper.split('.').pop()?.split('?')[0] || 'jpg';
                             const wallpaperFilename = `wallpaper.${ext}`;
                             const wallpaperPath = await join(instancePath, wallpaperFilename);
                             await invoke('download_file', { url: selectedVersion.wallpaper, path: wallpaperPath });
                             finalBackground = wallpaperFilename;
                        } catch (e2) {
                             finalBackground = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
                        }
                    }
                } else {
                    // Random default if no wallpaper provided
                    finalBackground = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
                }

                await invoke('update_instance', {
                    id: newInstance.id,
                    icon: finalIcon,
                    backgroundImage: finalBackground
                });
                
                newInstance.icon = finalIcon;
                newInstance.backgroundImage = finalBackground;

                await invoke('write_text_file', {
                    path: await join(instancePath, 'porcos.json'),
                    content: JSON.stringify({
                        id: modpack.id,
                        version: selectedVersion.version,
                        updateUrl: "https://raw.githubusercontent.com/yalerooo/myApis/refs/heads/main/porcosLauncher/modpacks.json"
                    })
                });

                // Create instance_info.json for robustness
                try {
                    const infoPath = await join(instancePath, 'instance_info.json');
                    const info = {
                        name: newInstance.name,
                        minecraftVersion: selectedVersion.minecraftVersion,
                        modLoader: modLoader,
                        modLoaderVersion: modLoaderVersion,
                        created: new Date().toISOString(),
                        versions: newInstance.versions,
                        selectedVersion: newInstance.selectedVersion
                    };
                    await invoke('write_text_file', { 
                        path: infoPath, 
                        content: JSON.stringify(info, null, 4) 
                    });
                } catch (e) {
                    console.error("Failed to create instance info file", e);
                }
                
                addInstance(newInstance);

                // 2. Install Versions Sequentially
                for (let vIndex = 0; vIndex < versionsToInstall.length; vIndex++) {
                    const ver = versionsToInstall[vIndex];
                    setInstallStage(`Instalando versión ${ver.version} (${vIndex + 1}/${versionsToInstall.length})...`);
                    
                    // Download
                    const downloadUrls = [];
                    if (ver.downloadUrl) downloadUrls.push(ver.downloadUrl);
                    if (ver.downloadUrl2) downloadUrls.push(ver.downloadUrl2);
                    if (ver.downloadUrl3) downloadUrls.push(ver.downloadUrl3);
                    if (ver.downloadUrl4) downloadUrls.push(ver.downloadUrl4);
                    if (ver.downloadUrl5) downloadUrls.push(ver.downloadUrl5);
                    
                    const zipPaths = [];
                    for (let i = 0; i < downloadUrls.length; i++) {
                        const url = downloadUrls[i];
                        const fileName = url.split('/').pop() || `install_${ver.version}_${i}.zip`;
                        const filePath = await join(tempDir, fileName);
                        
                        setInstallStage(`Descargando parte ${i + 1}/${downloadUrls.length} de versión ${ver.version}...`);
                        isDownloadingRef.current = true;
                        setProgress(0);
                        await invoke('download_file', { url, path: filePath });
                        isDownloadingRef.current = false;
                        
                        zipPaths.push(filePath);
                    }
                    
                    // Extract
                    for (const zipPath of zipPaths) {
                        setInstallStage(`Extrayendo archivos...`);
                        // extract_zip now handles .rar via unrar crate
                        await invoke('extract_zip', { zipPath, targetDir: instancePath });
                    }
                    

                    // Delete Files
                    if (ver.filesToDelete && Array.isArray(ver.filesToDelete)) {
                        for (const fileToDelete of ver.filesToDelete) {
                            const fullPath = await join(instancePath, fileToDelete);
                            if (await invoke('file_exists', { path: fullPath })) {
                                await invoke('delete_file', { path: fullPath });
                            }
                        }
                    }
                }
                
                setInstallStage('Finalizando...');
                setProgress(100);
                setTimeout(() => {
                    setIsSuccess(true);
                    setIsInstalling(false);
                }, 1000);
                
                return;
            }
            
            let downloadUrl = '';
            let fileName = '';

            if (modpack.source === 'modrinth') {
                const file = selectedVersion.files.find((f: any) => f.primary) || selectedVersion.files[0];
                downloadUrl = file.url;
                fileName = file.filename;
            } else {
                downloadUrl = selectedVersion.downloadUrl;
                fileName = selectedVersion.fileName;
            }

            const zipPath = await join(tempDir, fileName);
            const extractPath = await join(tempDir, `${modpack.id}_${Date.now()}`);

            // 2. Download
            setInstallStage('Descargando modpack...');
            isDownloadingRef.current = true;
            setProgress(0);
            await invoke('download_file', { url: downloadUrl, path: zipPath });
            isDownloadingRef.current = false;

            // 3. Extract
            setInstallStage('Extrayendo archivos...');
            setProgress(30);
            await invoke('extract_zip', { zipPath, targetDir: extractPath });

            // 4. Parse Manifest & Create Instance
            setInstallStage('Analizando manifiesto...');
            setProgress(40);
            
            let instanceName = modpack.name;
            let mcVersion = '';
            let modLoader = '';
            let modLoaderVersion = '';
            let modList: { url?: string, path?: string, projectID?: number, fileID?: number }[] = [];

            if (modpack.source === 'modrinth') {
                // Read modrinth.index.json
                const indexJson = await invoke('read_text_file', { path: await join(extractPath, 'modrinth.index.json') }) as string;
                const index = JSON.parse(indexJson);
                
                instanceName = index.name || modpack.name;
                mcVersion = index.dependencies.minecraft;
                modLoader = Object.keys(index.dependencies).find(k => k.includes('loader'))?.replace('-loader', '') || 'fabric';
                modLoaderVersion = index.dependencies[`${modLoader}-loader`];
                
                modList = index.files.map((f: any) => ({
                    url: f.downloads[0],
                    path: f.path
                }));
                
                // Modrinth overrides are usually in "overrides" folder relative to index
                // overridesDir = await join(extractPath, 'overrides');

            } else {
                // Read manifest.json (CurseForge)
                const manifestJson = await invoke('read_text_file', { path: await join(extractPath, 'manifest.json') }) as string;
                const manifest = JSON.parse(manifestJson);
                
                instanceName = manifest.name || modpack.name;
                mcVersion = manifest.minecraft.version;
                const loaderObj = manifest.minecraft.modLoaders.find((l: any) => l.primary);
                
                if (loaderObj) {
                    const parts = loaderObj.id.split('-');
                    modLoader = parts[0];
                    modLoaderVersion = parts.slice(1).join('-');
                } else {
                    modLoader = 'forge';
                }
                
                // For CF, we have projectID and fileID. We need to fetch URLs.
                // This is the hard part. We'll store them to process later.
                modList = manifest.files.map((f: any) => ({
                    projectID: f.projectID,
                    fileID: f.fileID
                }));

                // overridesDir = await join(extractPath, manifest.overrides);
            }

            // Download Icon
            let iconPath = null;
            try {
                // Try to get icon from modpack object (Modrinth: icon_url, CF: logo.url)
                // In Mods.tsx we normalized this to 'icon'
                const iconUrl = modpack.icon || modpack.original?.icon_url || modpack.original?.logo?.url;
                
                console.log("Attempting to download icon from:", iconUrl);

                if (iconUrl) {
                    const iconFileName = `icon_${modpack.id}_${Date.now()}.png`;
                    const tempIconPath = await join(tempDir, iconFileName);
                    console.log("Downloading icon to:", tempIconPath);
                    
                    await invoke('download_file', { url: iconUrl, path: tempIconPath });
                    iconPath = tempIconPath;
                    console.log("Icon downloaded successfully");
                } else {
                    console.warn("No icon URL found for modpack");
                }
            } catch (e) {
                console.error("Failed to download icon:", e);
            }

            // Create Instance
            setInstallStage('Creando instancia...');
            console.log("Creating instance with iconPath:", iconPath);
            
            const newInstance = await invoke('create_instance', {
                name: instanceName,
                version: mcVersion,
                modLoader: modLoader,
                modLoaderVersion: modLoaderVersion,
                imagePath: iconPath
            }) as any;

            // Update instance with complex version string for robustness
            if (modLoader && modLoader !== 'Vanilla') {
                // Ensure capitalization for display
                const displayLoader = modLoader.charAt(0).toUpperCase() + modLoader.slice(1);
                const complexVersion = `${mcVersion} (${displayLoader} ${modLoaderVersion})`;
                newInstance.versions = [complexVersion];
                newInstance.selectedVersion = complexVersion;
                newInstance.modLoader = modLoader;
                newInstance.modLoaderVersion = modLoaderVersion;
            } else {
                newInstance.versions = [mcVersion];
                newInstance.selectedVersion = mcVersion;
            }

            // Create instance_info.json for robustness
            try {
                const instancePath = await invoke('get_instance_path', { id: newInstance.id }) as string;
                const infoPath = await join(instancePath, 'instance_info.json');
                const info = {
                    name: newInstance.name,
                    minecraftVersion: mcVersion,
                    modLoader: modLoader,
                    modLoaderVersion: modLoaderVersion,
                    created: new Date().toISOString(),
                    versions: newInstance.versions,
                    selectedVersion: newInstance.selectedVersion
                };
                await invoke('write_text_file', { 
                    path: infoPath, 
                    content: JSON.stringify(info, null, 4) 
                });
            } catch (e) {
                console.error("Failed to create instance info file", e);
            }

            // Set icon same as background if image was uploaded
            // Note: newInstance comes from Rust with camelCase keys due to serde rename_all="camelCase"
            // So we check newInstance.backgroundImage
            if (newInstance.backgroundImage) {
                // The backend saved the icon as 'background.png' (or similar) and set backgroundImage to it.
                // We want to use this file as the ICON, but use a default wallpaper for the BACKGROUND.
                
                const iconFilename = newInstance.backgroundImage;
                newInstance.icon = iconFilename;

                // Pick a random default background
                const randomBg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
                newInstance.backgroundImage = randomBg;

                await invoke('update_instance', {
                    id: newInstance.id,
                    icon: newInstance.icon,
                    backgroundImage: newInstance.backgroundImage
                });
            }
            
            addInstance(newInstance);
            const instancePath = await invoke('get_instance_path', { id: newInstance.id }) as string;

            // 5. Install Mods
            setInstallStage(`Instalando ${modList.length} mods...`);
            
            const installedModsTracker: any[] = [];

            // Process mods in chunks to avoid rate limits
            const chunkSize = 5;
            for (let i = 0; i < modList.length; i += chunkSize) {
                const chunk = modList.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (mod) => {
                    try {
                        let url = mod.url;
                        let destPath = '';
                        let fileName = '';

                        if (modpack.source === 'modrinth') {
                            destPath = await join(instancePath, mod.path!);
                            fileName = mod.path!.split('/').pop() || '';
                            
                            // Try to extract Project ID from URL for tracking
                            if (url) {
                                const match = url.match(/data\/([^\/]+)\/versions/);
                                if (match && match[1]) {
                                    installedModsTracker.push({
                                        id: match[1],
                                        source: 'modrinth',
                                        file: fileName
                                    });
                                }
                            }
                        } else {
                            // CurseForge: Fetch URL first
                            if (!url) {
                                const cfUrl = `https://api.curseforge.com/v1/mods/${mod.projectID!}/files/${mod.fileID!}`;
                                const resp = await invoke('fetch_cors', { 
                                    url: cfUrl,
                                    headers: { 'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC' }
                                }) as string;
                                const fileData = JSON.parse(resp).data;
                                url = fileData.downloadUrl;
                                fileName = fileData.fileName;
                                destPath = await join(instancePath, 'mods', fileName);

                                installedModsTracker.push({
                                    id: mod.projectID!.toString(),
                                    source: 'curseforge',
                                    file: fileName
                                });
                            }
                        }

                        if (url && destPath) {
                            await invoke('download_file', { url, path: destPath });
                        }
                    } catch (e) {
                        console.error("Failed to install mod", mod, e);
                        // Continue even if one fails?
                    }
                }));
                
                const currentProgress = 50 + Math.round(((i + chunkSize) / modList.length) * 40);
                setProgress(Math.min(currentProgress, 90));
            }

            // Save mods.json for the Mods page to recognize installed mods
            try {
                const modsJsonPath = await join(instancePath, 'mods.json');
                console.log("Saving mods.json with", installedModsTracker.length, "mods");
                await invoke('write_text_file', { 
                    path: modsJsonPath, 
                    content: JSON.stringify({ mods: installedModsTracker }, null, 2) 
                });
            } catch (e) {
                console.error("Failed to save mods.json", e);
            }

            // 6. Copy Overrides
            // Since we don't have a "copy_dir" command exposed yet, we might skip this or implement it.
            // Ideally we need a recursive copy command in Rust.
            // For now, let's assume mods are the most important part.
            // TODO: Implement copy_dir_recursive in Rust.
            
            setInstallStage('Finalizando...');
            setProgress(100);
            
            setTimeout(() => {
                setIsSuccess(true);
                setIsInstalling(false);
            }, 1000);

        } catch (e: any) {
            console.error("Installation failed", e);
            setError(e.message || "Error desconocido durante la instalación");
            setIsInstalling(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className={styles.modal}
            >
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h3 className={styles.title}>
                            <Package size={20} className={styles.titleIcon} />
                            Instalar {modpack?.name}
                        </h3>
                        <p className={styles.subtitle}>Selecciona una versión para instalar</p>
                    </div>
                    {!isInstalling && (
                        <button onClick={onClose} className={styles.closeButton}>
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {isSuccess ? (
                        <div className={styles.successContainer}>
                            <h3 className={styles.successTitle}>¡Instalado Correctamente!</h3>
                            <p className={styles.successSubtitle}>
                                La instancia <strong>{modpack?.name}</strong> se ha creado con éxito.
                            </p>
                            <button onClick={onClose} className={styles.successButton}>
                                Cerrar
                            </button>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className={styles.errorBox}>
                                    <AlertCircle size={20} />
                                    <span>{error}</span>
                                </div>
                            )}

                            {isInstalling ? (
                                <div className={styles.installingContainer}>
                                    <div className={styles.progressCircle}>
                                        <svg className="w-full h-full" viewBox="0 0 100 100">
                                            <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="8" />
                                            <motion.circle 
                                                cx="50" cy="50" r="45" fill="none" stroke="#ffbfba" strokeWidth="8"
                                                strokeDasharray="283"
                                                strokeDashoffset={283 - (283 * progress) / 100}
                                                strokeLinecap="round"
                                                className="transition-all duration-300"
                                            />
                                        </svg>
                                        <div className={styles.progressText}>
                                            <span>{progress}%</span>
                                        </div>
                                    </div>
                                    <div className={styles.installStage}>
                                        <h4 className={styles.stageTitle}>{installStage}</h4>
                                        <p className={styles.stageSubtitle}>Por favor no cierres el launcher</p>
                                    </div>
                                </div>
                            ) : isLoadingVersions ? (
                                <div className={styles.loadingContainer}>
                                    <Loader2 className={styles.spinner} size={32} />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Filters */}
                                    <div className={styles.filters}>
                                        <div className={styles.filterGroup}>
                                            <label className={styles.filterLabel}>Versión de Minecraft</label>
                                            <select 
                                                value={filterGameVersion}
                                                onChange={(e) => setFilterGameVersion(e.target.value)}
                                                className={styles.filterSelect}
                                            >
                                                {availableGameVersions.map(v => (
                                                    <option key={v} value={v}>{v}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={styles.filterGroup}>
                                            <label className={styles.filterLabel}>Modloader</label>
                                            <select 
                                                value={filterLoader}
                                                onChange={(e) => setFilterLoader(e.target.value)}
                                                className={styles.filterSelect}
                                            >
                                                {availableLoaders.map(l => (
                                                    <option key={l} value={l}>{l}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={styles.versionList}>
                                        {filteredVersions.length === 0 ? (
                                            <div className={styles.emptyState}>
                                                No hay versiones compatibles con los filtros seleccionados.
                                            </div>
                                        ) : (
                                            filteredVersions.map((v: any) => {
                                                const name = modpack.source === 'modrinth' ? v.name : (modpack.source === 'porcos' ? v.version : v.displayName);
                                                const gameVersions = modpack.source === 'modrinth' ? v.game_versions.join(', ') : (modpack.source === 'porcos' ? v.minecraftVersion : v.gameVersions.join(', '));
                                                const isSelected = selectedVersion === v;

                                                return (
                                                    <div 
                                                        key={modpack.source === 'modrinth' ? v.id : (modpack.source === 'porcos' ? v.version : v.id)}
                                                        onClick={() => setSelectedVersion(v)}
                                                        className={cn(
                                                            styles.versionCard,
                                                            isSelected && styles.versionCardSelected
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <div>
                                                                <h4 className={styles.versionName}>{name}</h4>
                                                                <p className={styles.versionMeta}>
                                                                    Minecraft {gameVersions}
                                                                </p>
                                                            </div>
                                                            {isSelected && <Check className={styles.checkIcon} size={20} />}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!isInstalling && !isSuccess && (
                    <div className={styles.footer}>
                        <button 
                            onClick={onClose}
                            className={styles.cancelButton}
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleInstall}
                            disabled={!selectedVersion}
                            className={styles.installButton}
                        >
                            <Download size={18} />
                            Instalar
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default ModpackInstallModal;
