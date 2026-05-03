import React, { useState, useEffect, useRef } from 'react';
import { Box, Settings, Plus, Check, Play, Gamepad2, ChevronDown, Package, Download, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useLauncherStore, Instance, getCachedImages } from '@/stores/launcherStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { parseVersion } from '@/lib/versionParser';


import styles from './Home.module.css';
import CreateInstanceModal from '@/components/CreateInstanceModal';
import InstanceSettings from '@/components/InstanceSettings';

const InstanceIcon = React.memo(({ instance, isActive }: { instance: Instance, isActive: boolean }) => {
    const cached = getCachedImages(instance.id);
    const [src, setSrc] = useState(cached.icon || "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");

    // Sync with cache when instance changes (NOT when global imageCacheVersion changes)
    useEffect(() => {
        const cached = getCachedImages(instance.id);
        if (cached.icon) setSrc(cached.icon);
    }, [instance.id, instance.icon, instance.backgroundImage]);

    return (
        <div className={cn(
            "w-12 h-12 rounded-2xl overflow-hidden transition-all duration-300 relative shadow-lg",
            isActive
                ? "ring-0 opacity-100 scale-105"
                : "opacity-40 hover:opacity-100 grayscale hover:grayscale-0 hover:scale-110"
        )}>
            <img
                src={src}
                alt={instance.name}
                className="w-full h-full object-cover select-none"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
            />
        </div>
    );
});



