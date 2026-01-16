import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useLauncherStore } from "@/stores/launcherStore";
import { useI18n } from "@/i18n";
import {
    X,
    ChevronRight,
    ChevronDown,
    Check,
    Trash2,
    Upload,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Folder,
    Plus,
    Loader2,
    Type,
    Image,
    Layers,
    Box,
} from "lucide-react";
import styles from "./InstanceSettings.module.css";

// Interfaces
interface Instance {
    id: string;
    name: string;
    version: string;
    versions?: string[];
    modLoader?: string;
    modLoaderVersion?: string;
    icon?: string;
    backgroundImage?: string;
    created: number;
}

interface MinecraftVersion {
    id: string;
    type: string;
    releaseTime: string;
}

interface LoaderVersion {
    version: string;
    stable?: boolean;
}

type LoaderType = "vanilla" | "fabric" | "forge" | "quilt" | "neoforge";

// Constants
const BACKGROUNDS = [
    "1021170.png", "1102409.png", "1117616.jpg", "1117617.jpg", "1117618.jpg", 
    "1117621.jpg", "1138899.png", "1168337.jpg", "1184187.jpg", "1186419.png", 
    "1234635.png", "1240231.png", "1313226.png", "1313258.png", "1317021.png", 
    "1317033.png", "1317036.png", "1321959.png", "1325278.jpeg", "1329100.png", 
    "1333794.jpeg", "1333796.jpeg", "1333797.jpeg", "1353836.png", "1353838.png", 
    "1363102.png", "1368460.png", "1370592.jpeg", "1374582.png", "1374585.png", 
    "1377209.jpg", "1389013.png", "1391270.png", "1394736.png", "1394737.png", 
    "377757.jpg", "473168.jpg", "556713.png", "556719.jpg", "556720.jpg", 
    "556722.jpg", "556724.jpg", "556729.jpg", "556736.jpg", "557913.jpg", 
    "558708.jpg", "733612.png"
];

// Icon cache
const iconCache = new Map<string, string>();

// Preload helper
export async function preloadInstanceIcon(instance: Instance): Promise<string> {
    const imgSource = instance.icon || instance.backgroundImage;
    const cacheKey = `${instance.id}-${imgSource || 'default'}`;
    
    if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)!;
    
    if (!imgSource) {
        iconCache.set(cacheKey, "/assets/thumbnails/default.png");
        return "/assets/thumbnails/default.png";
    }

    let finalSrc = "/assets/thumbnails/default.png";

    if (imgSource.startsWith('http')) {
        finalSrc = imgSource;
    } else if (imgSource.startsWith('assets/') || imgSource.startsWith('/assets/')) {
        const filename = imgSource.split('/').pop() || '';
        finalSrc = BACKGROUNDS.includes(filename) 
            ? `/assets/thumbnails/${filename}` 
            : (imgSource.startsWith('/') ? imgSource : `/${imgSource}`);
    } else if (BACKGROUNDS.includes(imgSource)) {
        finalSrc = `/assets/thumbnails/${imgSource}`;
    } else {
        try {
            const { join, isAbsolute } = await import("@tauri-apps/api/path");
            let fullPath = imgSource;
            const isAbs = await isAbsolute(imgSource) || imgSource.includes(':\\') || imgSource.startsWith('/');
            if (!isAbs) {
                const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                fullPath = await join(instancePath, imgSource);
            }
            const data = await invoke("read_binary_file", { path: fullPath }) as number[];
            const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
            finalSrc = URL.createObjectURL(blob);
        } catch (e) {
            console.error("Failed to preload icon:", e);
        }
    }
    
    iconCache.set(cacheKey, finalSrc);
    return finalSrc;
}

// Background cache (thumbnails for cards)
const bgThumbnailCache = new Map<string, string>();
// Background cache (full size for hero)
const bgFullCache = new Map<string, string>();

