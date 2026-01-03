import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Settings, Plus, Image as ImageIcon, X, Trash2, Check, Play, Cpu, Gamepad2, ChevronDown, ArrowLeft, Package, Download, AlertCircle, Upload } from 'lucide-react';
import { Instance, useLauncherStore } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import styles from './InstanceSettings.module.css';

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

const SettingsInstanceIcon = ({ instance }: { instance: Instance }) => {
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
                    const isAbs = await isAbsolute(imgSource) || imgSource.includes(':\\') || imgSource.startsWith('/');
                    
                    if (!isAbs) {
                        const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                        fullPath = await join(instancePath, imgSource);
                    }
                    
                    const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                    const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                    newSrc = URL.createObjectURL(blob);
                    
                    bgCache.set(cacheKey, newSrc);
                } catch (e) {
                    console.error(`[SettingsInstanceIcon] Failed to load ${imgSource}`, e);
                }
            }
            
            if (isMounted) setSrc(newSrc);
        };
        
        loadIcon();
        return () => { isMounted = false; };
    }, [instance.id, instance.icon, instance.backgroundImage, (instance as any).background_image]);

    return (
        <div className="w-24 h-24 rounded-2xl overflow-hidden relative shadow-lg bg-[#1a1a1a] border border-white/10 shrink-0">
            <img 
                src={src}
                alt={instance.name}
                className="w-full h-full object-cover"
            />
        </div>
    );
};

interface InstanceSettingsProps {
    instance: Instance;
    onBack: () => void;
}

