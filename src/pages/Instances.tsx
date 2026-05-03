import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Trash2, Loader2, Search, Box, Cpu, ChevronDown, Check, AlertCircle, SearchX } from 'lucide-react';
import { useLauncherStore, Instance, getCachedImages } from '@/stores/launcherStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { parseVersion } from '@/lib/versionParser';
import styles from './Instances.module.css';
import CreateInstanceModal from '@/components/CreateInstanceModal';
import InstanceDetails from '@/components/InstanceDetails';
import InstanceSettings from '@/components/InstanceSettings';

const DEFAULT_BG = '/assets/thumbnails/1353838.png';

interface InstanceCardProps {
    instance: Instance;
    index: number;
    onClick: (instance: Instance) => void;
    onPlay: (e: React.MouseEvent, instance: Instance) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onUpdate: (id: string, updates: Partial<Instance>) => void;
    isLaunching: boolean;
}

const InstanceCard: React.FC<InstanceCardProps> = React.memo(({ instance, index, onClick, onPlay, onDelete, onUpdate, isLaunching }) => {
    const { t } = useI18n();
    // Get cached images from global store
    const cached = getCachedImages(instance.id);
    const [iconSrc, setIconSrc] = useState(cached.icon || "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
    const [bgSrc, setBgSrc] = useState<string>(cached.thumbnail || DEFAULT_BG);
    const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

    const handleVersionChange = async (version: string) => {
        // Check if it's a complex version
        const parsed = parseVersion(version);
        let newModLoader = instance.modLoader;
        let newModLoaderVersion = instance.modLoaderVersion;

        if (parsed.loader) {
            // It's a complex version, update global state to match
            newModLoader = parsed.loader;
            newModLoaderVersion = parsed.loaderVersion;
        } else {
            // It's a simple version.
            // Assume Vanilla if no suffix, unless it's the exact same string as current (which implies no change)
            const currentVersionString = instance.selectedVersion || instance.version;

            if (version === currentVersionString) {
                newModLoader = instance.modLoader;
                newModLoaderVersion = instance.modLoaderVersion;
            } else {
                newModLoader = undefined;
                newModLoaderVersion = undefined;
            }
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("update_instance", {
                id: instance.id,
                selectedVersion: version,
                modLoader: newModLoader || null,
                modLoaderVersion: newModLoaderVersion || null
            });

            onUpdate(instance.id, {
                selectedVersion: version,
                modLoader: newModLoader,
                modLoaderVersion: newModLoaderVersion
            });
        } catch (e) {
            console.error("Failed to update instance version change", e);
        }
    };

    // Sync with cached images when instance changes (NOT when imageCacheVersion changes globally)
    useEffect(() => {
        const cached = getCachedImages(instance.id);
        if (cached.icon) setIconSrc(cached.icon);
        if (cached.thumbnail) setBgSrc(cached.thumbnail);
    }, [instance.id, instance.icon, instance.backgroundImage]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={styles.card}
            onClick={() => onClick(instance)}
        >
            {/* Image Area */}
            <div className={styles.cardImageArea}>
                <img src={bgSrc} className={styles.cardBg} alt="" />
                <div className={styles.cardOverlay} />
            </div>

            {/* Body */}
            <div className={styles.cardBody}>
                <div className={styles.cardHeader}>
                    {/* Icon floating */}
                    <div className={styles.cardIcon}>
                        <img src={iconSrc} alt="" />
                    </div>

                    <div className={styles.cardInfo}>
                        <h3 className={styles.cardTitle} title={instance.name}>{instance.name}</h3>
                        <div className={styles.cardMeta}>
                            <div
                                className={cn(styles.loaderBadge, "relative cursor-pointer hover:bg-white/10 transition-colors")}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if ((instance.versions || []).length > 1) {
                                        setIsVersionDropdownOpen(!isVersionDropdownOpen);
                                    }
                                }}
                            >
                                <Box size={12} />
                                <span>{instance.selectedVersion || instance.version}</span>
                                {(instance.versions || []).length > 1 && <ChevronDown size={12} className="ml-1 opacity-50" />}

                                <AnimatePresence>
                                    {isVersionDropdownOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVersionDropdownOpen(false); }} />
                                            <motion.div
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className={styles.versionDropdown}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {(instance.versions || [instance.version]).map((v) => (
                                                    <div
                                                        key={v}
                                                        onClick={() => {
                                                            handleVersionChange(v);
                                                            setIsVersionDropdownOpen(false);
                                                        }}
                                                        className={cn(
                                                            styles.versionDropdownItem,
                                                            (instance.selectedVersion || instance.version) === v ? styles.versionDropdownItemActive : ""
                                                        )}
                                                    >
                                                        <span className="truncate">{v}</span>
                                                        {(instance.selectedVersion || instance.version) === v && <Check size={14} />}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                            {instance.modLoader && (
                                <div className={styles.loaderBadge}>
                                    <Cpu size={12} />
                                    <span className="capitalize">{instance.modLoader}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className={styles.cardFooter}>
                    <button
                        className={styles.playButton}
                        onClick={(e) => onPlay(e, instance)}
                        disabled={isLaunching}
                    >
                        {isLaunching ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                        {t('play')}
                    </button>
                    <button
                        className={styles.deleteButton}
                        onClick={(e) => onDelete(e, instance.id)}
                        title={t('deleteInstance')}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
        </motion.div>
    );
});

const Instances: React.FC = () => {
    const { t } = useI18n();

    // Individual selectors to prevent unnecessary re-renders
    const instances = useLauncherStore(state => state.instances);
    const versions = useLauncherStore(state => state.versions);
    const isLaunching = useLauncherStore(state => state.isLaunching);
    const launchStage = useLauncherStore(state => state.launchStage);
    const launchProgress = useLauncherStore(state => state.launchProgress);
    const memoryMin = useLauncherStore(state => state.memoryMin);
    const memoryMax = useLauncherStore(state => state.memoryMax);

    // Setters (don't cause re-renders)
    const { removeInstance, setInstances, updateInstance, setVersions, setIsLaunching, addLog, setSelectedInstance, setLaunchStartTime, setLaunchStage, setLaunchProgress } = useLauncherStore();

    const { user } = useAuthStore();

    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [viewingInstance, setViewingInstance] = React.useState<Instance | null>(null);
    const [viewingSettingsInstance, setViewingSettingsInstance] = React.useState<Instance | null>(null);
    const [toastMessage, setToastMessage] = React.useState<string | null>(null);
    const [toastType, setToastType] = React.useState<'success' | 'error'>('success');

    React.useEffect(() => {
        loadData();
    }, []);

    // Event listeners for launch progress
    const maxProgressRef = React.useRef(0);

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
                        // Java download progress doesn't affect maxProgressRef
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

    const loadData = async () => {
        try {
            const { invoke } = await import("@tauri-apps/api/core");

            if (versions.length === 0) {
                const versionList = await invoke("get_available_versions");
                setVersions(versionList as any[]);
            }

            const backendInstances = await invoke("get_instances") as Instance[];
            
            // Map of local instances for quick lookup
            const localMap = new Map(instances.map(i => [i.id, i]));

            // MIGRATION: Fix legacy instances where modded versions are stored as simple strings
            for (const inst of backendInstances) {
                if (inst.modLoader && inst.versions) {
                    const localInst = localMap.get(inst.id);
                    const activeVer = localInst?.selectedVersion || inst.version;
                    
                    if (activeVer && !activeVer.includes('(')) {
                            const complexVer = `${activeVer} (${inst.modLoader} ${inst.modLoaderVersion || ''})`.trim().replace(/\s+\)/, ')');
                            
                            if (inst.versions.includes(activeVer) && !inst.versions.includes(complexVer)) {
                                const newVersions = inst.versions.map(v => v === activeVer ? complexVer : v);
                                inst.versions = newVersions;
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
                    
                    let selVer = localInst.selectedVersion || fresh.version;
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
            
            // 2. Add new instances (created externally or not in local store yet)
            backendMap.forEach(inst => {
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
            const currentSelected = useLauncherStore.getState().selectedInstance;
            if (currentSelected) {
                const updated = newOrderedInstances.find(i => i.id === currentSelected.id);
                if (updated && (
                    updated.selectedVersion !== currentSelected.selectedVersion || 
                    JSON.stringify(updated.versions) !== JSON.stringify(currentSelected.versions)
                )) {
                    setSelectedInstance(updated);
                }
            }

        } catch (error) {
            console.error("Failed to load data:", error);
        }
    };

    const [instanceToDelete, setInstanceToDelete] = React.useState<string | null>(null);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const handleDeleteInstance = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setInstanceToDelete(id);
    };

    const confirmDelete = async () => {
        if (!instanceToDelete) return;
        setIsDeleting(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("delete_instance", { id: instanceToDelete });
            removeInstance(instanceToDelete);
            setInstanceToDelete(null);
            setToastType('success');
            setToastMessage(t('instanceDeleted'));
            setTimeout(() => setToastMessage(null), 3000);
        } catch (error) {
            console.error("Failed to delete instance:", error);
            setToastType('error');
            setToastMessage(t('deleteError', { error: String(error) }));
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredInstances = React.useMemo(() =>
        instances.filter(instance =>
            instance.name.toLowerCase().includes(searchTerm.toLowerCase())
        ),
        [instances, searchTerm]
    );

    const handlePlayInstance = async (e: React.MouseEvent, instance: Instance) => {
        e.stopPropagation();
        if (!user || isLaunching) return;

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
                    
                    if (data.modpacks) {
                        const versionsArr = data.modpacks.filter((mp: any) => mp.id === porcosData.id);
                        versionsArr.sort((a: any, b: any) => a.version.localeCompare(b.version, undefined, { numeric: true }));
                        
                        const currentIndex = versionsArr.findIndex((v: any) => v.version === porcosData.version);
                        
                        if (currentIndex !== -1 && currentIndex < versionsArr.length - 1) {
                            const updates = versionsArr.slice(currentIndex + 1);
                            const cacheDir = await appCacheDir();
                            const tempDir = await join(cacheDir, 'temp_updates');
                            
                            for (const update of updates) {
                                setLaunchStage(t('updatingToVersion', { version: update.version }));
                                addLog(`Applying update ${update.version}...`);
                                
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
                                
                                const skipFiles = ["servers.dat"];
                                for (const zipPath of zipPaths) {
                                    await invoke('extract_zip', { 
                                        zipPath, 
                                        targetDir: instancePath,
                                        skipFiles: skipFiles
                                    });
                                }
                                
                                if (update.filesToDelete && Array.isArray(update.filesToDelete)) {
                                    for (const fileToDelete of update.filesToDelete) {
                                        const fullPath = await join(instancePath, fileToDelete);
                                        if (await invoke('file_exists', { path: fullPath })) {
                                            await invoke('delete_file', { path: fullPath });
                                        }
                                    }
                                }
                                
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

        const parsedLaunch = parseVersion(versionString);
        let versionToPlay = parsedLaunch.mcVersion;
        let loaderToUse = parsedLaunch.loader || instance.modLoader;
        let loaderVersionToUse = parsedLaunch.loaderVersion || instance.modLoaderVersion;

        if (parsedLaunch.loader) {
            console.log(`[Launch] Detected complex version: MC=${versionToPlay}, Loader=${loaderToUse}, Ver=${loaderVersionToUse}`);
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join, appDataDir } = await import("@tauri-apps/api/path");
            
            const instancePath = await invoke("get_instance_path", { id: instance.id });
            addLog(`Instance path: ${instancePath}`);

            // Determine Java version
            setLaunchStage(t('checkingJavaVersion') || 'Checking required Java version...');
            let requiredJavaMajor: number;
            try {
                requiredJavaMajor = await invoke('get_required_java_version', { version: versionToPlay }) as number;
                addLog(`Mojang manifest requires Java ${requiredJavaMajor} for MC ${versionToPlay}`);
            } catch (e) {
                addLog(`Failed to get Java version from manifest, falling back to hardcoded mapping: ${e}`);
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

            const javaUrl = `https://api.adoptium.net/v3/binary/latest/${requiredJavaMajor}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`;

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

    if (viewingInstance) {
        const settingsCachedImages = viewingSettingsInstance ? getCachedImages(viewingSettingsInstance.id) : null;
        
        return (
            <>
                <InstanceDetails 
                    instance={viewingInstance} 
                    onBack={() => setViewingInstance(null)}
                    onPlay={handlePlayInstance}
                    onOpenSettings={() => setViewingSettingsInstance(viewingInstance)}
                    isLaunching={isLaunching}
                />
                {/* Settings Modal overlay */}
                <AnimatePresence>
                    {viewingSettingsInstance && (
                        <InstanceSettings 
                            instance={viewingSettingsInstance}
                            onBack={() => setViewingSettingsInstance(null)}
                            preloadedIconSrc={settingsCachedImages?.icon}
                        />
                    )}
                </AnimatePresence>
                {/* Launching Progress Overlay */}
                <AnimatePresence>
                    {isLaunching && (
                        <motion.div
                            key="launch-progress-overlay-detail"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className={styles.launchOverlay}
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
            </>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <h1 className={styles.title}>
                        {t('myInstances')}
                        {instances.length > 0 && (
                            <span className={styles.countBadge}>{instances.length}</span>
                        )}
                    </h1>
                    <p className={styles.subtitle}>{t('myInstancesDesc')}</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className={styles.searchWrapper}>
                        <input 
                            type="text" 
                            placeholder={t('search')} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                        <Search className={styles.searchIcon} size={18} />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={styles.content}>
                <div className={styles.grid}>
                    {/* Create New Card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={styles.createCard}
                        onClick={() => setShowCreateModal(true)}
                    >
                        <div className={styles.createIconWrapper}>
                            <Plus size={28} strokeWidth={2.5} />
                        </div>
                        <span className={styles.createText}>{t('createNewInstance')}</span>
                    </motion.div>

                    {/* Instance Cards */}
                    {filteredInstances.map((instance, index) => (
                        <InstanceCard
                            key={instance.id}
                            instance={instance}
                            index={index}
                            onClick={setViewingInstance}
                            onPlay={handlePlayInstance}
                            onDelete={handleDeleteInstance}
                            onUpdate={updateInstance}
                            isLaunching={isLaunching}
                        />
                    ))}
                </div>

                {/* Empty State when searching */}
                {searchTerm && filteredInstances.length === 0 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={styles.emptyState}
                    >
                        <div className={styles.emptyStateIcon}>
                            <SearchX size={28} />
                        </div>
                        <h3 className={styles.emptyStateTitle}>{t('noInstancesFound')}</h3>
                        <p className={styles.emptyStateText}>
                            {t('noInstancesFoundDesc', { term: searchTerm })}
                        </p>
                    </motion.div>
                )}
            </div>

            {/* Create Modal */}
            <AnimatePresence>
                <CreateInstanceModal 
                    isOpen={showCreateModal} 
                    onClose={() => setShowCreateModal(false)} 
                />
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {instanceToDelete && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={styles.modalOverlay}
                        onClick={() => setInstanceToDelete(null)}
                        data-modal-overlay="true"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className={styles.deleteModal}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className={styles.deleteModalContent}>
                                <div className={styles.deleteModalHeader}>
                                    <h3 className={styles.deleteModalTitle}>{t('deleteInstance')}</h3>
                                    <p className={styles.deleteModalText}>
                                        {t('deleteInstanceConfirm')}
                                    </p>
                                </div>
                                
                                <div className={styles.deleteModalActions}>
                                    <button
                                        onClick={() => setInstanceToDelete(null)}
                                        className={styles.cancelButton}
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        disabled={isDeleting}
                                        className={cn(styles.confirmDeleteButton, "flex items-center justify-center gap-2")}
                                    >
                                        {isDeleting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                {t('deleting')}
                                            </>
                                        ) : (
                                            t('delete')
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Launching Progress Overlay */}
            <AnimatePresence>
                {isLaunching && (
                    <motion.div
                        key="launch-progress-overlay"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={styles.launchOverlay}
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

            {/* Toast Notification */}
            <AnimatePresence>
                {toastMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className={cn(
                            "fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3",
                            toastType === 'error' ? "border-red-500/50 text-red-200" : "border-white/10 text-white"
                        )}
                    >
                        {toastType === 'error' ? <AlertCircle size={20} className="text-red-500" /> : <Check size={20} className="text-green-400" />}
                        <span className="font-medium">{toastMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Instances;