// Preload background helper (thumbnail version for cards)
export async function preloadInstanceBackground(instance: Instance): Promise<string> {
    const bgSource = instance.backgroundImage;
    const cacheKey = `${instance.id}-bg-thumb-${bgSource || 'default'}`;
    
    if (bgThumbnailCache.has(cacheKey)) return bgThumbnailCache.get(cacheKey)!;
    
    const defaultBg = `/assets/thumbnails/${BACKGROUNDS[0]}`;
    
    if (!bgSource) {
        bgThumbnailCache.set(cacheKey, defaultBg);
        return defaultBg;
    }

    let finalSrc = defaultBg;

    if (bgSource.startsWith('http')) {
        finalSrc = bgSource;
    } else if (bgSource.startsWith('assets/') || bgSource.startsWith('/assets/')) {
        const filename = bgSource.split('/').pop() || '';
        finalSrc = BACKGROUNDS.includes(filename) 
            ? `/assets/thumbnails/${filename}` 
            : (bgSource.startsWith('/') ? bgSource : `/${bgSource}`);
    } else if (BACKGROUNDS.includes(bgSource)) {
        finalSrc = `/assets/thumbnails/${bgSource}`;
    } else {
        try {
            const { join, isAbsolute } = await import("@tauri-apps/api/path");
            let fullPath = bgSource;
            const isAbs = await isAbsolute(bgSource) || bgSource.includes(':\\') || bgSource.startsWith('/');
            if (!isAbs) {
                const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                fullPath = await join(instancePath, bgSource);
            }
            const data = await invoke("read_binary_file", { path: fullPath }) as number[];
            const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
            finalSrc = URL.createObjectURL(blob);
        } catch (e) {
            console.error("Failed to preload background:", e);
        }
    }
    
    bgThumbnailCache.set(cacheKey, finalSrc);
    return finalSrc;
}

// Preload background helper (full size version for hero/details)
export async function preloadInstanceBackgroundFull(instance: Instance): Promise<string> {
    const bgSource = instance.backgroundImage;
    const cacheKey = `${instance.id}-bg-full-${bgSource || 'default'}`;
    
    if (bgFullCache.has(cacheKey)) return bgFullCache.get(cacheKey)!;
    
    const defaultBg = `/assets/backgrounds/${BACKGROUNDS[0]}`;
    
    if (!bgSource) {
        bgFullCache.set(cacheKey, defaultBg);
        return defaultBg;
    }

    let finalSrc = defaultBg;

    if (bgSource.startsWith('http')) {
        finalSrc = bgSource;
    } else if (bgSource.startsWith('assets/') || bgSource.startsWith('/assets/')) {
        const filename = bgSource.split('/').pop() || '';
        finalSrc = BACKGROUNDS.includes(filename) 
            ? `/assets/backgrounds/${filename}` 
            : (bgSource.startsWith('/') ? bgSource : `/${bgSource}`);
    } else if (BACKGROUNDS.includes(bgSource)) {
        finalSrc = `/assets/backgrounds/${bgSource}`;
    } else {
        try {
            const { join, isAbsolute } = await import("@tauri-apps/api/path");
            let fullPath = bgSource;
            const isAbs = await isAbsolute(bgSource) || bgSource.includes(':\\') || bgSource.startsWith('/');
            if (!isAbs) {
                const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                fullPath = await join(instancePath, bgSource);
            }
            const data = await invoke("read_binary_file", { path: fullPath }) as number[];
            const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
            finalSrc = URL.createObjectURL(blob);
        } catch (e) {
            console.error("Failed to preload full background:", e);
        }
    }
    
    bgFullCache.set(cacheKey, finalSrc);
    return finalSrc;
}

interface Props {
    instance: Instance;
    onBack: () => void;
    onUpdate?: () => void;
    onDelete?: () => void;
    preloadedIconSrc?: string;
}

