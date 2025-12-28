import React, { useState, useEffect } from 'react';
import { Box, Settings, Plus, Image as ImageIcon, X, Trash2, Check, Play, Cpu, Gamepad2, ChevronDown, ArrowLeft, Package, Download } from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useLauncherStore, Instance } from '@/stores/launcherStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import styles from './Home.module.css';
import CreateInstanceModal from '@/components/CreateInstanceModal';

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

// Cache for background blobs to avoid re-reading files
const bgCache = new Map<string, string>();

const InstanceIcon = ({ instance, isActive }: { instance: Instance, isActive: boolean }) => {
    const [src, setSrc] = useState("https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");

    useEffect(() => {
        let isMounted = true;
        const loadIcon = async () => {
            const imgSource = instance.icon || instance.backgroundImage || (instance as any).background_image;
            
            if (!imgSource) {
                 if (isMounted) setSrc("https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
                 return;
            }

            // Check cache first
            const cacheKey = `${instance.id}-${imgSource}`;
            if (bgCache.has(cacheKey)) {
                if (isMounted) setSrc(bgCache.get(cacheKey)!);
                return;
            }

            let newSrc = "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg";

            if (imgSource.startsWith('http')) {
                newSrc = imgSource;
            } else if (imgSource.startsWith('assets/') || imgSource.startsWith('/assets/')) {
                newSrc = imgSource.startsWith('/') ? imgSource : `/${imgSource}`;
            } else if (BACKGROUNDS.includes(imgSource)) {
                newSrc = `/assets/thumbnails/${imgSource}`;
            } else {
                // Custom file
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    const { join, isAbsolute } = await import("@tauri-apps/api/path");
                    
                    let fullPath = imgSource;
                    // Robust absolute path check
                    const isAbs = await isAbsolute(imgSource) || imgSource.includes(':\\') || imgSource.startsWith('/');
                    
                    if (!isAbs) {
                        const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                        fullPath = await join(instancePath, imgSource);
                    }
                    
                    // Use read_binary_file for reliability
                    const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                    const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                    newSrc = URL.createObjectURL(blob);
                    
                    // Cache it
                    bgCache.set(cacheKey, newSrc);
                } catch (e) {
                    console.error(`[InstanceIcon] Failed to load ${imgSource}`, e);
                }
            }
            
            if (isMounted) setSrc(newSrc);
        };
        
        loadIcon();
        return () => { isMounted = false; };
    }, [instance.id, instance.icon, instance.backgroundImage, (instance as any).background_image]);

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
};