const InstanceSettings: React.FC<InstanceSettingsProps> = ({ instance: initialInstance, onBack }) => {
    const { instances, updateInstance, removeInstance, versions } = useLauncherStore();
    
    // Get fresh instance data from store
    const activeInstance = instances.find(i => i.id === initialInstance.id) || initialInstance;

    const [settingsTab, setSettingsTab] = useState<'general' | 'versions'>('general');
    const [editingName, setEditingName] = useState(activeInstance.name);
    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');

    // Version Management State
    const [isVersionSelectOpen, setIsVersionSelectOpen] = useState(false);
    const [versionToAdd, setVersionToAdd] = useState('');
    const [isAddVersionLoaderOpen, setIsAddVersionLoaderOpen] = useState(false);
    const [addVersionModLoader, setAddVersionModLoader] = useState('Vanilla');
    const [isAddVersionLoaderVersionOpen, setIsAddVersionLoaderVersionOpen] = useState(false);
    const [addVersionLoaderVersion, setAddVersionLoaderVersion] = useState('');
    const [availableAddVersionLoaders, setAvailableAddVersionLoaders] = useState<any[]>([]);

    // Auto-save name changes
    useEffect(() => {
        if (!activeInstance || !editingName || editingName === activeInstance.name) return;

        const timer = setTimeout(async () => {
            try {
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
    }, [editingName, activeInstance]);

    // Fetch loaders when version/loader type changes
    useEffect(() => {
        const fetchLoaders = async () => {
            if (!versionToAdd || addVersionModLoader === 'Vanilla') {
                setAvailableAddVersionLoaders([]);
                return;
            }

            try {
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
                await invoke("update_instance", {
                    id: activeInstance.id,
                    backgroundImage: filename
                });
                updateInstance(activeInstance.id, { backgroundImage: filename });
                setShowBackgroundSelector(false);
            } catch (e) {
                console.error("Failed to update background on backend", e);
            }
        }
    };

    const handleSelectCustomBackground = async () => {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });
            
            if (file) {
                handleUpdateBackground(file as string);
            }
        } catch (err) {
            console.error("Failed to select image:", err);
        }
    };

    const handleUpdateIcon = async (filename: string) => {
        if (activeInstance) {
            try {
                await invoke("update_instance", {
                    id: activeInstance.id,
                    icon: filename
                });
                updateInstance(activeInstance.id, { icon: filename });
                setToastMessage("Icono actualizado");
                setTimeout(() => setToastMessage(null), 3000);
            } catch (e) {
                console.error("Failed to update icon on backend", e);
                setToastType('error');
                setToastMessage("Error al actualizar icono");
            }
        }
    };

    const handleSelectIcon = async () => {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] }]
            });
            
            if (file) {
                handleUpdateIcon(file as string);
            }
        } catch (err) {
            console.error("Failed to select image:", err);
        }
    };

    const handleDeleteInstance = async () => {
        if (!activeInstance) return;
        setIsDeleting(true);
        
        try {
            await invoke("delete_instance", { id: activeInstance.id });
            removeInstance(activeInstance.id);
            onBack();
        } catch (e) {
            console.error("Failed to delete instance", e);
            setToastType('error');
            setToastMessage(`Error al eliminar: ${e}`);
            setTimeout(() => setToastMessage(null), 5000);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleAddVersion = async () => {
        if (!activeInstance || !versionToAdd) return;
        
        let newVersionString = versionToAdd;
        if (addVersionModLoader !== 'Vanilla' && addVersionLoaderVersion) {
            newVersionString = `${versionToAdd} (${addVersionModLoader} ${addVersionLoaderVersion})`;
        }

        let currentVersions = [...(activeInstance.versions || [activeInstance.version])];
        const currentSelectedVer = activeInstance.selectedVersion || activeInstance.version;
        
        if (activeInstance.modLoader && !currentSelectedVer.includes('(')) {
             const upgradedVer = `${currentSelectedVer} (${activeInstance.modLoader} ${activeInstance.modLoaderVersion || ''})`.trim().replace(/\s+\)/, ')');
             currentVersions = currentVersions.map(v => v === currentSelectedVer ? upgradedVer : v);
        }

        if (currentVersions.includes(newVersionString)) {
            setToastMessage("Esta versión ya está instalada");
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        const newVersions = [...currentVersions, newVersionString];
        
        try {
            const updatePayload: any = {
                id: activeInstance.id,
                versions: newVersions,
            };

            if (addVersionModLoader !== 'Vanilla') {
                updatePayload.modLoader = addVersionModLoader;
                updatePayload.modLoaderVersion = addVersionLoaderVersion;
            } else {
                updatePayload.modLoader = null;
                updatePayload.modLoaderVersion = null;
            }
            
            updatePayload.selectedVersion = newVersionString;

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
        if (currentVersions.length <= 1) return;

        const newVersions = currentVersions.filter(v => v !== versionToRemove);
        
        let newSelectedVersion = activeInstance.selectedVersion || activeInstance.version;
        if (newSelectedVersion === versionToRemove) {
            newSelectedVersion = newVersions[0];
        }

        try {
            await invoke("update_instance", {
                id: activeInstance.id,
                versions: newVersions,
            });
            updateInstance(activeInstance.id, { 
                versions: newVersions,
                selectedVersion: newSelectedVersion
            });
        } catch (e) {
            console.error("Failed to remove version", e);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={styles.settingsOverlay}
        >
            {/* Header */}
            <div className={styles.settingsHeader} data-tauri-drag-region>
                <button 
                    onClick={onBack}
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
                                    Elige un fondo y un icono para tu instancia.
                                </p>
                                
                                <div className="flex gap-6 items-start mb-8 border-b border-white/5 pb-8">
                                    <div className="flex flex-col gap-3 items-center">
                                        <SettingsInstanceIcon instance={activeInstance} />
                                        <button 
                                            onClick={handleSelectIcon}
                                            className="text-xs bg-white/5 hover:bg-white/10 text-white/60 hover:text-white px-3 py-1.5 rounded-lg transition-colors border border-white/5"
                                        >
                                            Cambiar
                                        </button>
                                    </div>
                                    <div className="flex-1 pt-1">
                                        <label className={styles.inputLabel}>Icono de la Instancia</label>
                                        <p className="text-sm text-[#a1a1aa] leading-relaxed">
                                            Este icono se mostrará en la lista de instancias y en la barra lateral.
                                            Puedes subir tu propia imagen o usar una predeterminada.
                                        </p>
                                    </div>
                                </div>
                                
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
                                    onClick={() => setShowDeleteConfirm(true)}
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
                            <div className={cn(styles.settingsCard, (isVersionSelectOpen || isAddVersionLoaderOpen || isAddVersionLoaderVersionOpen) ? styles.settingsCardActive : "")}>
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
                                        <div className={styles.dropdownContainer}>
                                            <div 
                                                onClick={() => setIsVersionSelectOpen(!isVersionSelectOpen)}
                                                className={cn(
                                                    styles.dropdownTrigger,
                                                    isVersionSelectOpen ? styles.dropdownTriggerActive : ""
                                                )}
                                            >
                                                <span className="truncate">
                                                    {versionToAdd 
                                                        ? `${versionToAdd} ${versions.find((v: any) => v.id === versionToAdd)?.version_type ? `(${versions.find((v: any) => v.id === versionToAdd)?.version_type})` : ''}`
                                                        : 'Seleccionar versión'}
                                                </span>
                                                <ChevronDown size={16} className={cn("text-[#a1a1aa] transition-transform duration-200", isVersionSelectOpen ? "rotate-180" : "")} />
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
                                                                styles.dropdownMenu,
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
                                                                        styles.dropdownItem,
                                                                        versionToAdd === v.id ? styles.dropdownItemActive : ""
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
                                                <div className={styles.dropdownContainer}>
                                                    <div 
                                                        onClick={() => setIsAddVersionLoaderOpen(!isAddVersionLoaderOpen)}
                                                        className={cn(
                                                            styles.dropdownTrigger,
                                                            isAddVersionLoaderOpen ? styles.dropdownTriggerActive : ""
                                                        )}
                                                    >
                                                        <span className="truncate">{addVersionModLoader}</span>
                                                        <ChevronDown size={16} className={cn("text-[#a1a1aa] transition-transform duration-200", isAddVersionLoaderOpen ? "rotate-180" : "")} />
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
                                                                        styles.dropdownMenu,
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
                                                                                styles.dropdownItem,
                                                                                addVersionModLoader === loader ? styles.dropdownItemActive : ""
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
                                                    <div className={styles.dropdownContainer}>
                                                        <div 
                                                            onClick={() => setIsAddVersionLoaderVersionOpen(!isAddVersionLoaderVersionOpen)}
                                                            className={cn(
                                                                styles.dropdownTrigger,
                                                                isAddVersionLoaderVersionOpen ? styles.dropdownTriggerActive : ""
                                                            )}
                                                        >
                                                            <span className="truncate">{addVersionLoaderVersion || "Seleccionar"}</span>
                                                            <ChevronDown size={16} className={cn("text-[#a1a1aa] transition-transform duration-200", isAddVersionLoaderVersionOpen ? "rotate-180" : "")} />
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
                                                                            styles.dropdownMenu,
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
                                                                                    styles.dropdownItem,
                                                                                    addVersionLoaderVersion === v.version ? styles.dropdownItemActive : ""
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
                                        style={{ marginTop: '3rem' }}
                                    >
                                        <Plus size={20} />
                                        Instalar
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

                                <div className="flex flex-col gap-6">
                                    {(activeInstance?.versions || [activeInstance?.version]).map((v) => {
                                        const match = v.match(/^(.*) \((.*) (.*)\)$/);
                                        let mcVer = match ? match[1] : v;
                                        let loaderType = match ? match[2] : "Vanilla";
                                        let loaderVer = match ? match[3] : "";

                                        if (!match && v === activeInstance?.version && activeInstance?.modLoader) {
                                            loaderType = activeInstance.modLoader;
                                            loaderVer = activeInstance.modLoaderVersion || "";
                                            loaderType = loaderType.charAt(0).toUpperCase() + loaderType.slice(1);
                                        }

                                        const isActive = (v === (activeInstance?.selectedVersion || activeInstance?.version) || 
                                                          (v === activeInstance?.version && activeInstance?.selectedVersion?.startsWith(v + " (")));

                                        return (
                                            <div 
                                                key={v} 
                                                className={cn(
                                                    styles.versionCard,
                                                    isActive ? styles.versionCardActive : ""
                                                )}
                                            >
                                                <div className="flex items-center gap-5">
                                                    <div className={styles.versionIcon}>
                                                        <Box size={24} strokeWidth={1.5} />
                                                    </div>
                                                    <div className={styles.versionInfo}>
                                                        <span className={styles.versionTitle}>{mcVer}</span>
                                                        <div className={styles.versionMeta}>
                                                            <span className={cn(
                                                                styles.loaderPill,
                                                                loaderType === "Vanilla" ? styles.loaderPillVanilla : styles.loaderPillModded
                                                            )}>
                                                                {loaderType}
                                                            </span>
                                                            {loaderVer && (
                                                                <span className="text-xs text-[#71717a] font-mono">{loaderVer}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    {isActive && (
                                                        <div className={styles.activeBadge}>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                                            Activa
                                                        </div>
                                                    )}
                                                    
                                                    {(activeInstance?.versions || []).length > 1 && (
                                                        <button 
                                                            onClick={() => handleRemoveVersion(v)}
                                                            className={styles.deleteVersionBtn}
                                                            title="Eliminar versión"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Background Selector Modal */}
            <AnimatePresence>
                {showBackgroundSelector && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={styles.bgSelectorOverlay}
                    >
                        <div className={styles.bgSelectorHeader}>
                            <h3 className={styles.bgSelectorTitle}>
                                <ImageIcon size={28} className="text-[#ffbfba]" />
                                Seleccionar Fondo
                            </h3>
                            <button 
                                onClick={() => setShowBackgroundSelector(false)}
                                className={styles.bgSelectorClose}
                            >
                                <X size={20} />
                                <span>Cerrar</span>
                            </button>
                        </div>
                        
                        <div className={styles.bgSelectorContent}>
                            <div className={styles.bgSelectorGrid}>
                                {/* Upload Option */}
                                <div 
                                    onClick={handleSelectCustomBackground}
                                    className={styles.bgUploadOption}
                                >
                                    <div className={styles.bgUploadIcon}>
                                        <Upload size={24} />
                                    </div>
                                    <span className={styles.bgUploadText}>Subir Imagen</span>
                                </div>

                                {BACKGROUNDS.map((bg) => (
                                    <div 
                                        key={bg}
                                        onClick={() => handleUpdateBackground(bg)}
                                        className={cn(
                                            styles.bgOption,
                                            activeInstance?.backgroundImage === bg ? styles.bgOptionActive : ""
                                        )}
                                    >
                                        <img 
                                            src={`/assets/thumbnails/${bg}`} 
                                            alt={bg}
                                            className={styles.bgImage}
                                            loading="lazy"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-12"
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
                                        onClick={handleDeleteInstance}
                                        disabled={isDeleting}
                                        className="flex-1 h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg font-bold transition-all flex items-center justify-center gap-2"
                                    >
                                        {isDeleting ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                Eliminando...
                                            </>
                                        ) : (
                                            "Eliminar"
                                        )}
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
                        className={cn(
                            "fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border px-6 py-3 rounded-xl shadow-2xl z-[300] flex items-center gap-3",
                            toastType === 'error' ? "border-red-500/50 text-red-200" : "border-white/10 text-white"
                        )}
                    >
                        {toastType === 'error' ? <AlertCircle size={20} className="text-red-500" /> : <Check size={20} className="text-green-400" />}
                        <span className="font-medium">{toastMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default InstanceSettings;
