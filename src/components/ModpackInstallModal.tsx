import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Loader2, AlertCircle, Package, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join, appCacheDir, homeDir } from '@tauri-apps/api/path';
import { useLauncherStore } from '@/stores/launcherStore';
import styles from './ModpackInstallModal.module.css';

// Force re-render
const TIMESTAMP = Date.now();

const getFileNameFromUrl = (url: string) => {
    try {
        const cleanUrl = url.split('?')[0];
        const name = cleanUrl.split('/').pop();
        return name ? decodeURIComponent(name) : 'download.zip';
    } catch (e) {
        return 'download.zip';
    }
};

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

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder = "Select...", disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const updatePosition = () => {
                if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    setCoords({
                        top: rect.bottom + 4,
                        left: rect.left,
                        width: rect.width
                    });
                }
            };
            
            updatePosition();
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
            
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
            };
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current && 
                !containerRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

    return (
        <div className="relative" ref={containerRef}>
            <div 
                className={`${styles.filterSelect} flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
                <span className="truncate" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '8px' }}>
                    {selectedLabel}
                </span>
                <ChevronDown 
                    size={16} 
                    className="text-white/50 transition-transform duration-200" 
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }} 
                />
            </div>

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            ref={dropdownRef}
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.1 }}
                            className="fixed z-[9999] bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl overflow-y-auto"
                            style={{ 
                                position: 'fixed',
                                top: coords.top,
                                left: coords.left,
                                width: coords.width,
                                backgroundColor: '#18181b', 
                                borderColor: '#27272a', 
                                borderWidth: '1px', 
                                borderStyle: 'solid',
                                borderRadius: '0.5rem',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                                maxHeight: '15rem',
                                overflowY: 'auto',
                                zIndex: 9999
                            }}
                        >
                            {options.length === 0 ? (
                                <div className="p-3 text-sm text-zinc-500 text-center" style={{ padding: '0.75rem', color: '#71717a', textAlign: 'center', fontSize: '0.875rem' }}>
                                    No options
                                </div>
                            ) : (
                                options.map((opt) => (
                                    <div
                                        key={opt.value}
                                        className="px-4 py-2 text-sm cursor-pointer hover:bg-[#27272a] transition-colors"
                                        style={{ 
                                            padding: '0.5rem 1rem', 
                                            fontSize: '0.875rem', 
                                            cursor: 'pointer',
                                            backgroundColor: value === opt.value ? '#27272a' : 'transparent',
                                            color: value === opt.value ? 'white' : '#e4e4e7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                        }}
                                        onMouseEnter={(e) => {
                                            if (value !== opt.value) e.currentTarget.style.backgroundColor = '#27272a';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (value !== opt.value) e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <span>{opt.label}</span>
                                        {value === opt.value && <Check size={14} className="text-[#ffbfba]" />}
                                    </div>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

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
    
    // Refs for cancellation and cleanup
    const abortRef = useRef(false);
    const instanceIdRef = useRef<string | null>(null);
    const tempDirRef = useRef<string | null>(null);
    
    // Ref to track if we are currently downloading a large file to show detailed progress
    const isDownloadingRef = useRef(false);
    
    // Refs for parallel download progress tracking
    const fileProgressRef = useRef<Map<string, number>>(new Map());
    const totalFilesRef = useRef(0);

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
                    const payload = event.payload as any;
                    let progressValue = 0;
                    let id = null;

                    // Handle both old (number) and new (object) formats
                    if (typeof payload === 'number') {
                        progressValue = payload;
                    } else if (payload && typeof payload === 'object') {
                        progressValue = payload.progress;
                        id = payload.id;
                    }

                    if (id && totalFilesRef.current > 1) {
                        fileProgressRef.current.set(id, progressValue);
                        
                        let totalProgress = 0;
                        // Sum up progress of all tracked files
                        // We iterate over the known IDs we expect (initialized in the loop)
                        // or just iterate the map values if we trust it contains all.
                        // Better to iterate the map values.
                        for (const val of fileProgressRef.current.values()) {
                            totalProgress += val;
                        }
                        
                        const average = totalProgress / totalFilesRef.current;
                        setProgress(Math.round(average));
                    } else {
                        // Single file or no ID
                        setProgress(Math.round(progressValue));
                    }
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
            
            // Cleanup temp dir if it exists (e.g. closed after error)
            if (tempDirRef.current) {
                invoke('remove_dir', { path: tempDirRef.current }).catch(e => console.warn("Cleanup on close failed", e));
                tempDirRef.current = null;
            }

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
        if (modpack && modpack.preSelectedVersion && versions.length > 0) {
             const preId = modpack.preSelectedVersion.id;
             const match = versions.find(v => {
                 if (modpack.source === 'modrinth') return v.id === preId;
                 if (modpack.source === 'porcos') return v.version === preId;
                 return v.id === preId;
             });
             
             if (match) {
                 setSelectedVersion(match);
                 return;
             }
        }

        if (filteredVersions.length > 0) {
            setSelectedVersion(filteredVersions[0]);
        } else {
            setSelectedVersion(null);
        }
    }, [filterGameVersion, filterLoader, versions, modpack]);

    const { removeInstance } = useLauncherStore();

    const handleCancel = async () => {
        if (!isInstalling) return;
        abortRef.current = true;
        setInstallStage("Cancelando y limpiando...");
        await performCleanup();
    };

    const performCleanup = async () => {
        console.log("Performing cleanup...");
        try {
            // Delete instance
            if (instanceIdRef.current) {
                await invoke('delete_instance', { id: instanceIdRef.current });
                removeInstance(instanceIdRef.current);
            }
            
            // Delete temp dir if we tracked it
            if (tempDirRef.current) {
                console.log("Deleting temp dir:", tempDirRef.current);
                await invoke('remove_dir', { path: tempDirRef.current });
                tempDirRef.current = null;
            }
            
        } catch (e) {
            console.error("Cleanup failed", e);
        }
        onClose();
    };

    const handleInstall = async () => {
        if (!selectedVersion) return;
        setIsInstalling(true);
        setError(null);
        
        // Reset refs
        abortRef.current = false;
        instanceIdRef.current = null;
        tempDirRef.current = null;
        
        try {
            // 1. Prepare Paths
            const cacheDir = await appCacheDir();
            // Use a unique temp directory for each install to avoid conflicts
            const tempDir = await join(cacheDir, 'temp_modpacks', Date.now().toString());
            tempDirRef.current = tempDir;
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
                
                if (abortRef.current) throw new Error("CANCELLED");

                // 1. Create Instance FIRST (using target version metadata)
                setInstallStage('Creando instancia...');
                
                let iconPath = null;
                if (modpack.icon) {
                     const iconFileName = `icon_${modpack.id}.png`;
                     const tempIconPath = await join(tempDir, iconFileName);
                     await invoke('download_file', { url: modpack.icon, path: tempIconPath });
                     iconPath = tempIconPath;
                }
                
                if (abortRef.current) throw new Error("CANCELLED");
                
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
                
                // Track instance ID for cleanup
                instanceIdRef.current = newInstance.id;

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
                    newInstance.modLoader = undefined;
                    newInstance.modLoaderVersion = undefined;
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
                
                if (abortRef.current) throw new Error("CANCELLED");

                // 2. Install Versions Sequentially
                for (let vIndex = 0; vIndex < versionsToInstall.length; vIndex++) {
                    if (abortRef.current) throw new Error("CANCELLED");
                    
                    const ver = versionsToInstall[vIndex];
                    setInstallStage(`Instalando versión ${ver.version} (${vIndex + 1}/${versionsToInstall.length})...`);
                    
                    // Download
                    const downloadUrls = [];
                    if (ver.downloadUrl) downloadUrls.push(ver.downloadUrl);
                    
                    // Dynamically check for downloadUrl2, downloadUrl3, etc. without limit
                    let urlIndex = 2;
                    while (ver[`downloadUrl${urlIndex}`]) {
                        downloadUrls.push(ver[`downloadUrl${urlIndex}`]);
                        urlIndex++;
                    }
                    
                    const zipPaths = [];
                    
                    setInstallStage(`Descargando archivos de versión ${ver.version}...`);
                    
                    const totalDownloads = downloadUrls.length;
                    let completedDownloads = 0;

                    // Enable detailed progress
                    isDownloadingRef.current = true;
                    setProgress(0);
                    
                    // Setup parallel progress tracking
                    totalFilesRef.current = totalDownloads;
                    fileProgressRef.current.clear();
                    // Initialize with 0
                    downloadUrls.forEach((_, i) => fileProgressRef.current.set(`file_${i}`, 0));
                    
                    const downloadPromises = downloadUrls.map(async (url, i) => {
                        if (abortRef.current) return null;
                        
                        let fileName;
                        
                        // If we have multiple downloads, assume it's a split archive and force naming
                        if (downloadUrls.length > 1) {
                            // Try to guess extension from URL, default to rar for split archives
                            let ext = 'rar';
                            if (url.toLowerCase().includes('.zip')) ext = 'zip';
                            else if (url.toLowerCase().includes('.7z')) ext = '7z';
                            
                            // Pad the part number: part01, part02... unrar likes this sometimes, but part1 is usually fine.
                            // Let's use part1, part2.
                            fileName = `modpack_install.part${i+1}.${ext}`;
                        } else {
                            fileName = getFileNameFromUrl(url);
                            if (!fileName || fileName === 'download.zip') {
                                 const ext = url.split('.').pop()?.split('?')[0] || 'zip';
                                 fileName = `install_${ver.version}.${ext}`;
                            }
                        }

                        const filePath = await join(tempDir, fileName);
                        const fileId = `file_${i}`;
                        
                        await invoke('download_file', { url, path: filePath, id: fileId });
                        
                        if (totalDownloads > 1) {
                            completedDownloads++;
                            // Progress is updated by event listener
                            setInstallStage(`Descargando archivos (${completedDownloads}/${totalDownloads})...`);
                        }
                        
                        return filePath;
                    });
                    
                    const paths = await Promise.all(downloadPromises);
                    isDownloadingRef.current = false;
                    
                    if (abortRef.current) throw new Error("CANCELLED");
                    
                    // Filter out nulls from cancelled promises
                    const validPaths = paths.filter(p => p !== null) as string[];
                    zipPaths.push(...validPaths);
                    
                    // Extract
                    for (const zipPath of zipPaths) {
                        if (abortRef.current) throw new Error("CANCELLED");
                        
                        // Skip secondary RAR volumes
                        const lowerName = zipPath.toLowerCase();
                        if (lowerName.endsWith('.rar')) {
                             const partMatch = lowerName.match(/\.part(\d+)\.rar$/);
                             if (partMatch) {
                                 const partNum = parseInt(partMatch[1]);
                                 if (partNum > 1) {
                                     console.log(`Skipping extraction of secondary volume: ${zipPath}`);
                                     continue;
                                 }
                             }
                        }

                        setInstallStage(`Extrayendo archivos...`);
                        // extract_zip now handles .rar via unrar crate
                        const skipFiles = [
                            "servers.dat",
                            "instance.json",
                            "instance_info.json",
                            "porcos.json"
                        ];
                        await invoke('extract_zip', { 
                            zipPath, 
                            targetDir: instancePath,
                            skipFiles: skipFiles
                        });
                    }

                    // Check for nested folder structure and flatten if necessary
                    // We check ALL subdirectories to see if they contain 'mods' or 'config'
                    // This handles multi-part installs where subsequent parts might re-introduce nested folders
                    console.log(`[Install] Checking for nested folders in ${instancePath}`);
                    const files = await invoke('list_files', { path: instancePath }) as any[];
                    const dirs = files.filter((f: any) => f.is_dir);
                    
                    for (const dir of dirs) {
                         const subDirPath = await join(instancePath, dir.name);
                         
                         // Check for common Minecraft folders to identify a nested root
                         const indicators = ['mods', 'config', 'saves', 'resourcepacks', 'options.txt'];
                         let isNestedRoot = false;
                         
                         for (const indicator of indicators) {
                             const checkPath = await join(subDirPath, indicator);
                             if (await invoke('file_exists', { path: checkPath })) {
                                 isNestedRoot = true;
                                 break;
                             }
                         }
                         
                         if (isNestedRoot) {
                             console.log(`[Install] Found nested root in ${dir.name}, merging...`);
                             setInstallStage(`Reorganizando archivos (${dir.name})...`);
                             
                             try {
                                await invoke('merge_dir', { 
                                    source: subDirPath, 
                                    target: instancePath,
                                    skipFiles: ['porcos.json', 'instance_info.json', 'instance.json']
                                });
                                await invoke('remove_dir', { path: subDirPath });
                                console.log(`[Install] Merged ${dir.name} successfully`);
                             } catch (e) {
                                 console.warn(`[Install] Failed to merge ${dir.name}:`, e);
                             }
                         }
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
                
                // Cleanup temp dir
                if (tempDirRef.current) {
                    try {
                        await invoke('remove_dir', { path: tempDirRef.current });
                        console.log("Temp dir cleaned up");
                        tempDirRef.current = null;
                    } catch (e) {
                        console.warn("Failed to clean up temp dir", e);
                    }
                }

                setInstallStage('Finalizando...');
                setProgress(100);
                setTimeout(() => {
                    if (!abortRef.current) {
                        setIsSuccess(true);
                        setIsInstalling(false);
                    }
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

            if (abortRef.current) throw new Error("CANCELLED");

            // 2. Download
            setInstallStage('Descargando modpack...');
            isDownloadingRef.current = true;
            totalFilesRef.current = 1;
            setProgress(0);
            await invoke('download_file', { url: downloadUrl, path: zipPath });
            isDownloadingRef.current = false;
            
            if (abortRef.current) throw new Error("CANCELLED");

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
                    console.log("Found loader in manifest:", loaderObj.id);
                    const parts = loaderObj.id.split('-');
                    modLoader = parts[0];
                    modLoaderVersion = parts.slice(1).join('-');
                    
                    // Fix: Strip MC version if present in loader version (e.g. forge-1.20.1-47.4.0 -> 47.4.0)
                    if (modLoaderVersion.startsWith(mcVersion + '-')) {
                        console.log("Stripping MC version from loader version");
                        modLoaderVersion = modLoaderVersion.substring(mcVersion.length + 1);
                    }
                    console.log("Parsed loader:", modLoader, "Version:", modLoaderVersion);
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

            // --- VALIDATION OF MOD LOADER VERSION ---
            if (modLoader.toLowerCase() === 'forge') {
                try {
                    setInstallStage('Validando versión de Forge...');
                    const validVersions = await invoke('get_forge_versions', { minecraftVersion: mcVersion }) as any[];
                    
                    // Check if the requested version exists in the valid list
                    const isValid = validVersions.some(v => v.version === modLoaderVersion);
                    
                    if (!isValid) {
                        console.warn(`Forge version ${modLoaderVersion} not found for MC ${mcVersion}. Attempting to find replacement...`);
                        
                        // Strategy 1: Try to find a version with the same major.minor (e.g. 47.1)
                        // modLoaderVersion might be "47.1.39"
                        const parts = modLoaderVersion.split('.');
                        if (parts.length >= 2) {
                            const prefix = `${parts[0]}.${parts[1]}`; // "47.1"
                            const replacement = validVersions.find(v => v.version.startsWith(prefix));
                            
                            if (replacement) {
                                console.log(`Replacing invalid version ${modLoaderVersion} with closest match ${replacement.version}`);
                                modLoaderVersion = replacement.version;
                            } else {
                                // Strategy 2: Fallback to latest valid version
                                if (validVersions.length > 0) {
                                    console.log(`Replacing invalid version ${modLoaderVersion} with latest ${validVersions[0].version}`);
                                    modLoaderVersion = validVersions[0].version;
                                }
                            }
                        } else if (validVersions.length > 0) {
                             // Fallback to latest
                             console.log(`Replacing invalid version ${modLoaderVersion} with latest ${validVersions[0].version}`);
                             modLoaderVersion = validVersions[0].version;
                        }
                    }
                } catch (e) {
                    console.error("Failed to validate Forge version", e);
                    // If validation fails (e.g. network error), we proceed with the original version
                    // and hope for the best.
                }
            }
            // ----------------------------------------

            if (abortRef.current) throw new Error("CANCELLED");

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
            
            instanceIdRef.current = newInstance.id;

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
                newInstance.modLoader = undefined;
                newInstance.modLoaderVersion = undefined;
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
            
            if (abortRef.current) throw new Error("CANCELLED");

            // 5. Install Mods
            setInstallStage(`Instalando ${modList.length} mods...`);
            
            const installedModsTracker: any[] = [];

            // Process mods in chunks to avoid rate limits
            const chunkSize = 20;
            for (let i = 0; i < modList.length; i += chunkSize) {
                if (abortRef.current) throw new Error("CANCELLED");
                
                const chunk = modList.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (mod) => {
                    if (abortRef.current) return;
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
            
            // Cleanup temp dir
            if (tempDirRef.current) {
                try {
                    await invoke('remove_dir', { path: tempDirRef.current });
                    console.log("Temp dir cleaned up");
                    tempDirRef.current = null;
                } catch (e) {
                    console.warn("Failed to clean up temp dir", e);
                }
            }

            setInstallStage('Finalizando...');
            setProgress(100);
            
            setTimeout(() => {
                if (!abortRef.current) {
                    setIsSuccess(true);
                    setIsInstalling(false);
                }
            }, 1000);

        } catch (e: any) {
            if (e.message === "CANCELLED" || abortRef.current) {
                console.log("Installation cancelled by user");
                await performCleanup();
            } else {
                console.error("Installation failed", e);
                setError(e.message || "Error desconocido durante la instalación");
                setIsInstalling(false);
            }
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
                                            <CustomSelect 
                                                value={filterGameVersion}
                                                onChange={setFilterGameVersion}
                                                options={availableGameVersions.map(v => ({ value: v, label: v }))}
                                                placeholder="Todas las versiones"
                                            />
                                        </div>
                                        <div className={styles.filterGroup}>
                                            <label className={styles.filterLabel}>Modloader</label>
                                            <CustomSelect 
                                                value={filterLoader}
                                                onChange={setFilterLoader}
                                                options={availableLoaders.map(l => ({ value: l, label: l }))}
                                                placeholder="Todos los loaders"
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.versionList}>
                                        <label className={styles.filterLabel} style={{ marginBottom: '0.5rem', display: 'block' }}>Versión a Instalar</label>
                                        {filteredVersions.length === 0 ? (
                                            <div className={styles.emptyState}>
                                                No hay versiones compatibles con los filtros seleccionados.
                                            </div>
                                        ) : (
                                            <CustomSelect
                                                value={selectedVersion ? (modpack.source === 'modrinth' ? selectedVersion.id : (modpack.source === 'porcos' ? selectedVersion.version : selectedVersion.id)) : ''}
                                                onChange={(val) => {
                                                    const v = filteredVersions.find((ver: any) => (modpack.source === 'modrinth' ? ver.id : (modpack.source === 'porcos' ? ver.version : ver.id)).toString() === val);
                                                    setSelectedVersion(v);
                                                }}
                                                options={filteredVersions.map((v: any) => {
                                                    const id = modpack.source === 'modrinth' ? v.id : (modpack.source === 'porcos' ? v.version : v.id);
                                                    const name = modpack.source === 'modrinth' ? v.name : (modpack.source === 'porcos' ? v.version : v.displayName);
                                                    const gameVersions = modpack.source === 'modrinth' ? v.game_versions.join(', ') : (modpack.source === 'porcos' ? v.minecraftVersion : v.gameVersions.join(', '));
                                                    
                                                    return {
                                                        value: id.toString(),
                                                        label: `${name} - Minecraft ${gameVersions}`
                                                    };
                                                })}
                                                placeholder="Selecciona una versión"
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!isSuccess && (
                    <div className={styles.footer}>
                        {isInstalling ? (
                            <button 
                                onClick={handleCancel}
                                className={styles.cancelButton}
                                style={{ width: '100%', justifyContent: 'center' }}
                            >
                                Cancelar Instalación
                            </button>
                        ) : (
                            <>
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
                            </>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default ModpackInstallModal;
