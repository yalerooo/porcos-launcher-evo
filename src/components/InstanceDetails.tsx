import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import { Play, Folder, ArrowLeft, Package, Map, Trash2, FileQuestion, Search, Download, Eye, X, FileText, Settings, Terminal, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Instance, getCachedImages } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import { useI18n } from '@/i18n';
import { formatPlayTime, formatTimeAgo } from '@/lib/timeFormat';
import styles from './InstanceDetails.module.css';

const LINE_HEIGHT = 22;
const OVERSCAN_COUNT = 5;

interface InstanceDetailsProps {
    instance: Instance;
    onBack: () => void;
    onPlay: (e: React.MouseEvent, instance: Instance) => void;
    onOpenSettings: () => void;
    isLaunching: boolean;
}

type Tab = 'Content' | 'Logs' | 'Saves' | 'Screenshots' | 'Shaderpacks' | 'Resourcepacks' | 'Console';

const ScreenshotItem = ({ file, instancePath, onDelete, onClick }: { file: {name: string}, instancePath: string, onDelete: (name: string) => void, onClick: (url: string) => void }) => {
    const [imageUrl, setImageUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        let isMounted = true;
        let currentUrl: string | null = null;

        const loadImage = async () => {
            try {
                const fullPath = await join(instancePath, 'screenshots', file.name);
                const data = await invoke('read_binary_file', { path: fullPath }) as number[];
                if (isMounted && data && data.length > 0) {
                    const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                    currentUrl = URL.createObjectURL(blob);
                    setImageUrl(currentUrl);
                }
            } catch (e) {
                console.error("Failed to load screenshot", e);
            }
        };
        loadImage();
        return () => { 
            isMounted = false;
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [file, instancePath]);

    if (!imageUrl) return null;

    return (
        <div className={styles.screenshotItem} onClick={() => onClick(imageUrl)}>
            <img src={imageUrl} alt={file.name} className={styles.screenshotImage} />
            <div className={styles.screenshotOverlay}>
                <button 
                    className={`${styles.screenshotAction} ${styles.screenshotActionDelete}`}
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(file.name); }}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const FileRow = ({ file, instancePath, activeTab, onDelete, onClick, installedMetadata }: { file: {name: string, is_dir: boolean}, instancePath: string, activeTab: string, onDelete: (name: string) => void, onClick?: (file: {name: string}) => void, installedMetadata?: Record<string, {name?: string, icon?: string, source?: string}> }) => {
    const { t } = useI18n();
    const [iconUrl, setIconUrl] = React.useState<string | null>(null);

    const metadata = installedMetadata?.[file.name];

    React.useEffect(() => {
        let isMounted = true;
        let currentUrl: string | null = null;

        const loadIcon = async () => {
            // For shaderpacks and resourcepacks, first check if we have metadata from mods.json
            if ((activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') && metadata?.icon && instancePath) {
                try {
                    const response = await invoke('fetch_cors', { url: metadata.icon }) as string;
                    if (isMounted && response) {
                        const blob = new Blob([new Uint8Array([...response].map(c => c.charCodeAt(0)))], { type: 'image/png' });
                        currentUrl = URL.createObjectURL(blob);
                        setIconUrl(currentUrl);
                        return;
                    }
                } catch (e) {
                    // Failed to load icon from URL
                }
            }

            if (activeTab === 'Content' && file.name.endsWith('.jar') && instancePath) {
                try {
                    const targetDir = 'mods';
                    const fullPath = await join(instancePath, targetDir, file.name);
                    const data = await invoke('get_mod_icon', { path: fullPath }) as number[];
                    if (isMounted && data && data.length > 0) {
                        const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                        currentUrl = URL.createObjectURL(blob);
                        setIconUrl(currentUrl);
                    }
                } catch (e) {
                    if (isMounted) setIconUrl(null);
                }
            } else if (activeTab === 'Saves' && file.is_dir && instancePath) {
                try {
                    const fullPath = await join(instancePath, 'saves', file.name, 'icon.png');
                    const data = await invoke('read_binary_file', { path: fullPath }) as number[];
                    if (isMounted && data && data.length > 0) {
                        const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                        currentUrl = URL.createObjectURL(blob);
                        setIconUrl(currentUrl);
                    }
                } catch (e) {
                    // Icon not found
                }
            } else if (activeTab === 'Shaderpacks' && instancePath) {
                try {
                    const fullPath = await join(instancePath, 'shaderpacks', file.name);
                    const data = await invoke('get_mod_icon', { path: fullPath }) as number[];
                    if (isMounted && data && data.length > 0) {
                        const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                        currentUrl = URL.createObjectURL(blob);
                        setIconUrl(currentUrl);
                    }
                } catch (e) {
                    // No icon available
                }
            } else if (activeTab === 'Resourcepacks' && instancePath) {
                try {
                    const fullPath = await join(instancePath, 'resourcepacks', file.name);
                    const data = await invoke('get_mod_icon', { path: fullPath }) as number[];
                    if (isMounted && data && data.length > 0) {
                        const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                        currentUrl = URL.createObjectURL(blob);
                        setIconUrl(currentUrl);
                    }
                } catch (e) {
                    // No icon available
                }
            }
        };
        loadIcon();
        return () => {
            isMounted = false;
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [file, instancePath, activeTab, metadata]);


    return (
        <div className={styles.fileItem} onClick={() => onClick && onClick(file)} style={{ cursor: onClick ? 'pointer' : 'default' }}>
            {/* Icon */}
            <div className={styles.fileIcon}>
                {iconUrl ? (
                    <img src={iconUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : (
                    activeTab === 'Content' ? (
                        file.name.endsWith('.jar') ? <Package className="w-8 h-8 text-[#ffbfba]" /> : <FileQuestion className="w-8 h-8 text-zinc-500" />
                    ) : activeTab === 'Logs' ? (
                        <FileText className="w-8 h-8 text-zinc-400" />
                    ) : activeTab === 'Shaderpacks' ? (
                        <Folder className="w-8 h-8 text-purple-400" />
                    ) : activeTab === 'Resourcepacks' ? (
                        <Folder className="w-8 h-8 text-amber-400" />
                    ) : (
                        <Map className="w-8 h-8 text-emerald-400" />
                    )
                )}
            </div>

            {/* Info */}
            <div className={styles.fileInfo}>
                <div className={styles.fileHeader}>
                    <h3 className={styles.fileName} title={metadata?.name || file.name}>
                        {metadata?.name || file.name}
                    </h3>
                    {metadata?.source && (
                        <span className={styles.fileTag} style={{ textTransform: 'capitalize' }}>
                            {metadata.source}
                        </span>
                    )}
                </div>
                <p className={styles.fileDescription}>
                    {activeTab === 'Content' ? 'Mod file installed in instance.' : (activeTab === 'Logs' ? 'Log file.' : (activeTab === 'Shaderpacks' ? 'Shaderpack installed.' : (activeTab === 'Resourcepacks' ? 'Resourcepack installed.' : 'World save folder.')))}
                </p>
                {(activeTab === 'Content' || activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') && (
                    <div className={styles.fileMeta}>
                        <Download className="w-3 h-3" />
                        <span>Installed</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(file.name); }}
                className={styles.deleteButton}
            >
                <Trash2 className="w-4 h-4" />
                {t('delete')}
            </button>
        </div>
    );
};

interface LogRow {
    timestamp: string;
    message: string;
    level: 'info' | 'warn' | 'error' | 'debug';
}

interface RowData {
    logs: LogRow[];
}

interface RowProps {
    index: number;
    style: React.CSSProperties;
    data: RowData;
}

const ConsoleLogRow: React.FC<RowProps> = React.memo(({ index, style, data }) => {
    const log = data.logs[index];
    const levelColors = {
        info: 'text-[#e8d5d3]',
        warn: 'text-amber-400/90',
        error: 'text-red-400/90',
        debug: 'text-zinc-500',
    };
    const bgTint = {
        info: '',
        warn: 'bg-amber-500/5',
        error: 'bg-red-500/5',
        debug: '',
    };
    return (
        <div style={style} className={cn("break-all group flex font-mono text-xs relative", levelColors[log.level], bgTint[log.level])}>
            <span className="text-zinc-600/70 mr-3 ml-2 flex-shrink-0 select-none font-light text-[10px] mt-[1px]">{log.timestamp}</span>
            <span className="flex-1 py-[3px] pr-4 border-l border-zinc-800/50 group-hover:border-[#ffbfba]/20 transition-colors">{log.message}</span>
        </div>
    );
});

ConsoleLogRow.displayName = 'ConsoleLogRow';

const InstanceDetails: React.FC<InstanceDetailsProps> = ({ instance, onBack, onPlay, onOpenSettings, isLaunching }) => {
    const { t } = useI18n();
    // Get cached images from global store
    const cached = getCachedImages(instance.id);
    const [activeTab, setActiveTab] = React.useState<Tab>('Content');
    const [files, setFiles] = React.useState<{name: string, is_dir: boolean}[]>([]);
    const [loadingFiles, setLoadingFiles] = React.useState(false);
    const [imageSrc, setImageSrc] = React.useState(cached.background || "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
    const [iconSrc, setIconSrc] = React.useState(cached.icon || "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
    const [instancePath, setInstancePath] = React.useState<string>("");
    const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null);
    const [selectedLog, setSelectedLog] = React.useState<{name: string, content: string} | null>(null);
    const [consoleLogs, setConsoleLogs] = React.useState<string[]>([]);
    const [autoScroll, setAutoScroll] = React.useState(true);
    const consoleContainerRef = React.useRef<HTMLDivElement>(null);
    const consoleListRef = React.useRef<List>(null);
    const prevLogCountRef = React.useRef(0);
    const [installedMetadata, setInstalledMetadata] = React.useState<Record<string, {name?: string, icon?: string, source?: string}>>({});

    // Pagination & Search
    const [currentPage, setCurrentPage] = React.useState(1);
    const [searchQuery, setSearchQuery] = React.useState("");
    const itemsPerPage = 20;
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [currentPage]);

    const parsedConsoleLogs: LogRow[] = consoleLogs.map(line => {
        const timestampMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
        const timestamp = timestampMatch ? timestampMatch[1] : '';
        const message = timestampMatch ? line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '') : line;
        let level: 'info' | 'warn' | 'error' | 'debug' = 'info';
        if (/\berror\b/i.test(message)) level = 'error';
        else if (/\bwarn(?:ing)?\b/i.test(message)) level = 'warn';
        else if (/\b(?:debug|trace)\b/i.test(message)) level = 'debug';
        return { timestamp, message, level };
    });

    React.useEffect(() => {
        const unlisten = listen('game-output', (event) => {
            const line = event.payload as string;
            setConsoleLogs(prev => [...prev, line]);
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    React.useEffect(() => {
        if (parsedConsoleLogs.length > prevLogCountRef.current) {
            prevLogCountRef.current = parsedConsoleLogs.length;
            if (autoScroll && consoleListRef.current) {
                consoleListRef.current.scrollToItem(parsedConsoleLogs.length - 1, 'end');
            }
        }
    }, [parsedConsoleLogs.length, autoScroll]);

    const handleConsoleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
        if (scrollUpdateWasRequested || !consoleContainerRef.current) return;
        const maxScroll = consoleContainerRef.current.scrollHeight - consoleContainerRef.current.clientHeight;
        setAutoScroll(maxScroll - scrollOffset < 50);
    }, []);

    React.useEffect(() => {
        if (activeTab === 'Content' || activeTab === 'Saves' || activeTab === 'Screenshots' || activeTab === 'Logs' || activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') {
            loadFiles();
        }
    }, [activeTab, instance]);

    const loadFiles = async () => {
        setLoadingFiles(true);
        setCurrentPage(1); // Reset page on load
        setSearchQuery(""); // Reset search
        try {
            const path = await invoke("get_instance_path", { id: instance.id }) as string;
            setInstancePath(path);
            const targetDir = activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'saves' : (activeTab === 'Screenshots' ? 'screenshots' : (activeTab === 'Shaderpacks' ? 'shaderpacks' : (activeTab === 'Resourcepacks' ? 'resourcepacks' : 'logs'))));
            const fullPath = await join(path, targetDir);

            // Load metadata for shaderpacks/resourcepacks
            if (activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') {
                const metadataPath = await join(path, 'mods.json');
                const metadataExists = await invoke("file_exists", { path: metadataPath }) as boolean;
                if (metadataExists) {
                    const content = await invoke("read_text_file", { path: metadataPath }) as string;
                    const data = JSON.parse(content);
                    if (data.mods && Array.isArray(data.mods)) {
                        const metadataRecord: Record<string, {name?: string, icon?: string, source?: string}> = {};
                        for (const mod of data.mods) {
                            if (mod.file) {
                                metadataRecord[mod.file] = { name: mod.name, icon: mod.icon, source: mod.source };
                            }
                        }
                        setInstalledMetadata(metadataRecord);
                    }
                } else {
                    setInstalledMetadata({});
                }
            }

            // Check if dir exists
            const exists = await invoke("file_exists", { path: fullPath }) as boolean;
            if (!exists) {
                setFiles([]);
                setLoadingFiles(false);
                return;
            }

            const fileList = await invoke("list_files", { path: fullPath }) as {name: string, is_dir: boolean}[];

            if (activeTab === 'Logs') {
                const filtered = fileList.filter(f => f.name.endsWith('.log'));
                setFiles(filtered);
            } else {
                setFiles(fileList);
            }
        } catch (e) {
            console.error("Failed to load files", e);
            setFiles([]);
        } finally {
            setLoadingFiles(false);
        }
    };

    // Sync with cached images when instance changes
    React.useEffect(() => {
        const cached = getCachedImages(instance.id);
        if (cached.background) setImageSrc(cached.background);
        if (cached.icon) setIconSrc(cached.icon);
    }, [instance.id, instance.icon, instance.backgroundImage]);

    const tabs: Tab[] = ['Content', 'Logs', 'Saves', 'Screenshots', 'Shaderpacks', 'Resourcepacks', 'Console'];

    const handleOpenFolder = async () => {
        try {
            await invoke('open_instance_folder', { id: instance.id });
        } catch (error) {
            console.error('Failed to open folder:', error);
        }
    };

    const handleFileClick = async (file: {name: string}) => {
        if (activeTab === 'Logs') {
            try {
                const fullPath = await join(instancePath, 'logs', file.name);
                const content = await invoke('read_text_file', { path: fullPath }) as string;
                setSelectedLog({ name: file.name, content });
            } catch (e) {
                console.error("Failed to read log file", e);
            }
        }
    };

    const handleDeleteFile = async (fileName: string) => {
        try {
            const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
            const targetDir = activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'saves' : (activeTab === 'Screenshots' ? 'screenshots' : (activeTab === 'Shaderpacks' ? 'shaderpacks' : (activeTab === 'Resourcepacks' ? 'resourcepacks' : 'logs'))));
            const fullPath = await join(instancePath, targetDir, fileName);
            
            await invoke("delete_file", { path: fullPath });

            // Update mods.json if we are deleting a mod
            if (activeTab === 'Content' && fileName.endsWith('.jar')) {
                try {
                    const modsJsonPath = await join(instancePath, 'mods.json');
                    const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
                    if (exists) {
                        const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
                        const data = JSON.parse(content);
                        if (data.mods && Array.isArray(data.mods)) {
                            const newMods = data.mods.filter((m: any) => m.file !== fileName);
                            await invoke('write_text_file', { 
                                path: modsJsonPath, 
                                content: JSON.stringify({ mods: newMods }, null, 2) 
                            });
                        }
                    }
                } catch (e) {
                    console.error("Failed to update mods.json", e);
                }
            }
            
            // Refresh list
            loadFiles();
        } catch (error) {
            console.error("Failed to delete file:", error);
        }
    };

    // Filter & Pagination Logic
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
    const currentFiles = filteredFiles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className={styles.container}>
            {/* Hero Background */}
            <div className={styles.heroBackground}>
                <img src={imageSrc} className={styles.heroImage} alt="" />
                <div className={styles.heroOverlay} />
            </div>

            {/* Header */}
            <div className={styles.header}>
                <div className={styles.topBar}>
                    <button onClick={onBack} className={styles.iconButton} title="Back to Library">
                        <ArrowLeft size={20} />
                    </button>
                    
                    {/* Actions */}
                    <div className={styles.actions}>
                        <button onClick={handleOpenFolder} className={styles.iconButton} title="Open Folder">
                            <Folder size={20} />
                        </button>
                        <button onClick={onOpenSettings} className={styles.iconButton} title="Ajustes de Instancia">
                            <Settings size={20} />
                        </button>
                    </div>
                </div>

                <div className={styles.instanceInfo}>
                    <div className={styles.instanceIconWrapper}>
                        <img src={iconSrc} className={styles.instanceIcon} alt={instance.name} />
                    </div>
                    <div className={styles.instanceMeta}>
                        <h1 className={styles.instanceTitle}>{instance.name}</h1>
                        <div className={styles.tags}>
                            <span className={cn(styles.tag, styles.tagPrimary)}>
                                {instance.modLoader || 'Vanilla'} {instance.modLoaderVersion}
                            </span>
                            {instance.versions && instance.versions.length > 1 ? (
                                instance.versions.map(v => (
                                    <span key={v} className={cn(styles.tag, styles.tagSecondary)}>
                                        {v.split('(')[0].trim()}
                                    </span>
                                ))
                            ) : (
                                <span className={cn(styles.tag, styles.tagSecondary)}>
                                    {instance.version.split('(')[0].trim()}
                                </span>
                            )}
                            <span className={cn(styles.tag, styles.tagSecondary)}>
                                {files.length} {t('files')}
                            </span>
                        </div>
                        {(instance.totalPlayTime !== undefined && instance.totalPlayTime > 0) && (
                            <div className="flex items-center gap-4 mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                                <span className="flex items-center gap-1">
                                    <Clock size={10} />
                                    <span>{formatPlayTime(instance.totalPlayTime)} total</span>
                                </span>
                                {instance.longestSession !== undefined && instance.longestSession > 0 && (
                                    <span className="flex items-center gap-1">
                                        <span>·</span>
                                        <span>{formatPlayTime(instance.longestSession)} máx</span>
                                    </span>
                                )}
                                {instance.sessionCount !== undefined && instance.sessionCount > 0 && (
                                    <span className="flex items-center gap-1">
                                        <span>·</span>
                                        <span>{instance.sessionCount} {instance.sessionCount === 1 ? 'sesión' : 'sesiones'}</span>
                                    </span>
                                )}
                                {instance.lastPlayed && (
                                    <span className="flex items-center gap-1 opacity-60">
                                        <span>·</span>
                                        <span>hace {formatTimeAgo(instance.lastPlayed)}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <button 
                        className={styles.playButton}
                        onClick={(e) => onPlay(e, instance)}
                        disabled={isLaunching}
                    >
                        <Play size={20} fill="currentColor" />
                        {isLaunching ? t('launching') : t('playNow')}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabsContainer}>
                {tabs.map(tab => {
                    const tabKey = tab.toLowerCase() as 'content' | 'logs' | 'saves' | 'screenshots' | 'console';
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(styles.tabButton, activeTab === tab && styles.tabButtonActive)}
                        >
                            {t(tabKey)}
                            {activeTab === tab && <motion.div layoutId="activeTab" className={styles.tabIndicator} />}
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className={styles.content}>
                {(activeTab === 'Content' || activeTab === 'Saves' || activeTab === 'Screenshots' || activeTab === 'Logs' || activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') && (
                    <div className={styles.filesContainer}>
                        {/* Search Bar */}
                        <div className={styles.searchBar}>
                            <div className={styles.searchInputWrapper}>
                                <Search className="w-5 h-5 text-zinc-500" />
                                <input 
                                    type="text" 
                                    placeholder={activeTab === 'Content' ? t('searchInMods') : (activeTab === 'Saves' ? t('searchInWorlds') : (activeTab === 'Screenshots' ? t('searchInScreenshots') : (activeTab === 'Shaderpacks' ? t('searchInShaderpacks') : (activeTab === 'Resourcepacks' ? t('searchInResourcepacks') : t('searchInLogs')))))}
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className={styles.searchInput}
                                />
                            </div>
                        </div>

                        {loadingFiles ? (
                            <div className={styles.loadingContainer}>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-6 h-6 border-2 border-[#ffbfba] border-t-transparent rounded-full animate-spin" />
                                    <span>{t('loading')}</span>
                                </div>
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className={styles.emptyContainer}>
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                    {activeTab === 'Content' ? <Package className="w-8 h-8 opacity-50" /> : (activeTab === 'Saves' ? <Map className="w-8 h-8 opacity-50" /> : (activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks' ? <Folder className="w-8 h-8 opacity-50" /> : <Eye className="w-8 h-8 opacity-50" />))}
                                </div>
                                <p className="text-lg font-medium">
                                    {searchQuery ? t('noResultsFound') : (activeTab === 'Content' ? t('noMods') : (activeTab === 'Saves' ? t('noSaves') : (activeTab === 'Screenshots' ? t('noScreenshots') : (activeTab === 'Shaderpacks' ? t('noShaderpacks') : t('noResourcepacks')))))}
                                </p>
                                <p className="text-sm opacity-60">
                                    {searchQuery ? t('tryAnotherSearch') : (activeTab === 'Shaderpacks' ? t('noShaderpacksDesc') : (activeTab === 'Resourcepacks' ? t('noResourcepacksDesc') : t('folderEmpty')))}
                                </p>
                            </div>
                        ) : activeTab === 'Screenshots' ? (
                            <div className={styles.screenshotsGrid} ref={scrollContainerRef}>
                                {currentFiles.map((file, i) => (
                                    <ScreenshotItem 
                                        key={i} 
                                        file={file} 
                                        instancePath={instancePath} 
                                        onDelete={handleDeleteFile}
                                        onClick={setSelectedScreenshot}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className={styles.filesList} ref={scrollContainerRef}>
                                {currentFiles.map((file, i) => (
                                    <FileRow
                                        key={i}
                                        file={file}
                                        instancePath={instancePath}
                                        activeTab={activeTab}
                                        onDelete={handleDeleteFile}
                                        onClick={activeTab === 'Logs' ? handleFileClick : undefined}
                                        installedMetadata={(activeTab === 'Shaderpacks' || activeTab === 'Resourcepacks') ? installedMetadata : undefined}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Pagination Bar */}
                        {!loadingFiles && filteredFiles.length > 0 && (
                            <div className={styles.pagination}>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={styles.pageButton}
                                >
                                    {t('previous')}
                                </button>
                                <span className={styles.pageInfo}>
                                    {t('pageOf', { current: currentPage, total: totalPages })}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={styles.pageButton}
                                >
                                    {t('nextPage')}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {/* Placeholders for other tabs */}
                {activeTab === 'Console' && (
                    <div className={styles.consoleWrapper}>
                        <div className={styles.consoleHeader}>
                            <div className={styles.consoleHeaderLeft}>
                                <Terminal className="w-4 h-4 text-[#ffbfba]" />
                                <span className={styles.consoleTitle}>{t('consoleTitle')}</span>
                                <span className={styles.consoleCount}>({parsedConsoleLogs.length} lines)</span>
                            </div>
                            <div className={styles.consoleHeaderRight}>
                                <button
                                    onClick={() => { setConsoleLogs([]); setAutoScroll(true); }}
                                    className={styles.consoleHeaderBtn}
                                    title={t('clearLogs')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => { setAutoScroll(!autoScroll); if (!autoScroll && consoleListRef.current) consoleListRef.current.scrollToItem(parsedConsoleLogs.length - 1, 'end'); }}
                                    className={cn(styles.consoleHeaderBtn, autoScroll && styles.consoleHeaderBtnActive)}
                                    title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
                                >
                                    {autoScroll ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div ref={consoleContainerRef} className={styles.consoleOutput}>
                            {parsedConsoleLogs.length === 0 ? (
                                <div className={styles.consoleEmpty}>
                                    <Terminal className="w-8 h-8 opacity-30" />
                                    <span>{t('waitingLogs')}</span>
                                </div>
                            ) : (
                                <List
                                    ref={consoleListRef}
                                    height={consoleContainerRef.current?.clientHeight || 400}
                                    width="100%"
                                    itemCount={parsedConsoleLogs.length}
                                    itemSize={LINE_HEIGHT}
                                    itemData={{ logs: parsedConsoleLogs }}
                                    overscanCount={OVERSCAN_COUNT}
                                    onScroll={handleConsoleScroll}
                                >
                                    {ConsoleLogRow}
                                </List>
                            )}
                        </div>
                    </div>
                )}
                {activeTab !== 'Content' && activeTab !== 'Saves' && activeTab !== 'Screenshots' && activeTab !== 'Logs' && activeTab !== 'Console' && (
                    <div className="text-zinc-500">
                        {activeTab} view coming soon
                    </div>
                )}
            </div>

            {selectedScreenshot && (
                <div className={styles.imageModal} onClick={() => setSelectedScreenshot(null)} data-modal-overlay="true">
                    <button className={styles.closeModalButton} onClick={() => setSelectedScreenshot(null)}>
                        <X className="w-6 h-6" />
                    </button>
                    <img src={selectedScreenshot} alt="Screenshot" className={styles.modalImage} onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {selectedLog && (
                <div className={styles.logModal} onClick={() => setSelectedLog(null)} data-modal-overlay="true">
                    <div className={styles.logContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.logHeader}>
                            <h3 className={styles.logTitle}>{selectedLog.name}</h3>
                            <button className={styles.closeLogButton} onClick={() => setSelectedLog(null)}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <pre className={styles.logBody}>
                            {selectedLog.content}
                        </pre>
                    </div>
                </div>
            )}

        </div>
    );
};

export default InstanceDetails;
