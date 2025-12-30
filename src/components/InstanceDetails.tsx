import React from 'react';
import { motion } from 'framer-motion';
import { Play, Folder, MoreHorizontal, ArrowLeft, Package, Map, Trash2, FileQuestion, Search, Download, Eye, X, FileText, Edit } from 'lucide-react';
import { Instance, useLauncherStore } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import styles from './InstanceDetails.module.css';

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

interface InstanceDetailsProps {
    instance: Instance;
    onBack: () => void;
    onPlay: (e: React.MouseEvent, instance: Instance) => void;
    isLaunching: boolean;
}

type Tab = 'Content' | 'Logs' | 'Saves' | 'Screenshots' | 'Console';

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

const FileRow = ({ file, instancePath, activeTab, onDelete, onClick }: { file: {name: string, is_dir: boolean}, instancePath: string, activeTab: string, onDelete: (name: string) => void, onClick?: (file: {name: string}) => void }) => {
    const [iconUrl, setIconUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        let isMounted = true;
        let currentUrl: string | null = null;

        const loadIcon = async () => {
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
                    // Icon not found
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
            }
        };
        loadIcon();
        return () => { 
            isMounted = false;
            if (currentUrl) URL.revokeObjectURL(currentUrl);
        };
    }, [file, instancePath, activeTab]);


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
                    ) : (
                        <Map className="w-8 h-8 text-emerald-400" />
                    )
                )}
            </div>

            {/* Info */}
            <div className={styles.fileInfo}>
                <div className={styles.fileHeader}>
                    <h3 className={styles.fileName} title={file.name}>
                        {file.name}
                    </h3>
                    <span className={styles.fileTag}>
                        Local File
                    </span>
                </div>
                <p className={styles.fileDescription}>
                    {activeTab === 'Content' ? 'Mod file installed in instance.' : (activeTab === 'Logs' ? 'Log file.' : 'World save folder.')}
                </p>
                {activeTab === 'Content' && (
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
                Eliminar
            </button>
        </div>
    );
};