export default function InstanceSettings({ instance, onBack, onUpdate, onDelete, preloadedIconSrc }: Props) {
    // i18n
    const { t } = useI18n();
    
    // Store
    const updateInstanceInStore = useLauncherStore((state) => state.updateInstance);
    
    // Track current instance ID to detect actual instance changes
    const currentInstanceId = useRef(instance.id);
    
    // State
    const [info, setInfo] = useState<Instance>(instance);
    const [name, setName] = useState(instance.name);
    const [showBgSelector, setShowBgSelector] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<"instance" | "version" | null>(null);
    const [versionToDelete, setVersionToDelete] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
    
    // Add version state
    const [showAddVersion, setShowAddVersion] = useState(false);
    const [mcVersions, setMcVersions] = useState<MinecraftVersion[]>([]);
    const [selectedMcVersion, setSelectedMcVersion] = useState<string>("");
    const [mcVersionSearch, setMcVersionSearch] = useState("");
    const [mcDropdownOpen, setMcDropdownOpen] = useState(false);
    const [selectedLoader, setSelectedLoader] = useState<LoaderType>("vanilla");
    const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState<string>("");
    const [loaderDropdownOpen, setLoaderDropdownOpen] = useState(false);
    const [loadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
    const [addingVersion, setAddingVersion] = useState(false);

    // Icon and background
    const [iconSrc, setIconSrc] = useState(preloadedIconSrc || "/assets/thumbnails/default.png");
    const [bgSrc, setBgSrc] = useState("/assets/backgrounds/1021170.png");

    // Sync with props - only when switching to a different instance
    useEffect(() => {
        if (instance.id !== currentInstanceId.current) {
            setInfo(instance);
            setName(instance.name);
            currentInstanceId.current = instance.id;
        }
    }, [instance.id]);

    // Load images
    useEffect(() => {
        const loadImages = async () => {
            if (preloadedIconSrc) {
                setIconSrc(preloadedIconSrc);
            } else {
                const icon = await preloadInstanceIcon(instance);
                setIconSrc(icon);
            }
            
            // Background - use backgroundImage only, NOT the icon
            const bg = instance.backgroundImage;
            if (!bg) {
                // No background set, use default
                setBgSrc("/assets/backgrounds/1021170.png");
                return;
            }
            
            if (bg.startsWith('assets/') || bg.startsWith('/assets/')) {
                setBgSrc(bg.startsWith('/') ? bg : `/${bg}`);
            } else if (BACKGROUNDS.includes(bg)) {
                setBgSrc(`/assets/backgrounds/${bg}`);
            } else if (bg.startsWith('http')) {
                setBgSrc(bg);
            } else {
                try {
                    const { join, isAbsolute } = await import("@tauri-apps/api/path");
                    let fullPath = bg;
                    const isAbs = await isAbsolute(bg) || bg.includes(':\\') || bg.startsWith('/');
                    if (!isAbs) {
                        const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                        fullPath = await join(instancePath, bg);
                    }
                    const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                    const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                    setBgSrc(URL.createObjectURL(blob));
                } catch {
                    setBgSrc("/assets/backgrounds/1021170.png");
                }
            }
        };
        loadImages();
    }, [instance, preloadedIconSrc]);

    // Fetch MC versions
    useEffect(() => {
        invoke<MinecraftVersion[]>("get_available_versions")
            .then(setMcVersions)
            .catch(console.error);
    }, []);

    // Fetch loader versions
    useEffect(() => {
        if (!selectedMcVersion || selectedLoader === "vanilla") {
            setLoaderVersions([]);
            setSelectedLoaderVersion("");
            return;
        }

        setLoadingLoaderVersions(true);
        const loaderCommand = {
            fabric: "get_fabric_versions",
            quilt: "get_quilt_versions", 
            forge: "get_forge_versions",
            neoforge: "get_neoforge_versions",
        }[selectedLoader];

        if (loaderCommand) {
            invoke<LoaderVersion[]>(loaderCommand, { minecraftVersion: selectedMcVersion })
                .then(versions => {
                    setLoaderVersions(versions);
                    if (versions.length > 0) setSelectedLoaderVersion(versions[0].version);
                })
                .catch(console.error)
                .finally(() => setLoadingLoaderVersions(false));
        }
    }, [selectedMcVersion, selectedLoader]);

    // Filtered versions
    const filteredMcVersions = useMemo(() => {
        if (!mcVersionSearch) return mcVersions.slice(0, 50);
        return mcVersions.filter(v => v.id.toLowerCase().includes(mcVersionSearch.toLowerCase())).slice(0, 50);
    }, [mcVersions, mcVersionSearch]);

    // Helpers
    const showToast = (type: "success" | "error", message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    const getMcVersion = (v: string) => v.split('-')[0];
    const hasLoader = (v: string) => v.includes('-') && v.split('-').length >= 3;
    const getLoaderDisplay = (v: string) => {
        const parts = v.split('-');
        if (parts.length >= 3) {
            return `${parts[1].charAt(0).toUpperCase() + parts[1].slice(1)} ${parts.slice(2).join('-')}`;
        }
        return "Vanilla";
    };

    const versions = info.versions || [info.version];

    // Handlers
    const handleSaveName = async () => {
        if (name.trim() === info.name) return;
        try {
            const updated = await invoke<Instance>("update_instance", { id: info.id, name: name.trim() });
            setInfo(updated);
            // Update store to keep UI in sync
            updateInstanceInStore(info.id, { name: updated.name });
            onUpdate?.();
            showToast("success", t('nameUpdated'));
        } catch {
            showToast("error", t('updateError'));
        }
    };

    const handleSelectIcon = async () => {
        const file = await open({
            multiple: false,
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
        });
        if (file && typeof file === "string") {
            try {
                const updated = await invoke<Instance>("update_instance", { id: info.id, icon: file });
                setInfo(updated);
                const newIcon = await preloadInstanceIcon(updated);
                setIconSrc(newIcon);
                // Update store
                updateInstanceInStore(info.id, { icon: updated.icon });
                onUpdate?.();
                showToast("success", t('iconUpdated'));
            } catch {
                showToast("error", t('iconUpdateError'));
            }
        }
    };

    const handleSelectBackground = async (bg: string | "custom") => {
        if (bg === "custom") {
            const file = await open({
                multiple: false,
                filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
            });
            if (file && typeof file === "string") {
                try {
                    const updated = await invoke<Instance>("update_instance", { id: info.id, backgroundImage: file });
                    setInfo(updated);
                    // Update store
                    updateInstanceInStore(info.id, { backgroundImage: updated.backgroundImage });
                    onUpdate?.();
                    showToast("success", t('backgroundUpdated'));
                    setShowBgSelector(false);
                } catch {
                    showToast("error", t('backgroundUpdateError'));
                }
            }
        } else {
            try {
                const updated = await invoke<Instance>("update_instance", { id: info.id, backgroundImage: `assets/backgrounds/${bg}` });
                setInfo(updated);
                setBgSrc(`/assets/backgrounds/${bg}`);
                // Update store
                updateInstanceInStore(info.id, { backgroundImage: updated.backgroundImage });
                onUpdate?.();
                showToast("success", t('backgroundUpdated'));
                setShowBgSelector(false);
            } catch {
                showToast("error", t('backgroundUpdateError'));
            }
        }
    };

    const handleSetActiveVersion = async (version: string) => {
        try {
            const updated = await invoke<Instance>("update_instance", { id: info.id, version });
            setInfo(updated);
            // Update store - also update selectedVersion since Home.tsx uses it
            updateInstanceInStore(info.id, { version: updated.version, selectedVersion: updated.version });
            onUpdate?.();
            showToast("success", t('activeVersion', { version: getMcVersion(version) }));
        } catch {
            showToast("error", t('changeVersionError'));
        }
    };

    const handleOpenFolder = async () => {
        try {
            await invoke("open_instance_folder", { id: info.id });
        } catch {
            showToast("error", t('openFolderError'));
        }
    };

    const handleDeleteInstance = async () => {
        try {
            await invoke("delete_instance", { id: info.id });
            showToast("success", t('instanceDeleted'));
            onDelete?.();
            onBack();
        } catch {
            showToast("error", t('deleteError'));
        }
    };

    const handleDeleteVersion = async () => {
        if (!versionToDelete || !info.versions) return;
        try {
            const newVersions = info.versions.filter(v => v !== versionToDelete);
            const newActive = info.version === versionToDelete ? (newVersions[0] || info.version) : info.version;
            const updated = await invoke<Instance>("update_instance", {
                id: info.id,
                versions: newVersions,
                version: newActive,
            });
            setInfo(updated);
            // Update store
            updateInstanceInStore(info.id, { versions: updated.versions, version: updated.version });
            onUpdate?.();
            showToast("success", t('versionDeleted'));
            setShowDeleteModal(false);
            setVersionToDelete(null);
            setDeleteTarget(null);
        } catch {
            showToast("error", t('deleteVersionError'));
        }
    };

    const handleAddVersion = async () => {
        if (!selectedMcVersion) return;
        setAddingVersion(true);
        try {
            const versionString = selectedLoader === "vanilla" 
                ? selectedMcVersion 
                : `${selectedMcVersion}-${selectedLoader}-${selectedLoaderVersion}`;
            
            const currentVersions = info.versions || [info.version];
            if (currentVersions.includes(versionString)) {
                showToast("error", t('versionExists'));
                setAddingVersion(false);
                return;
            }

            const updated = await invoke<Instance>("update_instance", {
                id: info.id,
                versions: [...currentVersions, versionString],
            });
            
            setInfo(updated);
            // Update store
            updateInstanceInStore(info.id, { versions: updated.versions });
            onUpdate?.();
            showToast("success", t('versionAdded'));
            setShowAddVersion(false);
            setSelectedMcVersion("");
            setSelectedLoader("vanilla");
            setSelectedLoaderVersion("");
        } catch {
            showToast("error", t('addVersionError'));
        } finally {
            setAddingVersion(false);
        }
    };

    return (
        <>
            {/* Invisible blocker to prevent sidebar hover */}
            <div className={styles.sidebarBlocker} />
            
            <motion.div 
                className={styles.container}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                {/* Backdrop */}
                <motion.div 
                    className={styles.backdrop}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={onBack}
                />

                {/* Panel */}
                <motion.div 
                    className={styles.panel}
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                >
                    {/* Hero Section */}
                    <div className={styles.hero}>
                        <img src={bgSrc} alt="" className={styles.heroBg} />
                        <div className={styles.heroOverlay} />
                        <button className={styles.closeBtn} onClick={onBack}>
                            <X size={18} />
                        </button>
                        <div className={styles.heroContent}>
                            <img src={iconSrc} alt="" className={styles.instanceIcon} />
                            <div className={styles.heroInfo}>
                                <h1 className={styles.instanceName}>{info.name}</h1>
                                <div className={styles.instanceMeta}>
                                    <span className={styles.metaBadge}>
                                        <Box size={12} />
                                        {getMcVersion(info.version)}
                                    </span>
                                    {hasLoader(info.version) && (
                                        <span className={`${styles.metaBadge} ${styles.metaBadgeAccent}`}>
                                            {getLoaderDisplay(info.version)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className={styles.content}>
                        {/* General Section */}
                        <div className={styles.sectionGroup}>
                            <div className={styles.sectionLabel}>{t('general')}</div>
                            <div className={styles.card}>
                                {/* Name */}
                                <div className={styles.inputRow}>
                                    <div className={`${styles.rowIcon} ${styles.rowIconBlue}`}>
                                        <Type size={14} />
                                    </div>
                                    <input
                                        type="text"
                                        className={styles.inputField}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder={t('instanceNamePlaceholder')}
                                    />
                                    <button 
                                        className={styles.inputSaveBtn}
                                        onClick={handleSaveName}
                                        disabled={name.trim() === info.name}
                                    >
                                        {t('save')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Appearance */}
                        <div className={styles.sectionGroup}>
                            <div className={styles.sectionLabel}>{t('appearance')}</div>
                            <div className={styles.card}>
                                <div className={styles.cardRow} onClick={handleSelectIcon}>
                                    <div className={`${styles.rowIcon} ${styles.rowIconPurple}`}>
                                        <Image size={14} />
                                    </div>
                                    <div className={styles.rowContent}>
                                        <p className={styles.rowTitle}>{t('icon')}</p>
                                        <p className={styles.rowSubtitle}>{t('changeInstanceIcon')}</p>
                                    </div>
                                    <ChevronRight size={18} className={styles.rowChevron} />
                                </div>
                                <div className={styles.cardRow} onClick={() => setShowBgSelector(true)}>
                                    <div className={`${styles.rowIcon} ${styles.rowIconOrange}`}>
                                        <Layers size={14} />
                                    </div>
                                    <div className={styles.rowContent}>
                                        <p className={styles.rowTitle}>{t('background')}</p>
                                        <p className={styles.rowSubtitle}>{t('changeBackground')}</p>
                                    </div>
                                    <ChevronRight size={18} className={styles.rowChevron} />
                                </div>
                            </div>
                        </div>

                        {/* Versions */}
                        <div className={styles.sectionGroup}>
                            <div className={styles.sectionLabel}>{t('installedVersions')}</div>
                            <div className={styles.card}>
                                <div className={styles.versionList}>
                                    {versions.map((v) => (
                                        <div 
                                            key={v}
                                            className={`${styles.versionItem} ${info.version === v ? styles.versionItemActive : ""}`}
                                            onClick={() => handleSetActiveVersion(v)}
                                        >
                                            <div className={`${styles.versionDot} ${info.version === v ? styles.versionDotActive : ""}`} />
                                            <div className={styles.versionInfo}>
                                                <div className={styles.versionNumber}>{getMcVersion(v)}</div>
                                                <div className={styles.versionLoader}>
                                                    {hasLoader(v) ? getLoaderDisplay(v) : "Vanilla"}
                                                </div>
                                            </div>
                                            <div className={styles.versionActions}>
                                                {info.version === v && (
                                                    <span className={styles.activeBadge}>{t('active')}</span>
                                                )}
                                                {versions.length > 1 && (
                                                    <button
                                                        className={styles.deleteVersionBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setVersionToDelete(v);
                                                            setDeleteTarget("version");
                                                            setShowDeleteModal(true);
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Version */}
                                <div className={styles.addVersionSection}>
                                    {!showAddVersion ? (
                                        <button 
                                            className={styles.addVersionBtn}
                                            onClick={() => setShowAddVersion(true)}
                                        >
                                            <Plus size={16} />
                                            {t('addVersion')}
                                        </button>
                                    ) : (
                                        <div className={styles.addVersionForm}>
                                            {/* MC Version */}
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>{t('minecraftVersion')}</label>
                                                <div className={styles.dropdown}>
                                                    <button
                                                        className={`${styles.dropdownTrigger} ${mcDropdownOpen ? styles.dropdownTriggerOpen : ""}`}
                                                        onClick={() => setMcDropdownOpen(!mcDropdownOpen)}
                                                    >
                                                        {selectedMcVersion || <span className={styles.dropdownPlaceholder}>{t('select')}</span>}
                                                        <ChevronDown size={16} />
                                                    </button>
                                                    <AnimatePresence>
                                                        {mcDropdownOpen && (
                                                            <motion.div
                                                                className={styles.dropdownMenu}
                                                                initial={{ opacity: 0, y: -8 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -8 }}
                                                            >
                                                                <div className={styles.dropdownSearch}>
                                                                    <input
                                                                        type="text"
                                                                        className={styles.dropdownSearchInput}
                                                                        placeholder={t('searchVersion')}
                                                                        value={mcVersionSearch}
                                                                        onChange={(e) => setMcVersionSearch(e.target.value)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                                {filteredMcVersions.map((v) => (
                                                                    <div
                                                                        key={v.id}
                                                                        className={`${styles.dropdownItem} ${selectedMcVersion === v.id ? styles.dropdownItemActive : ""}`}
                                                                        onClick={() => {
                                                                            setSelectedMcVersion(v.id);
                                                                            setMcDropdownOpen(false);
                                                                            setMcVersionSearch("");
                                                                        }}
                                                                    >
                                                                        {v.id}
                                                                        <span className={`${styles.dropdownItemBadge} ${v.type === "release" ? styles.dropdownItemBadgeStable : ""}`}>
                                                                            {v.type}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>

                                            {/* Loader */}
                                            <div className={styles.formGroup}>
                                                <label className={styles.formLabel}>Mod Loader</label>
                                                <div className={styles.loaderPills}>
                                                    {(["vanilla", "fabric", "forge", "quilt", "neoforge"] as LoaderType[]).map((loader) => (
                                                        <button
                                                            key={loader}
                                                            className={`${styles.loaderPill} ${selectedLoader === loader ? styles.loaderPillActive : ""}`}
                                                            onClick={() => setSelectedLoader(loader)}
                                                        >
                                                            {loader.charAt(0).toUpperCase() + loader.slice(1)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Loader Version */}
                                            {selectedLoader !== "vanilla" && selectedMcVersion && (
                                                <div className={styles.formGroup}>
                                                    <label className={styles.formLabel}>{t('loaderVersionLabel', { loader: selectedLoader })}</label>
                                                    {loadingLoaderVersions ? (
                                                        <div className={styles.loadingText}>
                                                            <Loader2 size={14} className={styles.loadingSpinner} />
                                                            {t('loadingVersions')}
                                                        </div>
                                                    ) : loaderVersions.length === 0 ? (
                                                        <div className={styles.loadingText}>
                                                            {t('noVersionsAvailable')}
                                                        </div>
                                                    ) : (
                                                        <div className={styles.dropdown}>
                                                            <button
                                                                className={`${styles.dropdownTrigger} ${loaderDropdownOpen ? styles.dropdownTriggerOpen : ""}`}
                                                                onClick={() => setLoaderDropdownOpen(!loaderDropdownOpen)}
                                                            >
                                                                {selectedLoaderVersion || <span className={styles.dropdownPlaceholder}>{t('select')}</span>}
                                                                <ChevronDown size={16} />
                                                            </button>
                                                            <AnimatePresence>
                                                                {loaderDropdownOpen && (
                                                                    <motion.div
                                                                        className={styles.dropdownMenu}
                                                                        initial={{ opacity: 0, y: -8 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0, y: -8 }}
                                                                    >
                                                                        {loaderVersions.map((v) => (
                                                                            <div
                                                                                key={v.version}
                                                                                className={`${styles.dropdownItem} ${selectedLoaderVersion === v.version ? styles.dropdownItemActive : ""}`}
                                                                                onClick={() => {
                                                                                    setSelectedLoaderVersion(v.version);
                                                                                    setLoaderDropdownOpen(false);
                                                                                }}
                                                                            >
                                                                                {v.version}
                                                                                {v.stable && (
                                                                                    <span className={`${styles.dropdownItemBadge} ${styles.dropdownItemBadgeStable}`}>
                                                                                        Stable
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className={styles.formActions}>
                                                <button
                                                    className={`${styles.formBtn} ${styles.formBtnSecondary}`}
                                                    onClick={() => {
                                                        setShowAddVersion(false);
                                                        setSelectedMcVersion("");
                                                        setSelectedLoader("vanilla");
                                                    }}
                                                >
                                                    {t('cancel')}
                                                </button>
                                                <button
                                                    className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                                                    onClick={handleAddVersion}
                                                    disabled={!selectedMcVersion || addingVersion || (selectedLoader !== "vanilla" && !selectedLoaderVersion)}
                                                >
                                                    {addingVersion ? (
                                                        <>
                                                            <Loader2 size={14} className={styles.loadingSpinner} />
                                                            {t('adding')}
                                                        </>
                                                    ) : (
                                                        t('add')
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Advanced */}
                        <div className={styles.sectionGroup}>
                            <div className={styles.sectionLabel}>{t('advanced')}</div>
                            <div className={styles.card}>
                                <div className={styles.cardRow} onClick={handleOpenFolder}>
                                    <div className={`${styles.rowIcon} ${styles.rowIconGreen}`}>
                                        <Folder size={14} />
                                    </div>
                                    <div className={styles.rowContent}>
                                        <p className={styles.rowTitle}>{t('openFolder')}</p>
                                        <p className={styles.rowSubtitle}>{t('exploreInstanceFiles')}</p>
                                    </div>
                                    <ChevronRight size={18} className={styles.rowChevron} />
                                </div>
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className={styles.sectionGroup}>
                            <div className={styles.sectionLabel}>{t('dangerZone')}</div>
                            <div className={`${styles.card} ${styles.dangerCard}`}>
                                <div 
                                    className={styles.cardRow} 
                                    onClick={() => {
                                        setDeleteTarget("instance");
                                        setShowDeleteModal(true);
                                    }}
                                >
                                    <div className={`${styles.rowIcon} ${styles.rowIconRed}`}>
                                        <Trash2 size={14} />
                                    </div>
                                    <div className={styles.rowContent}>
                                        <p className={styles.rowTitle}>{t('deleteInstanceTitle')}</p>
                                        <p className={styles.rowSubtitle}>{t('actionCannotBeUndone')}</p>
                                    </div>
                                    <ChevronRight size={18} className={styles.rowChevron} />
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Background Selector Modal */}
            <AnimatePresence>
                {showBgSelector && (
                    <motion.div
                        className={styles.bgModal}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className={styles.bgModalBackdrop} onClick={() => setShowBgSelector(false)} />
                        <motion.div
                            className={styles.bgModalContent}
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                        >
                            <div className={styles.bgModalHeader}>
                                <h2 className={styles.bgModalTitle}>{t('selectBackground')}</h2>
                                <button className={styles.bgModalClose} onClick={() => setShowBgSelector(false)}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div className={styles.bgModalBody}>
                                <div className={styles.bgGrid}>
                                    <div className={styles.bgUpload} onClick={() => handleSelectBackground("custom")}>
                                        <Upload size={24} className={styles.bgUploadIcon} />
                                        <span className={styles.bgUploadText}>{t('uploadImage')}</span>
                                    </div>
                                    {BACKGROUNDS.map((bg) => (
                                        <div
                                            key={bg}
                                            className={`${styles.bgItem} ${info.backgroundImage?.includes(bg) ? styles.bgItemActive : ""}`}
                                            onClick={() => handleSelectBackground(bg)}
                                        >
                                            <img src={`/assets/thumbnails/${bg}`} alt="" className={styles.bgItemImage} loading="lazy" />
                                            {info.backgroundImage?.includes(bg) && (
                                                <div className={styles.bgItemCheck}>
                                                    <Check size={12} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteModal && (
                    <motion.div
                        className={styles.confirmModal}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div className={styles.confirmModalBackdrop} onClick={() => setShowDeleteModal(false)} />
                        <motion.div
                            className={styles.confirmModalContent}
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                        >
                            <div className={styles.confirmModalIcon}>
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className={styles.confirmModalTitle}>
                                {deleteTarget === "instance" ? t('deleteInstanceQuestion') : t('deleteVersionQuestion')}
                            </h3>
                            <p className={styles.confirmModalText}>
                                {deleteTarget === "instance" ? (
                                    <>
                                        {t('deleteInstanceWarning')}{" "}
                                        <span className={styles.confirmModalName}>{info.name}</span>
                                    </>
                                ) : (
                                    <>
                                        {t('deleteVersionWarning')}{" "}
                                        <span className={styles.confirmModalName}>{versionToDelete}</span>?
                                    </>
                                )}
                            </p>
                            <div className={styles.confirmModalActions}>
                                <button
                                    className={`${styles.confirmModalBtn} ${styles.confirmModalBtnCancel}`}
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setVersionToDelete(null);
                                        setDeleteTarget(null);
                                    }}
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    className={`${styles.confirmModalBtn} ${styles.confirmModalBtnDanger}`}
                                    onClick={deleteTarget === "instance" ? handleDeleteInstance : handleDeleteVersion}
                                >
                                    {t('delete')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        className={`${styles.toast} ${toast.type === "success" ? styles.toastSuccess : styles.toastError}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                    >
                        {toast.type === "success" ? (
                            <CheckCircle size={18} className={`${styles.toastIcon} ${styles.toastIconSuccess}`} />
                        ) : (
                            <XCircle size={18} className={`${styles.toastIcon} ${styles.toastIconError}`} />
                        )}
                        <span className={styles.toastMessage}>{toast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