const Home: React.FC = () => {
    const { 
        instances, selectedInstance, isLaunching, setIsLaunching, addLog, 
        memoryMin, memoryMax, setSelectedInstance, updateInstance,
        launchStage, launchProgress, setLaunchStage, setLaunchProgress,
        removeInstance, versions, setVersions, setInstances
    } = useLauncherStore();
    const { user } = useAuthStore();
    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'general' | 'versions'>('general');
    const [editingName, setEditingName] = useState('');
    const [versionToAdd, setVersionToAdd] = useState('');
    const [isVersionSelectOpen, setIsVersionSelectOpen] = useState(false);
    const [isMainVersionDropdownOpen, setIsMainVersionDropdownOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    
    // Create Instance State
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Background Image State for Active Instance
    const [activeBgSrc, setActiveBgSrc] = useState<string>("");

    // Add Version with Loader State
    const [addVersionModLoader, setAddVersionModLoader] = useState('Vanilla');
    const [addVersionLoaderVersion, setAddVersionLoaderVersion] = useState('');
    const [availableAddVersionLoaders, setAvailableAddVersionLoaders] = useState<any[]>([]);
    const [isAddVersionLoaderOpen, setIsAddVersionLoaderOpen] = useState(false);
    const [isAddVersionLoaderVersionOpen, setIsAddVersionLoaderVersionOpen] = useState(false);

    // Default to first if none selected
    const activeInstance = selectedInstance || instances[0];

    useEffect(() => {
        const loadBg = async () => {
            if (!activeInstance) {
                setActiveBgSrc("");
                return;
            }
            
            // Check if it's a predefined asset path (starts with assets/)
            const bg = activeInstance.backgroundImage || (activeInstance as any).background_image;
            
            if (bg) {
                // Check cache first
                const cacheKey = `${activeInstance.id}-${bg}`;
                if (bgCache.has(cacheKey)) {
                    setActiveBgSrc(bgCache.get(cacheKey)!);
                    return;
                }

                if (bg.startsWith('assets/') || bg.startsWith('/assets/')) {
                     // It's a predefined asset path, use directly
                     setActiveBgSrc(bg.startsWith('/') ? bg : `/${bg}`);
                } else if (BACKGROUNDS.includes(bg)) {
                    setActiveBgSrc(`/assets/backgrounds/${bg}`);
                } else if (bg.startsWith('http')) {
                    // It IS a URL (legacy or error), load directly
                    console.warn("Background is a URL, loading directly:", bg);
                    setActiveBgSrc(bg);
                } else {
                    // Custom image
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        const { join, isAbsolute } = await import("@tauri-apps/api/path");

                        let fullPath = bg;
                        // Robust absolute path check
                        const isAbs = await isAbsolute(bg) || bg.includes(':\\') || bg.startsWith('/');
                        
                        if (!isAbs) {
                             const instancePath = await invoke("get_instance_path", { id: activeInstance.id }) as string;
                             fullPath = await join(instancePath, bg);
                        }
                        
                        // Use read_binary_file for reliability
                        const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                        const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                        const url = URL.createObjectURL(blob);
                        
                        // Cache it
                        bgCache.set(cacheKey, url);
                        setActiveBgSrc(url);
                    } catch (e) {
                        console.error("Failed to load custom background:", e);
                        setActiveBgSrc(`/assets/backgrounds/${BACKGROUNDS[0]}`);
                    }
                }
            } else {
                setActiveBgSrc(`/assets/backgrounds/${BACKGROUNDS[0]}`);
            }
        };
        loadBg();
    }, [activeInstance]);





    // Porcos Metadata State
    const [porcosMetadata, setPorcosMetadata] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<any>(null);
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

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
                        setIsCheckingUpdate(true);
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
                        } finally {
                            setIsCheckingUpdate(false);
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
        
        setIsUpdating(true);
        setLaunchStage("Iniciando actualización...");
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
                        if (u.downloadUrl2) urls++;
                        if (u.downloadUrl3) urls++;
                        if (u.downloadUrl4) urls++;
                        if (u.downloadUrl5) urls++;
                        totalSteps += urls + 1; // +1 for extraction phase
                    });
                    
                    let currentStep = 0;

                    for (const update of updates) {
                        setLaunchStage(`Actualizando a v${update.version}...`);
                        
                        // Download
                        const downloadUrls = [];
                        if (update.downloadUrl) downloadUrls.push(update.downloadUrl);
                        if (update.downloadUrl2) downloadUrls.push(update.downloadUrl2);
                        if (update.downloadUrl3) downloadUrls.push(update.downloadUrl3);
                        if (update.downloadUrl4) downloadUrls.push(update.downloadUrl4);
                        if (update.downloadUrl5) downloadUrls.push(update.downloadUrl5);
                        
                        const zipPaths = [];
                        for (let i = 0; i < downloadUrls.length; i++) {
                            const url = downloadUrls[i];
                            const fileName = url.split('/').pop() || `update_${update.version}_${i}.zip`;
                            const filePath = await join(tempDir, fileName);
                            
                            setLaunchStage(`Descargando v${update.version} (Parte ${i+1}/${downloadUrls.length})...`);
                            await invoke('download_file', { url, path: filePath });
                            zipPaths.push(filePath);
                            
                            currentStep++;
                            setLaunchProgress((currentStep / totalSteps) * 100);
                        }
                        
                        // Extract
                        setLaunchStage(`Instalando v${update.version}...`);
                        for (const zipPath of zipPaths) {
                            await invoke('extract_zip', { zipPath, targetDir: instancePath });
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
                                setLaunchStage(`Actualizando fondo de pantalla...`);
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
                    
                    setLaunchStage("¡Actualización completada!");
                    setLaunchProgress(100);
                    setUpdateAvailable(null); // No more updates
                    setTimeout(() => {
                        setIsLaunching(false);
                        setIsUpdating(false);
                    }, 2000);
                }
            }
        } catch (e) {
            console.error("Update failed", e);
            setLaunchStage("Error en la actualización");
            setTimeout(() => {
                setIsLaunching(false);
                setIsUpdating(false);
            }, 2000);
        }
    };

    // Effect for Add Version Loader fetching
    useEffect(() => {
        const fetchLoaders = async () => {
            if (!versionToAdd || addVersionModLoader === 'Vanilla') {
                setAvailableAddVersionLoaders([]);
                return;
            }

            try {
                const { invoke } = await import("@tauri-apps/api/core");
                let versions: any[] = [];
                
                switch (addVersionModLoader) {
                    case 'Fabric':
                        versions = await invoke('get_fabric_versions', { minecraftVersion: versionToAdd });
                        break;
                    case 'Quilt':
                        versions = await invoke('get_quilt_versions', { minecraftVersion: versionToAdd });
                        break;
                    case 'NeoForge':
                        versions = await invoke('get_neoforge_versions', { minecraftVersion: versionToAdd });
                        break;
                    case 'Forge':
                        versions = await invoke('get_forge_versions', { minecraftVersion: versionToAdd });
                        break;
                }

                setAvailableAddVersionLoaders(versions);
                if (versions.length > 0) {
                    setAddVersionLoaderVersion(versions[0].version);
                } else {
                    setAddVersionLoaderVersion('');
                }
            } catch (error) {
                console.error(`Failed to fetch ${addVersionModLoader} versions for ${versionToAdd}:`, error);
            }
        };
        
        fetchLoaders();
    }, [versionToAdd, addVersionModLoader]);



    const handleUpdateBackground = async (filename: string) => {
        if (activeInstance) {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("update_instance", {
                    id: activeInstance.id,
                    backgroundImage: filename
                });
            } catch (e) {
                console.error("Failed to update background on backend", e);
            }
            updateInstance(activeInstance.id, { backgroundImage: filename });
            setShowBackgroundSelector(false);
        }
    };

    useEffect(() => {
        if (!showSettingsModal || !activeInstance || !editingName || editingName === activeInstance.name) return;

        const timer = setTimeout(async () => {
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("update_instance", {
                    id: activeInstance.id,
                    name: editingName
                });
                updateInstance(activeInstance.id, { name: editingName });
                setToastMessage("Nombre cambiado");
                setTimeout(() => setToastMessage(null), 3000);
            } catch (e) {
                console.error("Failed to rename instance", e);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [editingName, activeInstance, showSettingsModal]);

    const handleDeleteInstance = () => {
        if (!activeInstance) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeleteInstance = async () => {
        if (!activeInstance) return;
        
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("delete_instance", { id: activeInstance.id });
            removeInstance(activeInstance.id);
            setSelectedInstance(null);
            setShowSettingsModal(false);
            setShowDeleteConfirm(false);
        } catch (e) {
            console.error("Failed to delete instance", e);
        }
    };

    const handleAddVersion = async () => {
        if (!activeInstance || !versionToAdd) return;
        
        // Construct the version string
        // Format: "1.20.1" or "1.20.1 (Fabric 0.14.22)"
        let newVersionString = versionToAdd;
        if (addVersionModLoader !== 'Vanilla' && addVersionLoaderVersion) {
            newVersionString = `${versionToAdd} (${addVersionModLoader} ${addVersionLoaderVersion})`;
        }

        const currentVersions = activeInstance.versions || [activeInstance.version];
        if (currentVersions.includes(newVersionString)) {
            setToastMessage("Esta versión ya está instalada");
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        const newVersions = [...currentVersions, newVersionString];
        
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            
            // We update the versions list. 
            // We DO NOT update the global modLoader here, because that should happen when the version is SELECTED.
            // However, since we are auto-selecting it, we will update it.
            
            const updatePayload: any = {
                id: activeInstance.id,
                versions: newVersions,
            };

            // If we are auto-selecting the new version, update the global state too
            if (addVersionModLoader !== 'Vanilla') {
                updatePayload.modLoader = addVersionModLoader;
                updatePayload.modLoaderVersion = addVersionLoaderVersion;
            } else {
                updatePayload.modLoader = null;
                updatePayload.modLoaderVersion = null;
            }

            await invoke("update_instance", updatePayload);
            
            updateInstance(activeInstance.id, { 
                versions: newVersions,
                selectedVersion: newVersionString,
                modLoader: addVersionModLoader === 'Vanilla' ? undefined : addVersionModLoader,
                modLoaderVersion: addVersionModLoader === 'Vanilla' ? undefined : addVersionLoaderVersion
            });
            
            setVersionToAdd('');
            setAddVersionModLoader('Vanilla');
            setToastMessage("Versión añadida correctamente");
            setTimeout(() => setToastMessage(null), 3000);
        } catch (e) {
            console.error("Failed to add version", e);
        }
    };

    const handleRemoveVersion = async (versionToRemove: string) => {
        if (!activeInstance) return;
        
        const currentVersions = activeInstance.versions || [activeInstance.version];
        if (currentVersions.length <= 1) return; // Cannot remove last version

        const newVersions = currentVersions.filter(v => v !== versionToRemove);
        
        // If we removed the selected version, switch to another one
        let newSelectedVersion = activeInstance.selectedVersion || activeInstance.version;
        if (newSelectedVersion === versionToRemove) {
            newSelectedVersion = newVersions[0];
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("update_instance", {
                id: activeInstance.id,
                versions: newVersions,
                // Also update selected version if needed, but backend doesn't store selectedVersion yet?
                // Store only persists selectedVersion in local storage via zustand persist.
            });
            updateInstance(activeInstance.id, { 
                versions: newVersions,
                selectedVersion: newSelectedVersion
            });
        } catch (e) {
            console.error("Failed to remove version", e);
        }
    };

    const handleVersionChange = async (version: string) => {
        if (!activeInstance) return;

        // Check if it's a complex version
        const complexVersionMatch = version.match(/^(.*) \((.*) (.*)\)$/);
        let newModLoader = activeInstance.modLoader;
        let newModLoaderVersion = activeInstance.modLoaderVersion;

        if (complexVersionMatch) {
            // It's a complex version, update global state to match
            newModLoader = complexVersionMatch[2];
            newModLoaderVersion = complexVersionMatch[3];
        } else {
            // It's a simple version (Vanilla). 
            // If we switch to Vanilla, we should probably clear the mod loader to avoid confusion
            // UNLESS the user wants to apply the global mod loader to this version.
            // But given the new "Add Version" flow, simple versions are likely Vanilla.
            newModLoader = undefined;
            newModLoaderVersion = undefined;
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
        const loadVersions = async () => {
            if (versions.length === 0) {
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    const versionList = await invoke("get_available_versions");
                    setVersions(versionList as any[]);
                } catch (error) {
                    console.error("Failed to load versions:", error);
                }
            }
        };
        loadVersions();
    }, [versions, setVersions]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen('launch-progress', (event: any) => {
                    const { stage, progress } = event.payload;
                    setLaunchStage(stage);
                    setLaunchProgress(progress);
                    
                    // If progress is 100% and stage indicates game started, we can hide the bar after a delay
                    if (progress === 100 && (stage.includes("Juego iniciado") || stage.includes("Game"))) {
                        setTimeout(() => setIsLaunching(false), 2000);
                    }
                });
            } catch (error) {
                console.error("Failed to setup event listener:", error);
            }
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    const handlePlayInstance = async (instance: Instance) => {
        if (!user || isLaunching) return;
        
        // Update selected instance as "last played"
        setSelectedInstance(instance);
        
        setIsLaunching(true);
        setLaunchStage("Preparando...");
        setLaunchProgress(0);

        // Check for Porcos updates
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join, appCacheDir } = await import("@tauri-apps/api/path");
            const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
            const porcosJsonPath = await join(instancePath, 'porcos.json');
            
            const exists = await invoke('file_exists', { path: porcosJsonPath }) as boolean;
            if (exists) {
                setLaunchStage("Buscando actualizaciones...");
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
                                setLaunchStage(`Actualizando a v${update.version}...`);
                                addLog(`Applying update ${update.version}...`);
                                
                                // Download
                                const downloadUrls = [];
                                if (update.downloadUrl) downloadUrls.push(update.downloadUrl);
                                if (update.downloadUrl2) downloadUrls.push(update.downloadUrl2);
                                if (update.downloadUrl3) downloadUrls.push(update.downloadUrl3);
                                if (update.downloadUrl4) downloadUrls.push(update.downloadUrl4);
                                if (update.downloadUrl5) downloadUrls.push(update.downloadUrl5);
                                
                                const zipPaths = [];
                                for (let i = 0; i < downloadUrls.length; i++) {
                                    const url = downloadUrls[i];
                                    const fileName = url.split('/').pop() || `update_${i}.zip`;
                                    const filePath = await join(tempDir, fileName);
                                    await invoke('download_file', { url, path: filePath });
                                    zipPaths.push(filePath);
                                }
                                
                                // Extract
                                for (const zipPath of zipPaths) {
                                    await invoke('extract_zip', { zipPath, targetDir: instancePath });
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
        let versionToPlay = versionString;
        let loaderToUse = instance.modLoader;
        let loaderVersionToUse = instance.modLoaderVersion;

        const complexVersionMatch = versionString.match(/^(.*) \((.*) (.*)\)$/);
        if (complexVersionMatch) {
            versionToPlay = complexVersionMatch[1];
            loaderToUse = complexVersionMatch[2];
            loaderVersionToUse = complexVersionMatch[3];
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
            
            // Get instance path
            const instancePath = await invoke("get_instance_path", { id: instance.id });
            addLog(`Instance path: ${instancePath}`);

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
                java_path: null,
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
        }
    };

    if (instances.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 relative">
                <div className="w-24 h-24 bg-white/5 rounded-xl flex items-center justify-center mb-6">
                    <Box className="w-12 h-12 text-white/20" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">No hay instancias</h2>
                <p className="text-[#a1a1aa] mb-8">Crea tu primera instancia para empezar.</p>
                
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
                            setEditingName(activeInstance?.name || '');
                            setShowSettingsModal(true);
                        }}
                        className={styles.settingsButton}
                        title="Ajustes de Instancia"
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
                                 <div className={styles.metaPill} onClick={() => setIsMainVersionDropdownOpen(!isMainVersionDropdownOpen)}>
                                    <Gamepad2 size={16} className="text-[#ffbfba]" />
                                    <span className={styles.metaText}>{activeInstance?.selectedVersion || activeInstance?.version}</span>
                                    <ChevronDown size={14} className="text-[#a1a1aa]" />
                                    
                                    <AnimatePresence>
                                        {isMainVersionDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsMainVersionDropdownOpen(false); }} />
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 10 }}
                                                    className={cn(
                                                        "absolute bottom-full left-0 mb-2 w-64 bg-[#09090b] rounded-xl border border-white/10 shadow-2xl max-h-60 overflow-y-auto z-50",
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
                                                                "px-4 py-3 hover:bg-white/5 cursor-pointer text-white text-sm transition-colors flex items-center justify-between",
                                                                (activeInstance?.selectedVersion || activeInstance?.version) === v ? "bg-white/10 text-[#ffbfba]" : ""
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
                                 
                                 <div className={styles.metaDivider} />

                                 {/* Modloader Pill */}
                                 <div className={styles.metaPill}>
                                    <Cpu size={16} className={activeInstance?.modLoader ? "text-[#ffbfba]" : "text-blue-400"} />
                                    <span className={styles.metaText}>
                                        {activeInstance?.modLoader 
                                            ? (activeInstance.modLoader.charAt(0).toUpperCase() + activeInstance.modLoader.slice(1)) 
                                            : "Vanilla"}
                                    </span>
                                 </div>

                                 {/* Porcos Version Pill */}
                                 {porcosMetadata && (
                                     <>
                                        <div className={styles.metaDivider} />
                                        <div className={styles.metaPill}>
                                            <Package size={16} className="text-[#ffbfba]" />
                                            <span className={styles.metaText}>
                                                v{porcosMetadata.version}
                                            </span>
                                        </div>
                                     </>
                                 )}

                                 {/* Update Button */}
                                 {updateAvailable && !isLaunching && (
                                     <motion.button
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        onClick={handleUpdateInstance}
                                        className="ml-4 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-full flex items-center gap-2 transition-all font-bold text-sm shadow-[0_0_15px_rgba(74,222,128,0.2)] hover:shadow-[0_0_20px_rgba(74,222,128,0.4)] cursor-pointer"
                                     >
                                         <Download size={16} />
                                         Actualizar a v{updateAvailable.version}
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
                                <span className={styles.playButtonText}>JUGAR</span>
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
                                            <motion.div 
                                                className={styles.launchBarFill}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${launchProgress}%` }}
                                                transition={{ ease: "linear" }}
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
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={styles.settingsOverlay}
                        >
                            {/* Header */}
                            <div className={styles.settingsHeader}>
                                <button 
                                    onClick={() => setShowSettingsModal(false)}
                                    className={styles.backSettingsButton}
                                >
                                    <ArrowLeft size={24} />
                                    <span>Volver</span>
                                </button>
                                <h3 className={styles.settingsTitle}>Ajustes de Instancia</h3>
                            </div>

                            {/* Body */}
                            <div className={styles.settingsBody}>
                                {/* Sidebar */}
                                <div className={styles.settingsSidebar}>
                                    <button
                                        onClick={() => setSettingsTab('general')}
                                        className={cn(
                                            styles.settingsNavItem,
                                            settingsTab === 'general' && styles.settingsNavItemActive
                                        )}
                                    >
                                        <Settings size={20} />
                                        General
                                    </button>
                                    <button
                                        onClick={() => setSettingsTab('versions')}
                                        className={cn(
                                            styles.settingsNavItem,
                                            settingsTab === 'versions' && styles.settingsNavItemActive
                                        )}
                                    >
                                        <Box size={20} />
                                        Versiones
                                    </button>
                                </div>

                                {/* Main Content */}
                                <div className={styles.settingsMain}>
                                    {settingsTab === 'general' && (
                                        <div className="max-w-3xl mx-auto">
                                            <h4 className={styles.settingsSectionTitle}>Configuración General</h4>
                                            
                                            {/* Identity Card */}
                                            <div className={styles.settingsCard}>
                                                <div className={styles.cardTitle}>
                                                    <Box size={20} className="text-[#ffbfba]" />
                                                    Identidad
                                                </div>
                                                <p className={styles.cardDescription}>
                                                    Personaliza cómo se ve tu instancia en el lanzador.
                                                </p>
                                                
                                                <div className={styles.inputGroup}>
                                                    <label className={styles.inputLabel}>Nombre de la Instancia</label>
                                                    <input
                                                        type="text"
                                                        value={editingName}
                                                        onChange={(e) => setEditingName(e.target.value)}
                                                        className={styles.textInput}
                                                        placeholder="Nombre de la instancia"
                                                    />
                                                </div>
                                            </div>

                                            {/* Appearance Card */}
                                            <div className={styles.settingsCard}>
                                                <div className={styles.cardTitle}>
                                                    <ImageIcon size={20} className="text-[#ffbfba]" />
                                                    Apariencia
                                                </div>
                                                <p className={styles.cardDescription}>
                                                    Elige un fondo épico para tu instancia.
                                                </p>
                                                
                                                <div className={styles.inputGroup}>
                                                    <label className={styles.inputLabel}>Fondo Personalizado</label>
                                                    <button 
                                                        onClick={() => setShowBackgroundSelector(true)}
                                                        className={cn(styles.actionButton, styles.primaryButton)}
                                                    >
                                                        <ImageIcon size={20} />
                                                        Cambiar Fondo
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Danger Zone Card */}
                                            <div className={cn(styles.settingsCard, "border-red-500/20 bg-red-500/5")}>
                                                <div className={cn(styles.cardTitle, "text-red-400")}>
                                                    <Trash2 size={20} />
                                                    Zona de Peligro
                                                </div>
                                                <p className={styles.cardDescription}>
                                                    Acciones irreversibles. Ten cuidado.
                                                </p>
                                                
                                                <button 
                                                    onClick={handleDeleteInstance}
                                                    className={cn(styles.actionButton, styles.dangerButton)}
                                                >
                                                    <Trash2 size={20} />
                                                    Eliminar Instancia
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {settingsTab === 'versions' && (
                                        <div className="max-w-3xl mx-auto">
                                            <h4 className={styles.settingsSectionTitle}>Gestión de Versiones</h4>
                                            
                                            {/* Add Version Card */}
                                            <div className={styles.settingsCard}>
                                                <div className={styles.cardTitle}>
                                                    <Plus size={20} className="text-[#ffbfba]" />
                                                    Añadir Versión
                                                </div>
                                                <p className={styles.cardDescription}>
                                                    Instala una nueva versión con su cargador de mods preferido.
                                                </p>
                                                
                                                <div className="space-y-6">
                                                    {/* Version Select */}
                                                    <div>
                                                        <label className={styles.inputLabel}>Versión de Minecraft</label>
                                                        <div className="relative">
                                                            <div 
                                                                onClick={() => setIsVersionSelectOpen(!isVersionSelectOpen)}
                                                                className={cn(
                                                                    styles.textInput,
                                                                    "cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors",
                                                                    isVersionSelectOpen ? "border-[#ffbfba] rounded-b-none" : ""
                                                                )}
                                                            >
                                                                <span className="truncate">
                                                                    {versionToAdd 
                                                                        ? `${versionToAdd} ${versions.find((v: any) => v.id === versionToAdd)?.version_type ? `(${versions.find((v: any) => v.id === versionToAdd)?.version_type})` : ''}`
                                                                        : 'Seleccionar versión'}
                                                                </span>
                                                                <ChevronDown size={16} className="text-[#a1a1aa]" />
                                                            </div>
                                                            
                                                            <AnimatePresence>
                                                                {isVersionSelectOpen && (
                                                                    <>
                                                                        <div className="fixed inset-0 z-40" onClick={() => setIsVersionSelectOpen(false)} />
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: -10 }}
                                                                            animate={{ opacity: 1, y: 0 }}
                                                                            exit={{ opacity: 0, y: -10 }}
                                                                            className={cn(
                                                                                "absolute top-full left-0 right-0 bg-[#09090b] rounded-b-xl border-x border-b border-white/10 shadow-2xl max-h-60 overflow-y-auto z-[100] -mt-[1px]",
                                                                                styles.dropdownScrollbar
                                                                            )}
                                                                        >
                                                                            {versions.map((v: any) => (
                                                                                <div
                                                                                    key={v.id}
                                                                                    onClick={() => {
                                                                                        setVersionToAdd(v.id);
                                                                                        setIsVersionSelectOpen(false);
                                                                                    }}
                                                                                    className={cn(
                                                                                        "px-4 py-3 hover:bg-white/5 cursor-pointer text-white text-sm transition-colors flex items-center justify-between",
                                                                                        versionToAdd === v.id ? "bg-white/10 text-[#ffbfba]" : ""
                                                                                    )}
                                                                                >
                                                                                    <span>{v.id}</span>
                                                                                    {v.version_type && (
                                                                                        <span className="text-xs text-white/40 uppercase border border-white/10 px-2 py-0.5 rounded">
                                                                                            {v.version_type}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </motion.div>
                                                                    </>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    </div>

                                                    {/* Mod Loader Select (Only if version selected) */}
                                                    {versionToAdd && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className={styles.inputLabel}>Mod Loader</label>
                                                                <div className="relative">
                                                                    <div 
                                                                        onClick={() => setIsAddVersionLoaderOpen(!isAddVersionLoaderOpen)}
                                                                        className={cn(
                                                                            styles.textInput,
                                                                            "cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors",
                                                                            isAddVersionLoaderOpen ? "border-[#ffbfba] rounded-b-none" : ""
                                                                        )}
                                                                    >
                                                                        <span className="truncate">{addVersionModLoader}</span>
                                                                        <ChevronDown size={16} className="text-[#a1a1aa]" />
                                                                    </div>
                                                                    
                                                                    <AnimatePresence>
                                                                        {isAddVersionLoaderOpen && (
                                                                            <>
                                                                                <div className="fixed inset-0 z-40" onClick={() => setIsAddVersionLoaderOpen(false)} />
                                                                                <motion.div
                                                                                    initial={{ opacity: 0, y: -10 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    exit={{ opacity: 0, y: -10 }}
                                                                                    className={cn(
                                                                                        "absolute top-full left-0 right-0 bg-[#09090b] rounded-b-xl border-x border-b border-white/10 shadow-2xl z-[100] -mt-[1px]",
                                                                                        styles.dropdownScrollbar
                                                                                    )}
                                                                                >
                                                                                    {['Vanilla', 'Forge', 'Fabric', 'Quilt', 'NeoForge'].map((loader) => (
                                                                                        <div
                                                                                            key={loader}
                                                                                            onClick={() => {
                                                                                                setAddVersionModLoader(loader);
                                                                                                setIsAddVersionLoaderOpen(false);
                                                                                            }}
                                                                                            className={cn(
                                                                                                "px-4 py-3 hover:bg-white/5 cursor-pointer text-white text-sm transition-colors",
                                                                                                addVersionModLoader === loader ? "bg-white/10 text-[#ffbfba]" : ""
                                                                                            )}
                                                                                        >
                                                                                            {loader}
                                                                                        </div>
                                                                                    ))}
                                                                                </motion.div>
                                                                            </>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            </div>

                                                            {addVersionModLoader !== 'Vanilla' && (
                                                                <div>
                                                                    <label className={styles.inputLabel}>Versión del Loader</label>
                                                                    <div className="relative">
                                                                        <div 
                                                                            onClick={() => setIsAddVersionLoaderVersionOpen(!isAddVersionLoaderVersionOpen)}
                                                                            className={cn(
                                                                                styles.textInput,
                                                                                "cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors",
                                                                                isAddVersionLoaderVersionOpen ? "border-[#ffbfba] rounded-b-none" : ""
                                                                            )}
                                                                        >
                                                                            <span className="truncate">{addVersionLoaderVersion || "Seleccionar"}</span>
                                                                            <ChevronDown size={16} className="text-[#a1a1aa]" />
                                                                        </div>
                                                                        
                                                                        <AnimatePresence>
                                                                            {isAddVersionLoaderVersionOpen && (
                                                                                <>
                                                                                    <div className="fixed inset-0 z-40" onClick={() => setIsAddVersionLoaderVersionOpen(false)} />
                                                                                    <motion.div
                                                                                        initial={{ opacity: 0, y: -10 }}
                                                                                        animate={{ opacity: 1, y: 0 }}
                                                                                        exit={{ opacity: 0, y: -10 }}
                                                                                        className={cn(
                                                                                            "absolute top-full left-0 right-0 bg-[#09090b] rounded-b-xl border-x border-b border-white/10 shadow-2xl max-h-60 overflow-y-auto z-[100] -mt-[1px]",
                                                                                            styles.dropdownScrollbar
                                                                                        )}
                                                                                    >
                                                                                        {availableAddVersionLoaders.map((v: any) => (
                                                                                            <div
                                                                                                key={v.version}
                                                                                                onClick={() => {
                                                                                                    setAddVersionLoaderVersion(v.version);
                                                                                                    setIsAddVersionLoaderVersionOpen(false);
                                                                                                }}
                                                                                                className={cn(
                                                                                                    "px-4 py-3 hover:bg-white/5 cursor-pointer text-white text-sm transition-colors flex justify-between items-center",
                                                                                                    addVersionLoaderVersion === v.version ? "bg-white/10 text-[#ffbfba]" : ""
                                                                                                )}
                                                                                            >
                                                                                                <span>{v.version}</span>
                                                                                                {v.stable && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Stable</span>}
                                                                                            </div>
                                                                                        ))}
                                                                                        {availableAddVersionLoaders.length === 0 && (
                                                                                            <div className="px-4 py-3 text-white/50 text-sm">No hay versiones disponibles</div>
                                                                                        )}
                                                                                    </motion.div>
                                                                                </>
                                                                            )}
                                                                        </AnimatePresence>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <button 
                                                        onClick={handleAddVersion}
                                                        disabled={!versionToAdd || (addVersionModLoader !== 'Vanilla' && !addVersionLoaderVersion)}
                                                        className={cn(styles.actionButton, styles.primaryButton)}
                                                    >
                                                        <Plus size={20} />
                                                        Instalar y Usar
                                                    </button>
                                                </div>
                                            </div>



                                            {/* Installed Versions Card */}
                                            <div className={styles.settingsCard}>
                                                <div className={styles.cardTitle}>
                                                    <Box size={20} className="text-[#ffbfba]" />
                                                    Versiones Instaladas
                                                </div>
                                                <p className={styles.cardDescription}>
                                                    Gestiona las versiones de Minecraft instaladas.
                                                </p>

                                                <div className="space-y-3">
                                                    {(activeInstance?.versions || [activeInstance?.version]).map((v) => (
                                                        <div key={v} className="flex items-center justify-between p-4 bg-[#18181b] rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-lg bg-[#27272a] flex items-center justify-center text-[#ffbfba]">
                                                                    <Box size={20} />
                                                                </div>
                                                                <div>
                                                                    <span className="text-white font-bold block">{v}</span>
                                                                    {v === (activeInstance?.selectedVersion || activeInstance?.version) && (
                                                                        <span className="text-xs text-green-400 font-medium">Versión Activa</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {(activeInstance?.versions || []).length > 1 && (
                                                                <button 
                                                                    onClick={() => handleRemoveVersion(v)}
                                                                    className="p-3 hover:bg-red-500/10 text-[#a1a1aa] hover:text-red-400 rounded-lg transition-colors"
                                                                    title="Eliminar versión"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Background Selector Modal */}
                <AnimatePresence>
                    {showBackgroundSelector && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-12"
                        >
                            <div className="bg-[#1a1a1a] w-full h-full rounded-b-2xl border border-white/10 flex flex-col overflow-hidden">
                                <div className="custom-modal-header border-b border-white/10 flex items-center justify-between bg-[#1a1a1a]">
                                    <h3 className="text-xl font-bold text-white">Seleccionar Fondo</h3>
                                    <button 
                                        onClick={() => setShowBackgroundSelector(false)}
                                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                        {BACKGROUNDS.map((bg) => (
                                            <div 
                                                key={bg}
                                                onClick={() => handleUpdateBackground(bg)}
                                                className={cn(
                                                    "h-40 w-full rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 hover:z-10 relative",
                                                    activeInstance?.backgroundImage === bg ? "border-green-500" : "border-transparent hover:border-white/50"
                                                )}
                                            >
                                                <img 
                                                    src={`/assets/thumbnails/${bg}`} 
                                                    alt={bg}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Create Instance Modal */}
                <AnimatePresence key="modal2">
                    <CreateInstanceModal 
                        isOpen={showCreateModal} 
                        onClose={() => setShowCreateModal(false)} 
                    />
                </AnimatePresence>

                {/* Delete Confirmation Modal */}
                <AnimatePresence>
                    {showDeleteConfirm && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-12"
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-[#1a1a1a] w-full max-w-md rounded-xl border border-white/10 flex flex-col overflow-hidden shadow-2xl"
                            >
                                <div className={cn("flex flex-col gap-8", styles.deleteConfirmContent)}>
                                    <div className="text-center space-y-4">
                                        <h3 className="text-2xl font-bold text-white">¿Eliminar Instancia?</h3>
                                        <p className="text-[#a1a1aa] text-lg leading-relaxed">
                                            Esta acción no se puede deshacer. Se eliminarán todos los datos de la instancia 
                                            <span className="text-white font-bold"> {activeInstance?.name}</span>.
                                        </p>
                                    </div>
                                    
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 h-14 rounded-lg bg-[#27272a] text-white hover:bg-[#3f3f46] transition-colors font-medium"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={confirmDeleteInstance}
                                            className="flex-1 h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg font-bold transition-all"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Toast Notification */}
                <AnimatePresence>
                    {toastMessage && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 text-white px-6 py-3 rounded-xl shadow-2xl z-[60] flex items-center gap-3"
                        >
                            <Check size={20} className="text-green-400" />
                            <span className="font-medium">{toastMessage}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Home;