const InstanceDetails: React.FC<InstanceDetailsProps> = ({ instance, onBack, onPlay, isLaunching }) => {
    const { updateInstance, removeInstance } = useLauncherStore();
    const [activeTab, setActiveTab] = React.useState<Tab>('Content');
    const [files, setFiles] = React.useState<{name: string, is_dir: boolean}[]>([]);
    const [loadingFiles, setLoadingFiles] = React.useState(false);
    const [imageSrc, setImageSrc] = React.useState("https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
    const [instancePath, setInstancePath] = React.useState<string>("");
    const [selectedScreenshot, setSelectedScreenshot] = React.useState<string | null>(null);
    const [selectedLog, setSelectedLog] = React.useState<{name: string, content: string} | null>(null);
    const [consoleLogs, setConsoleLogs] = React.useState<string[]>([]);
    const consoleEndRef = React.useRef<HTMLDivElement>(null);
    
    // Menu & Modals State
    const [showMenu, setShowMenu] = React.useState(false);
    const [showRenameModal, setShowRenameModal] = React.useState(false);
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);
    const [newName, setNewName] = React.useState("");
    const [isDeleting, setIsDeleting] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);

    // Pagination & Search
    const [currentPage, setCurrentPage] = React.useState(1);
    const [searchQuery, setSearchQuery] = React.useState("");
    const itemsPerPage = 20; // Increased from 8 to 20
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleRename = async () => {
        if (!newName.trim()) return;
        try {
            await invoke('update_instance', { id: instance.id, name: newName });
            updateInstance(instance.id, { name: newName });
            setShowRenameModal(false);
        } catch (error) {
            console.error("Failed to rename instance:", error);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await invoke('delete_instance', { id: instance.id });
            removeInstance(instance.id);
            onBack();
        } catch (error) {
            console.error("Failed to delete instance:", error);
            // We should probably show a toast here, but this component doesn't have toast state.
            // For now, just log it. The user will see the modal not closing or the button spinning.
            // Ideally we'd pass a toast handler or add local toast state.
            alert(`Error al eliminar: ${error}`);
        } finally {
            setIsDeleting(false);
        }
    };

    React.useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    }, [currentPage]);

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
        if (activeTab === 'Console' && consoleEndRef.current) {
            consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [consoleLogs, activeTab]);

    React.useEffect(() => {
        if (activeTab === 'Content' || activeTab === 'Saves' || activeTab === 'Screenshots' || activeTab === 'Logs') {
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
            const targetDir = activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'saves' : (activeTab === 'Screenshots' ? 'screenshots' : 'logs'));
            const fullPath = await join(path, targetDir);
            
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

    React.useEffect(() => {
        let isMounted = true;
        let objectUrl: string | null = null;

        const loadImage = async () => {
            const imgSource = instance.icon || instance.backgroundImage || (instance as any).background_image;
            if (!imgSource) return;

            let src = "";
            if (imgSource.startsWith('assets/') || imgSource.startsWith('/assets/')) {
                src = imgSource.startsWith('/') ? imgSource : `/${imgSource}`;
            } else if (BACKGROUNDS.includes(imgSource)) {
                src = `/assets/thumbnails/${imgSource}`;
            } else if (imgSource.startsWith('http')) {
                src = imgSource;
            } else {
                try {
                    const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                    const fullPath = await join(instancePath, imgSource);
                    
                    const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                    const blob = new Blob([new Uint8Array(data)]);
                    src = URL.createObjectURL(blob);
                    objectUrl = src;
                } catch (e) {
                    console.error("Failed to load image for instance " + instance.name, e);
                }
            }
            
            if (isMounted && src) {
                setImageSrc(src);
            }
        };
        loadImage();
        return () => { 
            isMounted = false; 
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [instance]);

    const tabs: Tab[] = ['Content', 'Logs', 'Saves', 'Screenshots', 'Console'];

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
            const targetDir = activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'saves' : (activeTab === 'Screenshots' ? 'screenshots' : 'logs'));
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
                        <div className={styles.menuContainer} ref={menuRef}>
                            <button className={styles.iconButton} onClick={() => setShowMenu(!showMenu)}>
                                <MoreHorizontal size={20} />
                            </button>
                            
                            {showMenu && (
                                <div className={styles.menuDropdown}>
                                    <button 
                                        className={styles.menuItem}
                                        onClick={() => {
                                            setNewName(instance.name);
                                            setShowRenameModal(true);
                                            setShowMenu(false);
                                        }}
                                    >
                                        <Edit className="w-4 h-4" />
                                        Renombrar
                                    </button>
                                    <button 
                                        className={`${styles.menuItem} ${styles.menuItemDelete}`}
                                        onClick={() => {
                                            setShowDeleteModal(true);
                                            setShowMenu(false);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Eliminar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.instanceInfo}>
                    <div className={styles.instanceIconWrapper}>
                        <img src={imageSrc} className={styles.instanceIcon} alt={instance.name} />
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
                                {files.length} Files
                            </span>
                        </div>
                    </div>
                    <button 
                        className={styles.playButton}
                        onClick={(e) => onPlay(e, instance)}
                        disabled={isLaunching}
                    >
                        <Play size={20} fill="currentColor" />
                        {isLaunching ? 'Launching...' : 'Play Now'}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabsContainer}>
                {tabs.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(styles.tabButton, activeTab === tab && styles.tabButtonActive)}
                    >
                        {tab}
                        {activeTab === tab && <motion.div layoutId="activeTab" className={styles.tabIndicator} />}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className={styles.content}>
                {(activeTab === 'Content' || activeTab === 'Saves' || activeTab === 'Screenshots' || activeTab === 'Logs') && (
                    <div className={styles.filesContainer}>
                        {/* Search Bar */}
                        <div className={styles.searchBar}>
                            <div className={styles.searchInputWrapper}>
                                <Search className="w-5 h-5 text-zinc-500" />
                                <input 
                                    type="text" 
                                    placeholder={`Buscar en ${activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'saves' : 'screenshots')}...`}
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
                                    <span>Cargando...</span>
                                </div>
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className={styles.emptyContainer}>
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                    {activeTab === 'Content' ? <Package className="w-8 h-8 opacity-50" /> : (activeTab === 'Saves' ? <Map className="w-8 h-8 opacity-50" /> : <Eye className="w-8 h-8 opacity-50" />)}
                                </div>
                                <p className="text-lg font-medium">
                                    {searchQuery ? 'No se encontraron resultados' : `No se encontraron ${activeTab === 'Content' ? 'mods' : (activeTab === 'Saves' ? 'partidas' : 'capturas')}`}
                                </p>
                                <p className="text-sm opacity-60">
                                    {searchQuery ? 'Intenta con otra búsqueda' : 'La carpeta está vacía'}
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
                                    Anterior
                                </button>
                                <span className={styles.pageInfo}>
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={styles.pageButton}
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {/* Placeholders for other tabs */}
                {activeTab === 'Console' && (
                    <div className={styles.consoleContainer}>
                        <div className={styles.consoleOutput}>
                            {consoleLogs.map((log, i) => (
                                <div key={i} className={styles.consoleLine}>{log}</div>
                            ))}
                            <div ref={consoleEndRef} />
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
                <div className={styles.imageModal} onClick={() => setSelectedScreenshot(null)}>
                    <button className={styles.closeModalButton} onClick={() => setSelectedScreenshot(null)}>
                        <X className="w-6 h-6" />
                    </button>
                    <img src={selectedScreenshot} alt="Screenshot" className={styles.modalImage} onClick={(e) => e.stopPropagation()} />
                </div>
            )}

            {selectedLog && (
                <div className={styles.logModal} onClick={() => setSelectedLog(null)}>
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

            {showRenameModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Renombrar Instancia</h3>
                            <button className={styles.modalClose} onClick={() => setShowRenameModal(false)}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <input 
                                type="text" 
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className={styles.modalInput}
                                placeholder="Nuevo nombre"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            />
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={`${styles.modalButton} ${styles.modalButtonCancel}`} onClick={() => setShowRenameModal(false)}>
                                Cancelar
                            </button>
                            <button className={`${styles.modalButton} ${styles.modalButtonPrimary}`} onClick={handleRename}>
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Eliminar Instancia</h3>
                            <button className={styles.modalClose} onClick={() => setShowDeleteModal(false)}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p className={styles.modalText}>
                                ¿Estás seguro de que quieres eliminar <strong>{instance.name}</strong>?
                                <br />
                                Esta acción no se puede deshacer y se perderán todos los datos de la instancia.
                            </p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={`${styles.modalButton} ${styles.modalButtonCancel}`} onClick={() => setShowDeleteModal(false)}>
                                Cancelar
                            </button>
                            <button 
                                className={`${styles.modalButton} ${styles.modalButtonDanger} flex items-center justify-center gap-2`} 
                                onClick={handleDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                        Eliminando...
                                    </>
                                ) : (
                                    "Eliminar"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InstanceDetails;