const Home: React.FC = () => {
    const { t } = useI18n();

    // Individual selectors to prevent unnecessary re-renders
    const instances = useLauncherStore(state => state.instances);
    const selectedInstance = useLauncherStore(state => state.selectedInstance);
    const isLaunching = useLauncherStore(state => state.isLaunching);
    const memoryMin = useLauncherStore(state => state.memoryMin);
    const memoryMax = useLauncherStore(state => state.memoryMax);
    const launchStage = useLauncherStore(state => state.launchStage);
    const launchProgress = useLauncherStore(state => state.launchProgress);
    const versions = useLauncherStore(state => state.versions);
    const imageCacheVersion = useLauncherStore(state => state.imageCacheVersion);

    // Setters can still be destructured together (they don't cause re-renders)
    const { setSelectedInstance, updateInstance, setIsLaunching, setLaunchStage, setLaunchProgress, setInstances, setVersions, setLaunchStartTime, addLog } = useLauncherStore();

    const { user } = useAuthStore();
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [isMainVersionDropdownOpen, setIsMainVersionDropdownOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    
    // Create Instance State
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Background Image State for Active Instance
    const [activeBgSrc, setActiveBgSrc] = useState<string>("");
    
    // Preloaded icon for settings modal
    const [preloadedSettingsIcon, setPreloadedSettingsIcon] = useState<string>("");
    
    const maxProgressRef = useRef(0);

    // Default to first if none selected
    const activeInstance = selectedInstance || instances[0];
    
    // Sync preloaded icon from cache when active instance changes or cache updates
    useEffect(() => {
        if (activeInstance) {
            const cached = getCachedImages(activeInstance.id);
            if (cached.icon) setPreloadedSettingsIcon(cached.icon);
        }
    }, [activeInstance?.id, activeInstance?.icon, activeInstance?.backgroundImage, imageCacheVersion]);

    // Sync background from cache
    useEffect(() => {
        if (!activeInstance) {
            setActiveBgSrc("");
            return;
        }
        
        const cached = getCachedImages(activeInstance.id);
        if (cached.background) {
            setActiveBgSrc(cached.background);
        }
    }, [activeInstance?.id, activeInstance?.backgroundImage, imageCacheVersion]);

    // Porcos Metadata State
    const [porcosMetadata, setPorcosMetadata] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<any>(null);


    useEffect(() => {
        const checkPorcos = async () => {
            setPorcosMetadata(null);
            setUpdateAvailable(null);
            
            if (!activeInstance) return;

            try {
                const { invoke } = await import("@tauri-apps/api/core");
                const { join } = await import("@tauri-apps/api/path");
                const instancePath = await invoke("get_instance_path", { id: activeInstance.id }) as string;
                const porcosJsonPath = await join(instancePath, 'porcos.json');
                
                console.log(`[Home] Checking for porcos.json at: ${porcosJsonPath}`);

                const exists = await invoke('file_exists', { path: porcosJsonPath }) as boolean;
                if (exists) {
                    const content = await invoke('read_text_file', { path: porcosJsonPath }) as string;
                    console.log(`[Home] porcos.json content:`, content);
                    const data = JSON.parse(content);
                    setPorcosMetadata(data);
                    
                    // Check for updates
                    if (data.updateUrl) {
                        try {
                            const responseText = await invoke('fetch_cors', { url: data.updateUrl }) as string;
                            const remoteData = JSON.parse(responseText);
                            
                            if (remoteData.modpacks) {
                                const versions = remoteData.modpacks.filter((mp: any) => mp.id === data.id);
                                // Sort descending to find latest
                                versions.sort((a: any, b: any) => b.version.localeCompare(a.version, undefined, { numeric: true }));
                                
                                if (versions.length > 0) {
                                    const latest = versions[0];
                                    // Compare versions
                                    if (latest.version.localeCompare(data.version, undefined, { numeric: true }) > 0) {
                                        setUpdateAvailable(latest);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Failed to check for updates", e);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load Porcos metadata", e);
            }
        };
        
        checkPorcos();
    }, [activeInstance]);

    const handleUpdateInstance = async () => {
        if (!activeInstance || !porcosMetadata || !updateAvailable) return;
        
        setLaunchStage(t('initializingUpdate'));
        setLaunchProgress(0);
        setIsLaunching(true); // Reuse launching UI for progress

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join, appCacheDir, homeDir } = await import("@tauri-apps/api/path");
            const instancePath = await invoke("get_instance_path", { id: activeInstance.id }) as string;
            const porcosJsonPath = await join(instancePath, 'porcos.json');
            
            const responseText = await invoke('fetch_cors', { url: porcosMetadata.updateUrl }) as string;
            const data = JSON.parse(responseText);
            
            if (data.modpacks) {
                const versions = data.modpacks.filter((mp: any) => mp.id === porcosMetadata.id);
                // Sort ascending (oldest to newest)
                versions.sort((a: any, b: any) => a.version.localeCompare(b.version, undefined, { numeric: true }));
                
                const currentIndex = versions.findIndex((v: any) => v.version === porcosMetadata.version);
                
                if (currentIndex !== -1 && currentIndex < versions.length - 1) {
                    const updates = versions.slice(currentIndex + 1);
                    const cacheDir = await appCacheDir();
                    const tempDir = await join(cacheDir, 'temp_updates');
                    
                    let totalSteps = 0;
                    // Calculate total steps for progress bar (download + extract for each update)
                    updates.forEach((u: any) => {
                        let urls = 0;
                        if (u.downloadUrl) urls++;
                        
                        let urlIndex = 2;
                        while (u[`downloadUrl${urlIndex}`]) {
                            urls++;
                            urlIndex++;
                        }
                        totalSteps += urls + 1; // +1 for extraction phase
                    });
                    
                    let currentStep = 0;

                    for (const update of updates) {
                        setLaunchStage(t('updatingToVersion', { version: update.version }));
                        
                        // Download
                        const downloadUrls = [];
                        if (update.downloadUrl) downloadUrls.push(update.downloadUrl);
                        
                        let urlIndex = 2;
                        while (update[`downloadUrl${urlIndex}`]) {
                            downloadUrls.push(update[`downloadUrl${urlIndex}`]);
                            urlIndex++;
                        }
                        
                        const zipPaths = [];
                        setLaunchStage(t('downloadingVersionParts', { version: update.version, parts: downloadUrls.length }));
                        
                        let completedBatch = 0;
                        const downloadPromises = downloadUrls.map(async (url, i) => {
                            const fileName = url.split('/').pop() || `update_${update.version}_${i}.zip`;
                            const filePath = await join(tempDir, fileName);
                            await invoke('download_file', { url, path: filePath });
                            
                            completedBatch++;
                            setLaunchProgress(((currentStep + completedBatch) / totalSteps) * 100);
                            setLaunchStage(t('downloadingProgress', { version: update.version, current: completedBatch, total: downloadUrls.length }));
                            
                            return filePath;
                        });
                        
                        const paths = await Promise.all(downloadPromises);
                        zipPaths.push(...paths);
                        
                        currentStep += downloadUrls.length;
                        // setLaunchProgress((currentStep / totalSteps) * 100); // Already updated in loop
                        
                        // Extract
                        setLaunchStage(t('installingVersion', { version: update.version }));
                        const skipFiles = [
                            "servers.dat"
                        ];
                        for (const zipPath of zipPaths) {
                            await invoke('extract_zip', { 
                                zipPath, 
                                targetDir: instancePath,
                                skipFiles: skipFiles
                            });
                        }
                        currentStep++;
                        setLaunchProgress((currentStep / totalSteps) * 100);
                        
                        // Delete Files
                        if (update.filesToDelete && Array.isArray(update.filesToDelete)) {
                            for (const fileToDelete of update.filesToDelete) {
                                const fullPath = await join(instancePath, fileToDelete);
                                if (await invoke('file_exists', { path: fullPath })) {
                                    await invoke('delete_file', { path: fullPath });
                                }
                            }
                        }

                        // Update Wallpaper if present
                        if (update.wallpaper) {
                            try {
                                setLaunchStage(t('updatingWallpaper'));
                                const wallpaperUrl = update.wallpaper;
                                
                                // Generate hash for filename (same as install logic)
                                let hash = 0;
                                for (let i = 0; i < wallpaperUrl.length; i++) {
                                    hash = ((hash << 5) - hash) + wallpaperUrl.charCodeAt(i);
                                    hash |= 0;
                                }
                                const ext = wallpaperUrl.split('.').pop()?.split('?')[0] || 'jpg';
                                const wallpaperFilename = `wp_${Math.abs(hash)}.${ext}`;
                                
                                // Get central wallpapers directory
                                const home = await homeDir();
                                const wallpapersDir = await join(home, '.porcos', 'wallpapers');
                                const wallpaperPath = await join(wallpapersDir, wallpaperFilename);
                                
                                // Check if exists, if not download
                                const exists = await invoke('file_exists', { path: wallpaperPath }) as boolean;
                                if (!exists) {
                                    await invoke('download_file', { url: wallpaperUrl, path: wallpaperPath });
                                }
                                
                                // Update instance config with ABSOLUTE path
                                await invoke('update_instance', {
                                    id: activeInstance.id,
                                    backgroundImage: wallpaperPath
                                });
                                
                                // Update local store
                                updateInstance(activeInstance.id, { backgroundImage: wallpaperPath });
                                
                                // Update active background immediately
                                const data = await invoke("read_binary_file", { path: wallpaperPath }) as number[];
                                const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                                const url = URL.createObjectURL(blob);
                                setActiveBgSrc(url);

                            } catch (e) {
                                console.error("Failed to update wallpaper", e);
                            }
                        }

                        // Update Icon if present
                        if (update.icon) {
                            try {
                                setLaunchStage(t('updatingIcon'));
                                const iconUrl = update.icon;
                                
                                // Generate hash for filename
                                let hash = 0;
                                for (let i = 0; i < iconUrl.length; i++) {
                                    hash = ((hash << 5) - hash) + iconUrl.charCodeAt(i);
                                    hash |= 0;
                                }
                                const ext = iconUrl.split('.').pop()?.split('?')[0] || 'png';
                                const iconFilename = `icon_${Math.abs(hash)}.${ext}`;
                                
                                // Get central icons directory
                                const home = await homeDir();
                                const iconsDir = await join(home, '.porcos', 'icons');
                                const iconPath = await join(iconsDir, iconFilename);
                                
                                // Check if exists, if not download
                                const exists = await invoke('file_exists', { path: iconPath }) as boolean;
                                if (!exists) {
                                    await invoke('download_file', { url: iconUrl, path: iconPath });
                                }
                                
                                // Update instance config with ABSOLUTE path
                                await invoke('update_instance', {
                                    id: activeInstance.id,
                                    icon: iconPath
                                });
                                
                                // Update local store
                                updateInstance(activeInstance.id, { icon: iconPath });

                            } catch (e) {
                                console.error("Failed to update icon", e);
                            }
                        }
                        
                        // Update porcos.json
                        const newMetadata = { ...porcosMetadata, version: update.version };
                        await invoke('write_text_file', { 
                            path: porcosJsonPath, 
                            content: JSON.stringify(newMetadata) 
                        });
                        
                        // Update local state to reflect new version immediately
                        setPorcosMetadata(newMetadata);
                        // Update the reference for the next iteration if needed (though we use newMetadata for writing)
                        porcosMetadata.version = update.version; // Keep mutation for loop continuity or use a local variable outside loop
                    }
                    
                    setLaunchStage(t('updateCompleted'));
                    setLaunchProgress(100);
                    setUpdateAvailable(null); // No more updates
                    setTimeout(() => {
                        setIsLaunching(false);
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Update failed", e);
            setLaunchStage(t('updateError'));
            setTimeout(() => {
                setIsLaunching(false);
            }, 2000);
        }
    };















    const handleVersionChange = async (version: string) => {
        if (!activeInstance) return;

        // Check if it's a complex version
        const parsed = parseVersion(version);
        let newModLoader = activeInstance.modLoader;
        let newModLoaderVersion = activeInstance.modLoaderVersion;

        if (parsed.loader) {
            // It's a complex version, update global state to match
            newModLoader = parsed.loader;
            newModLoaderVersion = parsed.loaderVersion;
        } else {
            // It's a simple version.
            
            // Check if current instance version is complex or simple, and extract MC version
            const currentVersionString = activeInstance.selectedVersion || activeInstance.version;

            // FIX: If we are switching to a "naked" version string, we should assume it is Vanilla UNLESS it is the exact same version string we are currently on (which shouldn't happen in a change handler usually, but good for safety).
            // The previous logic tried to be smart and preserve the modloader if the MC version matched, but this caused issues where switching to a Vanilla version of the same MC version (if added) would keep the modloader.
            // NOW: We rely on the fact that modded versions SHOULD have the suffix. If they don't, they are Vanilla.
            // EXCEPTION: If the user hasn't "upgraded" their version strings yet (legacy), we might want to be careful.
            // But with the new handleAddVersion logic, we are upgrading strings.
            
            if (version === currentVersionString) {
                 // Same version string, keep state
                 newModLoader = activeInstance.modLoader;
                 newModLoaderVersion = activeInstance.modLoaderVersion;
            } else {
                 // Different version string, and it's naked -> Vanilla
                 newModLoader = undefined;
                 newModLoaderVersion = undefined;
            }
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("update_instance", {
                id: activeInstance.id,
                selectedVersion: version, // Note: Backend might not store selectedVersion, but we send it anyway if we add support later
                modLoader: newModLoader || null,
                modLoaderVersion: newModLoaderVersion || null
            });
        } catch (e) {
            console.error("Failed to update instance version change", e);
        }

        updateInstance(activeInstance.id, { 
            selectedVersion: version,
            modLoader: newModLoader,
            modLoaderVersion: newModLoaderVersion
        });
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const { invoke } = await import("@tauri-apps/api/core");

                // Load Versions
                if (versions.length === 0) {
                    const versionList = await invoke("get_available_versions");
                    setVersions(versionList as any[]);
                }

                // Load Instances
                const backendInstances = await invoke("get_instances") as Instance[];
                
                // Map of local instances for quick lookup
                const localMap = new Map(instances.map(i => [i.id, i]));

                // MIGRATION: Fix legacy instances where modded versions are stored as simple strings
                for (const inst of backendInstances) {
                    if (inst.modLoader && inst.versions) {
                        const localInst = localMap.get(inst.id);
                        // Use local selectedVersion if available, else backend version
                        const activeVer = localInst?.selectedVersion || inst.version;
                        
                        // If active version is simple (no parens) but we have a modloader
                        if (activeVer && !activeVer.includes('(')) {
                             const complexVer = `${activeVer} (${inst.modLoader} ${inst.modLoaderVersion || ''})`.trim().replace(/\s+\)/, ')');
                             
                             // Check if we need to update versions list
                             if (inst.versions.includes(activeVer) && !inst.versions.includes(complexVer)) {
                                 console.log(`[Migration] Upgrading instance ${inst.name} version to ${complexVer}`);
                                 const newVersions = inst.versions.map(v => v === activeVer ? complexVer : v);
                                 
                                 // Update in memory object so the merge below uses the new list
                                 inst.versions = newVersions;
                                 
                                 // Persist to backend
                                 await invoke("update_instance", {
                                     id: inst.id,
                                     versions: newVersions
                                 });
                             }
                        }
                    }
                }
                
                // Merge with existing order to preserve drag-and-drop changes
                const backendMap = new Map(backendInstances.map(i => [i.id, i]));
                const newOrderedInstances: Instance[] = [];
                
                // 1. Keep existing instances in order
                instances.forEach(localInst => {
                    if (backendMap.has(localInst.id)) {
                        const fresh = backendMap.get(localInst.id)!;
                        
                        // Resolve selectedVersion
                        let selVer = localInst.selectedVersion || fresh.version;
                        
                        // If selectedVersion was the simple string, and we migrated it in 'fresh', update it
                        if (fresh.modLoader && selVer && !selVer.includes('(')) {
                             const potentialComplex = `${selVer} (${fresh.modLoader} ${fresh.modLoaderVersion || ''})`.trim().replace(/\s+\)/, ')');
                             if (fresh.versions?.includes(potentialComplex)) {
                                 selVer = potentialComplex;
                             }
                        }

                        newOrderedInstances.push({
                            ...fresh,
                            selectedVersion: selVer
                        });
                        backendMap.delete(localInst.id);
                    }
                });
                
                // 2. Add new instances
                backendMap.forEach(inst => {
                     // New instance from backend
                     let selVer = inst.version;
                     if (inst.modLoader && !selVer.includes('(')) {
                         const complex = `${selVer} (${inst.modLoader} ${inst.modLoaderVersion || ''})`.trim().replace(/\s+\)/, ')');
                         if (inst.versions?.includes(complex)) {
                             selVer = complex;
                         }
                     }

                    newOrderedInstances.push({
                        ...inst,
                        selectedVersion: selVer
                    });
                });

                setInstances(newOrderedInstances);

                // Sync selectedInstance if it exists and was migrated
                // We use getState() to ensure we check the CURRENTLY selected instance, not the one from closure
                const currentSelected = useLauncherStore.getState().selectedInstance;
                if (currentSelected) {
                    const updated = newOrderedInstances.find(i => i.id === currentSelected.id);
                    if (updated && (
                        updated.selectedVersion !== currentSelected.selectedVersion || 
                        JSON.stringify(updated.versions) !== JSON.stringify(currentSelected.versions)
                    )) {
                        console.log("[Home] Updating stale selectedInstance with migrated data");
                        setSelectedInstance(updated);
                    }
                } else if (newOrderedInstances.length > 0) {
                    // Auto-select first instance if none selected
                    console.log("[Home] Auto-selecting first instance");
                    setSelectedInstance(newOrderedInstances[0]);
                }

            } catch (error) {
                console.error("Failed to load data:", error);
            }
        };
        loadData();
    }, []); // Run once on mount

    useEffect(() => {
        const unlisteners: (() => void)[] = [];

        const setupListeners = async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                
                const unlistenLaunch = await listen('launch-progress', (event: any) => {
                    const { stage, progress } = event.payload;
                    setLaunchStage(stage);
                    
                    // Never let progress go backwards
                    if (progress >= maxProgressRef.current) {
                        maxProgressRef.current = progress;
                        setLaunchProgress(progress);
                    }
                    
                    // If progress is 100% and stage indicates game started, we can hide the bar after a delay
                    if (progress === 100 && (stage.includes("Juego iniciado") || stage.includes("Game"))) {
                        setTimeout(() => {
                            setIsLaunching(false);
                            maxProgressRef.current = 0;
                        }, 2000);
                    }
                });
                unlisteners.push(unlistenLaunch);

                const unlistenDownload = await listen('download-progress', (event: any) => {
                    const { id, progress } = event.payload;
                    if (id && id.startsWith('java-download-')) {
                        const javaVer = id.replace('java-download-', '');
                        setLaunchProgress(progress);
                        setLaunchStage(t('downloadingJava', { version: javaVer, progress: Math.round(progress) }));
                    }
                });
                unlisteners.push(unlistenDownload);

            } catch (error) {
                console.error("Failed to setup event listeners:", error);
            }
        };

        setupListeners();

        return () => {
            unlisteners.forEach(u => u());
        };
    }, []);

    const handlePlayInstance = async (instance: Instance) => {
        if (!user || isLaunching) return;
        
        // Update selected instance as "last played"
        setSelectedInstance(instance);
        
        setIsLaunching(true);
        setLaunchStartTime(Date.now());
        setLaunchStage(t('preparing'));
        setLaunchProgress(0);
        maxProgressRef.current = 0;

        // Check for Porcos updates
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join, appCacheDir } = await import("@tauri-apps/api/path");
            const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
            const porcosJsonPath = await join(instancePath, 'porcos.json');
            
            const exists = await invoke('file_exists', { path: porcosJsonPath }) as boolean;
            if (exists) {
                setLaunchStage(t('searchingUpdates'));
                const content = await invoke('read_text_file', { path: porcosJsonPath }) as string;
                let porcosData = JSON.parse(content);
                
                if (porcosData.updateUrl) {
                    const responseText = await invoke('fetch_cors', { url: porcosData.updateUrl }) as string;
                    const data = JSON.parse(responseText);
                    
                    // Get all versions for this ID
                    if (data.modpacks) {
                        const versions = data.modpacks.filter((mp: any) => mp.id === porcosData.id);
                        // Sort ascending
                        versions.sort((a: any, b: any) => a.version.localeCompare(b.version, undefined, { numeric: true }));
                        
                        const currentIndex = versions.findIndex((v: any) => v.version === porcosData.version);
                        
                        if (currentIndex !== -1 && currentIndex < versions.length - 1) {
                            const updates = versions.slice(currentIndex + 1);
                            const cacheDir = await appCacheDir();
                            const tempDir = await join(cacheDir, 'temp_updates');
                            
                            for (const update of updates) {
                                setLaunchStage(t('updatingToVersion', { version: update.version }));
                                addLog(`Applying update ${update.version}...`);
                                
                                // Download
                                const downloadUrls = [];
                                if (update.downloadUrl) downloadUrls.push(update.downloadUrl);
                                
                                let urlIndex = 2;
                                while (update[`downloadUrl${urlIndex}`]) {
                                    downloadUrls.push(update[`downloadUrl${urlIndex}`]);
                                    urlIndex++;
                                }
                                
                                const zipPaths = [];
                                for (let i = 0; i < downloadUrls.length; i++) {
                                    const url = downloadUrls[i];
                                    const fileName = url.split('/').pop() || `update_${i}.zip`;
                                    const filePath = await join(tempDir, fileName);
                                    await invoke('download_file', { url, path: filePath });
                                    zipPaths.push(filePath);
                                }
                                
                                // Extract
                                const skipFiles = [
                                    "servers.dat"
                                ];
                                for (const zipPath of zipPaths) {
                                    await invoke('extract_zip', { 
                                        zipPath, 
                                        targetDir: instancePath,
                                        skipFiles: skipFiles
                                    });
                                }
                                
                                // Delete Files
                                if (update.filesToDelete && Array.isArray(update.filesToDelete)) {
                                    for (const fileToDelete of update.filesToDelete) {
                                        const fullPath = await join(instancePath, fileToDelete);
                                        if (await invoke('file_exists', { path: fullPath })) {
                                            await invoke('delete_file', { path: fullPath });
                                        }
                                    }
                                }
                                
                                // Update porcos.json
                                porcosData.version = update.version;
                                await invoke('write_text_file', { 
                                    path: porcosJsonPath, 
                                    content: JSON.stringify(porcosData) 
                                });
                            }
                            addLog("Updates applied successfully.");
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Porcos update check failed", e);
            addLog(`Update check failed: ${e}`);
        }

        const versionString = instance.selectedVersion || instance.version;
        addLog(`Launching instance: ${instance.name} (${versionString})...`);

        // Parse version string for Mod Loader info
        // Format: "1.20.1" or "1.20.1 (Fabric 0.14.22)"
        const parsedLaunch = parseVersion(versionString);
        let versionToPlay = parsedLaunch.mcVersion;
        let loaderToUse = parsedLaunch.loader || instance.modLoader;
        let loaderVersionToUse = parsedLaunch.loaderVersion || instance.modLoaderVersion;

        if (parsedLaunch.loader) {
            console.log(`[Launch] Detected complex version: MC=${versionToPlay}, Loader=${loaderToUse}, Ver=${loaderVersionToUse}`);
        } else {
            // If it's a simple version string (e.g. "1.20.1"), we should check if the global modLoader matches the current intent.
            // If the user selected "1.20.1" (Vanilla) but the instance has "Fabric" set globally from a previous launch,
            // we might accidentally launch Fabric.
            // Ideally, "1.20.1" implies Vanilla if it doesn't have the suffix.
            // BUT, for backward compatibility with existing instances that use the global setting, we should respect instance.modLoader.
            // However, if we are using the new system, "1.20.1" in the list usually means Vanilla.
            
            // Let's assume if it's in the versions list as just "1.20.1", it's Vanilla, UNLESS the user manually set the Mod Loader in the settings.
            // This is tricky. Let's trust the global state for simple strings for now, to avoid breaking old instances.
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join, appDataDir } = await import("@tauri-apps/api/path");
            
            // Get instance path
            const instancePath = await invoke("get_instance_path", { id: instance.id });
            addLog(`Instance path: ${instancePath}`);

            // Determine Java version from Mojang's version manifest
            setLaunchStage(t('checkingJavaVersion') || 'Checking required Java version...');
            let requiredJavaMajor: number;
            try {
                requiredJavaMajor = await invoke('get_required_java_version', { version: versionToPlay }) as number;
                addLog(`Mojang manifest requires Java ${requiredJavaMajor} for MC ${versionToPlay}`);
            } catch (e) {
                addLog(`Failed to get Java version from manifest, falling back to hardcoded mapping: ${e}`);
                // Fallback to hardcoded mapping if manifest fetch fails
                const versionParts = versionToPlay.split('.');
                const major = parseInt(versionParts[0]);
                let minor = 0;
                let patch = 0;
                if (versionParts.length >= 2) minor = parseInt(versionParts[1]);
                if (versionParts.length >= 3) patch = parseInt(versionParts[2]);

                if (major >= 2) {
                    requiredJavaMajor = 25;
                } else if (minor <= 16) {
                    requiredJavaMajor = 8;
                } else if (minor === 17) {
                    requiredJavaMajor = 16;
                } else if (minor >= 18 && minor <= 20) {
                    requiredJavaMajor = (minor === 20 && patch >= 5) ? 21 : 17;
                } else {
                    requiredJavaMajor = 21;
                }
            }

            const appData = await appDataDir();
            const roamingDir = await join(appData, '..');
            const porcosDir = await join(roamingDir, '.porcos');
            const runtimeDir = await join(porcosDir, 'runtime');
            
            const javaLabel = `Java ${requiredJavaMajor}`;
            const javaId = `java-download-${requiredJavaMajor}`;
            const javaZipName = `java${requiredJavaMajor}.zip`;

            // Use Adoptium Temurin API for dynamic Java downloads
            const javaUrl = `https://api.adoptium.net/v3/binary/latest/${requiredJavaMajor}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`;

            // Find any existing JDK directory for this major version
            let javaDirName = '';
            let javaPath = '';
            try {
                const runtimeFiles = await invoke('list_files', { path: runtimeDir }) as { name: string, is_dir: boolean }[];
                const jdkDir = runtimeFiles.find(f => f.is_dir && f.name.startsWith(`jdk-${requiredJavaMajor}`));
                if (jdkDir) {
                    javaDirName = jdkDir.name;
                    javaPath = await join(runtimeDir, javaDirName, 'bin', 'java.exe');
                    if (!await invoke('file_exists', { path: javaPath })) {
                        javaDirName = '';
                        javaPath = '';
                    }
                }
            } catch {
                // runtime dir may not exist yet
            }

            if (!javaPath) {
                addLog(`${javaLabel} not found. Downloading from Adoptium...`);
                setLaunchStage(t('downloadingJavaLabel', { label: javaLabel }));
                setLaunchProgress(0);
                
                const zipPath = await join(runtimeDir, javaZipName);
                
                await invoke('download_file', { 
                    url: javaUrl, 
                    path: zipPath, 
                    id: javaId 
                });
                
                setLaunchStage(t('extractingJava', { label: javaLabel }));
                await invoke('extract_zip', { zipPath, targetDir: runtimeDir });
                await invoke('delete_file', { path: zipPath });

                // Find the extracted directory name (e.g., jdk-25.0.1+9)
                const runtimeFiles = await invoke('list_files', { path: runtimeDir }) as { name: string, is_dir: boolean }[];
                const jdkDir = runtimeFiles.find(f => f.is_dir && f.name.startsWith(`jdk-${requiredJavaMajor}`));
                if (jdkDir) {
                    javaDirName = jdkDir.name;
                    javaPath = await join(runtimeDir, javaDirName, 'bin', 'java.exe');
                } else {
                    throw new Error(`Failed to find extracted JDK directory for Java ${requiredJavaMajor}`);
                }

                addLog(`${javaLabel} installed successfully at ${javaDirName}.`);
            }

            // Generate offline UUID if needed
            let uuid = user.uuid;
            if (user.mode === 'offline' && !uuid) {
                uuid = await invoke("generate_offline_uuid", { username: user.username });
            }

            const options = {
                version: versionToPlay,
                mod_loader: loaderToUse,
                mod_loader_version: loaderVersionToUse,
                auth: user.mode === 'microsoft' ? {
                    Microsoft: {
                        access_token: user.accessToken || '',
                        uuid: uuid,
                        username: user.username
                    }
                } : {
                    Offline: {
                        uuid: uuid,
                        username: user.username
                    }
                },
                memory_min: `${memoryMin}G`,
                memory_max: `${memoryMax}G`,
                java_path: javaPath,
                minecraft_dir: instancePath
            };

            addLog("Launch options: " + JSON.stringify(options, null, 2));
            
            // Invoke launch command - events will update progress
            const result = await invoke("launch_minecraft", { options });
            
            addLog("Launch result: " + JSON.stringify(result));

        } catch (error) {
            console.error("Launch failed:", error);
            addLog(`Launch failed: ${error}`);
            setIsLaunching(false);
            setLaunchStartTime(null);
            setToastType('error');
            setToastMessage(typeof error === 'string' ? error : t('errorLaunching'));
            setTimeout(() => setToastMessage(null), 5000);
        }
    };

    if (instances.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 relative">
                <div className="w-24 h-24 bg-white/5 rounded-xl flex items-center justify-center mb-6">
                    <Box className="w-12 h-12 text-white/20" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{t('noInstances')}</h2>
                <p className="text-[#a1a1aa] mb-8">{t('createFirstInstance')}</p>
                
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="w-16 h-16 bg-[#ffbfba] text-[#1a1a1a] rounded-2xl flex items-center justify-center hover:scale-110 transition-all shadow-[0_0_20px_rgba(255,191,186,0.3)] hover:shadow-[0_0_30px_rgba(255,191,186,0.5)]"
                >
                    <Plus size={32} strokeWidth={3} />
                </button>

                <AnimatePresence key="modal1">
                    <CreateInstanceModal 
                        isOpen={showCreateModal} 
                        onClose={() => setShowCreateModal(false)} 
                    />
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex bg-[#0f0f0f] overflow-hidden relative">
            {/* Instance Sidebar (Nav Rail Style) */}
            <div className="h-full w-[80px] bg-[#121212] border-r border-white/5 flex flex-col shrink-0 z-20 relative shadow-2xl items-center py-6">
                
                {/* Instance List */}
                <div className={cn("flex-1 overflow-y-auto overflow-x-hidden w-full flex flex-col items-center gap-2 scrollbar-hide px-2", styles.instanceListContainer)}>
                    <Reorder.Group 
                        axis="y" 
                        values={instances} 
                        onReorder={setInstances}
                        className="flex flex-col items-center gap-2 w-full list-none p-0 m-0"
                    >
                        {instances.map((instance) => (
                            <Reorder.Item 
                                key={instance.id}
                                value={instance}
                                className="relative group/item w-full flex justify-center"
                                whileDrag={{ scale: 1.1, zIndex: 50 }}
                                dragListener={true}
                            >
                                <div 
                                    className="w-full flex justify-center cursor-pointer touch-none"
                                    onClick={() => setSelectedInstance(instance)}
                                    onDragStart={(e) => e.preventDefault()}
                                >
                                    {/* Active Indicator (Pink Bar) */}
                                    {activeInstance?.id === instance.id && (
                                        <motion.div 
                                            layoutId="active-bar"
                                            className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-[#ffbfba] rounded-l-full shadow-[0_0_10px_rgba(255,191,186,0.5)]"
                                        />
                                    )}

                                    {/* Icon */}
                                    <InstanceIcon instance={instance} isActive={activeInstance?.id === instance.id} />
                                </div>
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>
                    
                    {/* Add Button */}
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="w-12 h-12 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/20 hover:text-white hover:border-white/30 transition-all hover:bg-white/5 group"
                    >
                        <Plus size={24} className="group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Right: Hero Section (Active Instance) */}
            <div className="flex-1 relative group overflow-hidden">
                {/* Background with Gradient */}
                <div className="absolute inset-0">
                    {activeBgSrc && (
                        <img 
                            src={activeBgSrc}
                            alt="Background"
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                        />
                    )}
                </div>

                {/* Settings Button - Absolute Top Right */}
                <div className="absolute top-4 right-4 z-50">
                    <button 
                        onClick={() => {
                            setShowSettingsModal(true);
                        }}
                        className={styles.settingsButton}
                        title={t('instanceSettings')}
                    >
                        <Settings size={24} />
                    </button>
                </div>

                {/* Content - Minimalist Play Capsule */}
                <div className="absolute bottom-10 left-10 right-10 z-10 flex justify-center">
                    <motion.div 
                        key={activeInstance?.id}
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className={styles.playCapsule}
                    >
                        {/* Left Side: Info */}
                        <div className={styles.instanceInfo}>
                            <h2 className={styles.instanceName} title={activeInstance?.name}>
                                {activeInstance?.name}
                            </h2>
                            
                            <div className={styles.instanceMeta}>
                                 {/* Version Pill */}
                                 <div 
                                    className={cn(
                                        styles.metaPill, 
                                        (activeInstance?.versions?.length || 0) <= 1 && "!cursor-default hover:!transform-none hover:!bg-[rgba(255,255,255,0.03)] hover:!border-[rgba(255,255,255,0.05)]"
                                    )} 
                                    onClick={() => (activeInstance?.versions?.length || 0) > 1 && setIsMainVersionDropdownOpen(!isMainVersionDropdownOpen)}
                                 >
                                    <Gamepad2 size={16} className="text-[#ffbfba]" />
                                    <span className={styles.metaText}>{activeInstance?.selectedVersion || activeInstance?.version}</span>
                                    {(activeInstance?.versions?.length || 0) > 1 && <ChevronDown size={14} className="text-[#a1a1aa]" />}
                                    
                                    <AnimatePresence>
                                        {isMainVersionDropdownOpen && (activeInstance?.versions?.length || 0) > 1 && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsMainVersionDropdownOpen(false); }} />
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                                    className={cn(
                                                        styles.versionDropdown,
                                                        styles.dropdownScrollbar
                                                    )}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {(activeInstance?.versions || [activeInstance?.version]).map((v) => (
                                                        <div
                                                            key={v}
                                                            onClick={() => {
                                                                handleVersionChange(v);
                                                                setIsMainVersionDropdownOpen(false);
                                                            }}
                                                            className={cn(
                                                                styles.versionDropdownItem,
                                                                (activeInstance?.selectedVersion || activeInstance?.version) === v ? styles.versionDropdownItemActive : ""
                                                            )}
                                                        >
                                                            <span>{v}</span>
                                                            {(activeInstance?.selectedVersion || activeInstance?.version) === v && <Check size={14} />}
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                 </div>

                                 {/* Porcos Version Pill - Only show for Porcos modpacks */}
                                 {porcosMetadata && (
                                    <div className={styles.metaPill}>
                                        <Package size={16} className="text-[#ffbfba]" />
                                        <span className={styles.metaText}>
                                            v{porcosMetadata.version}
                                        </span>
                                    </div>
                                 )}

                                 {/* Update Button */}
                                 {updateAvailable && !isLaunching && (
                                     <motion.button
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        onClick={handleUpdateInstance}
                                        className={styles.updateButton}
                                     >
                                         <Download size={16} />
                                         {t('updateToVersion', { version: updateAvailable.version })}
                                     </motion.button>
                                 )}
                            </div>
                        </div>

                        {/* Right Side: Button */}
                        <div className={styles.playButtonWrapper} style={{ opacity: isLaunching ? 0 : 1, transition: 'opacity 0.2s' }}>
                            <button
                                onClick={() => handlePlayInstance(activeInstance)}
                                className={styles.playButtonStyled}
                                disabled={isLaunching}
                            >
                                <span className={styles.playButtonText}>{t('play')}</span>
                                <Play size={28} fill="currentColor" />
                            </button>
                        </div>

                        {/* Launching Overlay */}
                        <AnimatePresence>
                            {isLaunching && (
                                <motion.div 
                                    key="launching-state"
                                    className={cn(styles.launchingOverlay, "rounded-[24px]")}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <div className={styles.launchContent}>
                                        <div className={styles.launchHeader}>
                                            <span className={styles.launchStage}>{launchStage}</span>
                                            <span className={styles.launchPercent}>{Math.round(launchProgress)}%</span>
                                        </div>

                                        <div className={styles.launchBarTrack}>
                                            <div
                                                className={styles.launchBarFill}
                                                style={{ width: `${launchProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                {/* Settings Modal */}
                <AnimatePresence>
                    {showSettingsModal && (
                        <InstanceSettings 
                            instance={activeInstance} 
                            onBack={() => setShowSettingsModal(false)}
                            preloadedIconSrc={preloadedSettingsIcon}
                            preloadedBgSrc={activeBgSrc}
                        />
                    )}
                </AnimatePresence>


                {/* Create Instance Modal */}
                <AnimatePresence key="modal2">
                    <CreateInstanceModal 
                        isOpen={showCreateModal} 
                        onClose={() => setShowCreateModal(false)} 
                    />
                </AnimatePresence>



                {/* Toast Notification */}
                <AnimatePresence>
                    {toastMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            className={cn(
                                "absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border px-6 py-3 rounded-xl shadow-2xl z-[60] flex items-center gap-3",
                                toastType === 'error' ? "border-red-500/50 text-red-200" : "border-white/10 text-white"
                            )}
                        >
                            {toastType === 'error' ? <AlertCircle size={20} className="text-red-500" /> : <Check size={20} className="text-green-400" />}
                            <span className="font-medium">{toastMessage}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Home;





