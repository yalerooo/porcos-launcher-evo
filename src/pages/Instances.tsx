import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Trash2, Loader2, Search, Box, Cpu, ChevronDown, Check, AlertCircle, SearchX } from 'lucide-react';
import { useLauncherStore, Instance, getCachedImages } from '@/stores/launcherStore';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
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
    imageCacheVersion: number;
}

const InstanceCard: React.FC<InstanceCardProps> = ({ instance, index, onClick, onPlay, onDelete, onUpdate, isLaunching, imageCacheVersion }) => {
    const { t } = useI18n();
    // Get cached images from global store
    const cached = getCachedImages(instance.id);
    const [iconSrc, setIconSrc] = useState(cached.icon || "https://www.minecraft.net/content/dam/games/minecraft/key-art/Games_Subnav_Minecraft-300x465.jpg");
    const [bgSrc, setBgSrc] = useState<string>(cached.thumbnail || DEFAULT_BG);
    const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);

    const handleVersionChange = async (version: string) => {
        // Check if it's a complex version
        const complexVersionMatch = version.match(/^(.*) \((.*) (.*)\)$/);
        let newModLoader = instance.modLoader;
        let newModLoaderVersion = instance.modLoaderVersion;

        if (complexVersionMatch) {
            // It's a complex version, update global state to match
            newModLoader = complexVersionMatch[2];
            newModLoaderVersion = complexVersionMatch[3];
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

    // Sync with cached images when instance or cache version changes
    useEffect(() => {
        const cached = getCachedImages(instance.id);
        if (cached.icon) setIconSrc(cached.icon);
        if (cached.thumbnail) setBgSrc(cached.thumbnail);
    }, [instance.id, instance.icon, instance.backgroundImage, imageCacheVersion]);

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
};

const Instances: React.FC = () => {
    const { t } = useI18n();
    const {
        instances,
        removeInstance,
        setInstances,
        updateInstance,
        versions,
        setVersions,
        isLaunching,
        setIsLaunching,
        addLog,
        memoryMin,
        memoryMax,
        setSelectedInstance,
        setLaunchStartTime,
        imageCacheVersion
    } = useLauncherStore();
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

    const filteredInstances = instances.filter(instance => 
        instance.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handlePlayInstance = async (e: React.MouseEvent, instance: Instance) => {
        e.stopPropagation();
        if (!user || isLaunching) return;

        setSelectedInstance(instance);
        setIsLaunching(true);
        setLaunchStartTime(Date.now());
        addLog(`Launching instance: ${instance.name} (${instance.version})...`);

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const instancePath = await invoke("get_instance_path", { id: instance.id });
            
            let uuid = user.uuid;
            if (user.mode === 'offline' && !uuid) {
                uuid = await invoke("generate_offline_uuid", { username: user.username });
            }

            const options = {
                version: instance.version,
                modLoader: instance.modLoader || null,
                modLoaderVersion: instance.modLoaderVersion || null,
                auth: user.mode === 'microsoft' ? {
                    Microsoft: {
                        access_token: user.accessToken || '',
                        uuid: uuid,
                        username: user.username,
                        xuid: user.xuid || '0'
                    }
                } : {
                    Offline: {
                        uuid: uuid,
                        username: user.username,
                        xuid: '0'
                    }
                },
                memoryMin: `${memoryMin}G`,
                memoryMax: `${memoryMax}G`,
                javaPath: null,
                minecraftDir: instancePath
            };

            await invoke("launch_minecraft", { options });

        } catch (error) {
            console.error("Launch failed:", error);
            addLog(`Launch failed: ${error}`);
            setToastType('error');
            setToastMessage(typeof error === 'string' ? error : "Error al iniciar el juego");
            setTimeout(() => setToastMessage(null), 5000);
            setIsLaunching(false);
            setLaunchStartTime(null);
        } finally {
            // setIsLaunching(false); // Don't reset here, wait for game exit
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
                            imageCacheVersion={imageCacheVersion}
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
