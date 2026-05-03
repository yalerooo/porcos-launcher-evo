import React, { useState, useEffect, useRef } from 'react';
import { Search, Download, Loader2, Filter, Box, Package, ChevronDown, Plus, Gamepad2, Cpu, Check, RefreshCw, ShieldCheck, Trash2, Power } from 'lucide-react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { useLauncherStore } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import ModpackInstallModal from '@/components/ModpackInstallModal';
import ModInstallSuccessModal from '@/components/ModInstallSuccessModal';
import ModDetailsView from '@/components/ModDetailsView';
import ConfirmModal from '@/components/ConfirmModal';
import DependencySelectModal, { type DependencyItem } from '@/components/DependencySelectModal';
import { useI18n } from '@/i18n';
import { useModSearch, CATEGORIES, type ModSource, type SearchType } from '@/hooks/useModSearch';
import { useInstalledMods } from '@/hooks/useInstalledMods';
import { useModInstall } from '@/hooks/useModInstall';
import { useModUpdates } from '@/hooks/useModUpdates';

import styles from './Mods.module.css';

const InstanceDropdownIcon = ({ instance }: { instance: any }) => {
    const [src, setSrc] = useState<string>("");

    useEffect(() => {
        let isMounted = true;
        const loadIcon = async () => {
            const imgSource = instance.icon || instance.backgroundImage || (instance as any).background_image;
            
            if (!imgSource) {
                if (isMounted) setSrc("");
                return;
            }

            let newSrc = "";
            if (imgSource.startsWith('http')) {
                newSrc = imgSource;
            } else if (imgSource.startsWith('assets/') || imgSource.startsWith('/assets/')) {
                newSrc = imgSource.startsWith('/') ? imgSource : `/${imgSource}`;
            } else {
                try {
                    const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                    const fullPath = await join(instancePath, imgSource);
                    
                    const data = await invoke("read_binary_file", { path: fullPath }) as number[];
                    const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
                    newSrc = URL.createObjectURL(blob);
                } catch (e) {
                    console.error("Failed to resolve icon path", e);
                }
            }
            
            if (isMounted && newSrc) setSrc(newSrc);
        };
        
        loadIcon();
        return () => { isMounted = false; };
    }, [instance.id, instance.icon, instance.backgroundImage]);

    if (!src) return <Box size={14} />;

    return <img src={src} className="w-4 h-4 rounded-sm object-cover" />;
};

interface FilterDropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder: string;
    icon?: React.ReactNode;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ value, onChange, options, placeholder, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className={styles.filterInputContainer} ref={dropdownRef}>
            {icon}
            <button 
                className={styles.customSelectButton}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate">
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className={styles.customSelectDropdown}>
                    <button
                        className={cn(styles.customSelectOption, value === "" && styles.customSelectOptionActive)}
                        onClick={() => {
                            onChange("");
                            setIsOpen(false);
                        }}
                    >
                        {placeholder}
                    </button>
                    {options.map((option) => (
                        <button
                            key={option.value}
                            className={cn(
                                styles.customSelectOption,
                                value === option.value && styles.customSelectOptionActive
                            )}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const Mods: React.FC = () => {
    const { t } = useI18n();
    const { selectedInstance, instances } = useLauncherStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSource, setActiveSource] = useState<ModSource>('modrinth');
    const [searchType, setSearchType] = useState<SearchType>('mods');
    const [targetInstanceId, setTargetInstanceId] = useState<string>(selectedInstance?.id || instances[0]?.id || '');
    
    // Filters
    const [filterVersion, setFilterVersion] = useState<string>('');
    const [filterLoader, setFilterLoader] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [page, setPage] = useState(0);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Mod Details
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [availableVersions, setAvailableVersions] = useState<any[]>([]);

    // Elevated state shared between hooks
    const [updatesAvailable, setUpdatesAvailable] = useState<Map<string, boolean>>(new Map());

    // Confirm modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        danger?: boolean;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    const confirmResolveRef = useRef<((val: boolean) => void) | null>(null);

    const showConfirmAsync = (opts: { title: string; message: string; confirmText?: string; danger?: boolean }): Promise<boolean> => {
        return new Promise((resolve) => {
            confirmResolveRef.current = resolve;
            setConfirmModal({
                isOpen: true,
                ...opts,
                onConfirm: () => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                    confirmResolveRef.current = null;
                },
            });
        });
    };

    const handleConfirmCancel = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        if (confirmResolveRef.current) {
            confirmResolveRef.current(false);
            confirmResolveRef.current = null;
        }
    };

    // Dependency select modal state
    const [depSelectModal, setDepSelectModal] = useState<{
        isOpen: boolean;
        dependencies: DependencyItem[];
    }>({ isOpen: false, dependencies: [] });
    const depSelectResolveRef = useRef<((val: string[]) => void) | null>(null);

    const showDependencySelectAsync = (deps: DependencyItem[]): Promise<string[]> => {
        return new Promise((resolve) => {
            depSelectResolveRef.current = resolve;
            setDepSelectModal({ isOpen: true, dependencies: deps });
        });
    };

    const handleDepSelectConfirm = (selectedIds: string[]) => {
        setDepSelectModal(prev => ({ ...prev, isOpen: false }));
        if (depSelectResolveRef.current) {
            depSelectResolveRef.current(selectedIds);
            depSelectResolveRef.current = null;
        }
    };

    const handleDepSelectCancel = () => {
        setDepSelectModal(prev => ({ ...prev, isOpen: false }));
        if (depSelectResolveRef.current) {
            depSelectResolveRef.current([]);
            depSelectResolveRef.current = null;
        }
    };

    // ─── Hooks ─────────────────────────────────────────────────────

    const {
        installedMods, setInstalledMods,
        installedSlugs, setInstalledSlugs,
        isLoadingMods,
        saveInstalledMod,
    } = useInstalledMods(targetInstanceId);

    const {
        installingModId,
        verificationStatus, setVerificationStatus,
        showSuccessModal, setShowSuccessModal,
        installedModName,
        installedDependencies,
        selectedModpack,
        showModpackModal, setShowModpackModal,
        handleInstall,
        handleUninstall,
        handleToggleMod,
        installModrinth,
        installCurseForge,
    } = useModInstall({
        targetInstanceId,
        filterVersion,
        filterLoader,
        searchType,
        installedMods,
        installedSlugs,
        saveInstalledMod,
        setInstalledMods,
        setInstalledSlugs,
        setUpdatesAvailable,
        showConfirmAsync,
    });

    const { items, isLoading, totalHits } = useModSearch({
        activeSource,
        searchType,
        searchQuery,
        filterVersion,
        filterLoader,
        filterCategory,
        page,
        installingModId,
        installedMods,
    });

    const { isUpdatingAll, handleUpdateAll, verifyDependencies } = useModUpdates({
        items,
        installedMods,
        installedSlugs,
        filterVersion,
        filterLoader,
        targetInstanceId,
        updatesAvailable,
        setUpdatesAvailable,
        handleInstall,
        installModrinth,
        installCurseForge,
        setVerificationStatus,
        showConfirmAsync,
        showDependencySelectAsync,
        setTargetInstanceId,
    });

    // ─── Effects ───────────────────────────────────────────────────

    useEffect(() => {
        const fetchVersions = async () => {
            try {
                const v = await invoke('get_available_versions') as any[];
                setAvailableVersions(v);
            } catch (e) {
                console.error("Failed to fetch versions", e);
            }
        };
        fetchVersions();
    }, []);

    useEffect(() => {
        if (!targetInstanceId && instances.length > 0) {
            setTargetInstanceId(instances[0].id);
        }
    }, [instances, targetInstanceId]);

    // Reset page when filters change
    useEffect(() => {
        setPage(0);
    }, [searchQuery, activeSource, searchType, filterVersion, filterLoader, filterCategory]);

    // Auto-set filters when switching to Mods mode with an instance selected
    useEffect(() => {
        if (searchType === 'mods' || searchType === 'updates') {
            if (activeSource === 'porcos' && searchType === 'mods') {
                setActiveSource('modrinth');
            }

            if (targetInstanceId) {
                const instance = instances.find(i => i.id === targetInstanceId);
                if (instance) {
                    let version = instance.selectedVersion || instance.version;
                    if (version) {
                        const complexMatch = version.match(/^(.*) \((.*) (.*)\)$/);
                        if (complexMatch) version = complexMatch[1];
                        setFilterVersion(version);
                    }
                    if (instance.modLoader) {
                        setFilterLoader(instance.modLoader.toLowerCase());
                    } else {
                        setFilterLoader('');
                    }
                }
            }
        } else if (searchType === 'modpacks') {
            setFilterVersion('');
            setFilterLoader('');
        }
    }, [searchType, targetInstanceId, instances, activeSource]);

    // ─── Derived ───────────────────────────────────────────────────

    const getTargetInstanceName = () => {
        return instances.find(i => i.id === targetInstanceId)?.name || "Seleccionar Instancia";
    };

    const targetInstance = instances.find(i => i.id === targetInstanceId);
    const filteredItems = items.filter(item => searchType !== 'updates' || updatesAvailable.get(item.id));

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
    };

    // ─── Render ────────────────────────────────────────────────────

    return (
        <div className={styles.container} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* Header */}
            <div className={styles.header}>
                
                {/* Top Row: Title & Source Switcher */}
                <div className={styles.topRow}>
                    <div className={styles.switchContainer}>
                        <button
                            onClick={() => setSearchType('mods')}
                            className={cn(styles.switchButton, searchType === 'mods' && styles.switchButtonActive)}
                        >
                            <Package size={16} />
                            {t('modsTab')}
                        </button>
                        <button
                            onClick={() => setSearchType('modpacks')}
                            className={cn(styles.switchButton, searchType === 'modpacks' && styles.switchButtonActive)}
                        >
                            <Box size={16} />
                            {t('modpacks')}
                        </button>
                        <button
                            onClick={() => setSearchType('updates')}
                            className={cn(styles.switchButton, searchType === 'updates' && styles.switchButtonActive)}
                        >
                            <RefreshCw size={16} />
                            {t('updates')}
                        </button>
                    </div>

                    {/* Source Switcher */}
                    {searchType !== 'updates' && (
                        <div className={styles.switchContainer}>
                            <button
                                onClick={() => setActiveSource('modrinth')}
                                className={cn(styles.switchButton, activeSource === 'modrinth' && styles.sourceButtonModrinth)}
                            >
                                Modrinth
                            </button>
                            <button
                                onClick={() => setActiveSource('curseforge')}
                                className={cn(styles.switchButton, activeSource === 'curseforge' && styles.sourceButtonCurseforge)}
                            >
                                CurseForge
                            </button>
                            {searchType === 'modpacks' && (
                                <button
                                    onClick={() => setActiveSource('porcos')}
                                    className={cn(styles.switchButton, activeSource === 'porcos' && styles.sourceButtonPorcos)}
                                >
                                    Porcos
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Bottom Row: Instance Selector (Only for Mods) */}
                {(searchType === 'mods' || searchType === 'updates') && (
                    <div className={styles.controlsRow}>
                        <span className={styles.label}>{t('installIn')}</span>
                        <div className={styles.instanceSelectorWrapper}>
                            <button 
                                className={styles.instanceSelector}
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            >
                                <span className="truncate">{getTargetInstanceName()}</span>
                                <ChevronDown size={14} />
                            </button>
                            
                            {/* Dropdown */}
                            <div className={cn(styles.dropdown, isDropdownOpen && styles.dropdownOpen)}>
                                {instances.map(instance => (
                                    <button
                                        key={instance.id}
                                        onClick={() => {
                                            setTargetInstanceId(instance.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        className={cn(
                                            styles.dropdownItem,
                                            targetInstanceId === instance.id && styles.dropdownItemActive
                                        )}
                                    >
                                        <InstanceDropdownIcon instance={instance} />
                                        {instance.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Version Selector for Multi-version Instances */}
                        {searchType === 'mods' && targetInstance?.versions && targetInstance.versions.length > 1 && (
                            <FilterDropdown
                                value={filterVersion}
                                onChange={setFilterVersion}
                                options={(targetInstance?.versions || []).map((v: string) => ({ value: v, label: v }))}
                                placeholder={t('anyVersion')}
                                icon={<Gamepad2 size={16} className="text-[#a1a1aa]" />}
                            />
                        )}
                        
                        {/* Active Filters Badge */}
                        {!(searchType === 'mods' && targetInstance?.versions && targetInstance.versions.length > 1) && (filterVersion || filterLoader) && (
                            <div className={styles.filterBadge}>
                                <Filter size={12} className="text-[#ffbfba]" />
                                <span className={styles.filterBadgeText}>
                                    {t('filteredBy')} {filterVersion} {filterLoader && `(${filterLoader})`}
                                </span>
                            </div>
                        )}

                        {/* Update All Button */}
                        {searchType === 'updates' && items.filter(item => updatesAvailable.get(item.id)).length > 0 && (
                            <button 
                                onClick={handleUpdateAll}
                                disabled={isUpdatingAll}
                                className={styles.updateAllButton}
                            >
                                {isUpdatingAll ? (
                                    <Loader2 className="animate-spin" size={14} />
                                ) : (
                                    <RefreshCw size={14} />
                                )}
                                {isUpdatingAll ? t('updating') : `${t('updateAll')} (${items.filter(item => updatesAvailable.get(item.id)).length})`}
                            </button>
                        )}

                        {/* Verify Dependencies Button */}
                        {searchType === 'mods' && (
                            <button 
                                onClick={verifyDependencies}
                                disabled={isUpdatingAll || isLoadingMods}
                                className={styles.updateAllButton}
                                title={isLoadingMods ? 'Cargando mods...' : t('verifyDependencies')}
                                style={{ minWidth: '180px' }}
                            >
                                {isUpdatingAll || isLoadingMods ? (
                                    <Loader2 className="animate-spin" size={14} />
                                ) : (
                                    <ShieldCheck size={14} />
                                )}
                                {isLoadingMods ? 'Cargando mods...' : verificationStatus ? verificationStatus : (isUpdatingAll ? t('updating') : t('verifyDependencies'))}
                            </button>
                        )}
                    </div>
                )}

                {/* Filters Row - Only for Modpacks */}
                {searchType === 'modpacks' && (
                    <div className={styles.controlsRow}>
                        <FilterDropdown
                            value={filterVersion}
                            onChange={setFilterVersion}
                            options={availableVersions.map((v: any) => ({
                                value: v.id,
                                label: `${v.id} ${v.version_type && v.version_type !== 'release' ? `(${v.version_type})` : ''}`
                            }))}
                            placeholder={t('anyVersion')}
                            icon={<Gamepad2 size={16} className="text-[#a1a1aa]" />}
                        />
                        <FilterDropdown
                            value={filterLoader}
                            onChange={setFilterLoader}
                            options={[
                                { value: "forge", label: "Forge" },
                                { value: "fabric", label: "Fabric" },
                                { value: "quilt", label: "Quilt" },
                                { value: "neoforge", label: "NeoForge" }
                            ]}
                            placeholder={t('anyLoader')}
                            icon={<Cpu size={16} className="text-[#a1a1aa]" />}
                        />
                    </div>
                )}
            </div>

            <div className={cn(styles.contentArea, (activeSource === 'porcos' || searchType === 'updates') && styles.contentAreaFull)}>
                {/* Sidebar */}
                {(searchType === 'mods' || searchType === 'modpacks') && activeSource !== 'porcos' && (
                    <div className={styles.sidebar}>
                        <h3 className={styles.categoryTitle}>{t('categories')}</h3>
                        <div className={styles.categoryList}>
                            <button
                                onClick={() => setFilterCategory('')}
                                className={cn(styles.categoryButton, !filterCategory && styles.categoryButtonActive)}
                            >
                                {t('allCategories')}
                            </button>
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setFilterCategory(cat.id)}
                                    className={cn(styles.categoryButton, filterCategory === cat.id && styles.categoryButtonActive)}
                                >
                                    {t(cat.nameKey as any)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                {searchType !== 'updates' && (
                    <div className={cn(styles.searchSection, activeSource === 'porcos' && styles.fullWidth)}>
                        <form onSubmit={handleSearch}>
                            <div className={styles.searchContainer}>
                                <Search className={styles.searchIcon} size={20} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('searchPlaceholder', { type: searchType, source: activeSource === 'modrinth' ? 'Modrinth' : 'CurseForge' })}
                                    className={styles.searchInput}
                                />
                                <button type="submit" className={styles.searchButton}>
                                    {t('searchButton')}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* List & Pagination */}
                
                    <div className={cn(styles.resultsList, (activeSource === 'porcos' || searchType === 'updates') && styles.fullWidth)}>
                        {isLoading ? (
                            <div className={styles.loadingContainer}>
                                <Loader2 className={styles.loadingSpinner} size={40} />
                            </div>
                        ) : filteredItems.length > 0 ? (
                            <div className={styles.grid}>
                                {filteredItems.map((item) => {
                                    const isInstalled = installedMods.has(item.id) || (item.original?.slug && installedSlugs.has(item.original.slug.toLowerCase()));
                                    const hasUpdate = updatesAvailable.get(item.id);
                                    
                                    return (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={styles.card}
                                            onClick={() => {
                                                setSelectedItem(item);
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {/* Icon */}
                                            <div className={styles.cardIcon}>
                                                {item.icon ? (
                                                    <img src={item.icon} alt={item.name} />
                                                ) : (
                                                    <div>
                                                        <Package size={32} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className={styles.cardInfo}>
                                                <div className={styles.cardHeader}>
                                                    <h3 className={styles.cardTitle}>{item.name}</h3>
                                                    <span className={styles.cardAuthor}>by {item.author}</span>
                                                </div>
                                                <p className={styles.cardDesc}>{item.description}</p>
                                                <div className={styles.cardStats}>
                                                    <span className={styles.statItem}>
                                                        <Download size={12} />
                                                        {item.downloads}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1">
                                                {/* Toggle / Uninstall buttons — only for installed mods */}
                                                {isInstalled && searchType !== 'modpacks' && (
                                                    <>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleToggleMod(item);
                                                            }}
                                                            className="p-2 rounded-lg transition-colors hover:bg-white/10 text-[#a1a1aa] hover:text-yellow-400"
                                                            title={installedMods.get(item.id)?.file?.endsWith('.disabled') ? 'Activar mod' : 'Desactivar mod'}
                                                        >
                                                            <Power size={16} className={installedMods.get(item.id)?.file?.endsWith('.disabled') ? 'text-yellow-500' : ''} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleUninstall(item);
                                                            }}
                                                            className="p-2 rounded-lg transition-colors hover:bg-red-500/20 text-[#a1a1aa] hover:text-red-400"
                                                            title="Desinstalar mod"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleInstall(item);
                                                    }}
                                                    disabled={installingModId === item.id || (isInstalled && !hasUpdate && searchType === 'mods')}
                                                    className={cn(
                                                        styles.installButton,
                                                        searchType === 'modpacks' ? styles.installButtonModpacks : styles.installButtonMods,
                                                        isInstalled && !hasUpdate && searchType === 'mods' && "opacity-50 cursor-not-allowed bg-green-500/20 text-green-400",
                                                        isInstalled && hasUpdate && searchType === 'mods' && "bg-[#ffbfba]/20 text-[#ffbfba] hover:bg-[#ffbfba]/30 border-[#ffbfba]/30",
                                                        installedMods.get(item.id)?.file?.endsWith('.disabled') && "opacity-50"
                                                    )}
                                                >
                                                    {installingModId === item.id ? (
                                                        <Loader2 className="animate-spin" size={18} />
                                                    ) : searchType === 'modpacks' ? (
                                                        <>
                                                            <Plus size={18} />
                                                            {t('createInstanceFromModpack')}
                                                        </>
                                                    ) : isInstalled ? (
                                                        hasUpdate ? (
                                                            <>
                                                                <Download size={18} />
                                                                {t('update')}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Check size={18} />
                                                                {installedMods.get(item.id)?.file?.endsWith('.disabled') ? 'Desactivado' : t('installed')}
                                                            </>
                                                        )
                                                    ) : (
                                                        <>
                                                            <Download size={18} />
                                                            {t('install')}
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                {searchType === 'updates' ? (
                                    <>
                                        <Check size={48} className={styles.emptyIcon} />
                                        <p>{t('allUpToDate')}</p>
                                    </>
                                ) : (
                                    <>
                                        <Search size={48} className={styles.emptyIcon} />
                                        <p>{t('searchToStart', { type: searchType })}</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pagination Bar */}
                    {!isLoading && items.length > 0 && searchType !== 'updates' && (
                        <div className={cn(styles.paginationBar, activeSource === 'porcos' && styles.fullWidth)}>
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className={styles.pageButton}
                            >
                                {t('previous')}
                            </button>
                            <span className={styles.pageInfo}>
                                {t('pageOf', { current: page + 1, total: Math.ceil(totalHits / 20) })}
                            </span>
                            <button
                                onClick={() => setPage(p => p + 1)}
                                disabled={(page + 1) * 20 >= totalHits}
                                className={styles.pageButton}
                            >
                                {t('nextPage')}
                            </button>
                        </div>
                    )}
            </div>

            <ModpackInstallModal 
                isOpen={showModpackModal} 
                onClose={() => setShowModpackModal(false)} 
                modpack={selectedModpack} 
            />

            <ModInstallSuccessModal
                isOpen={showSuccessModal}
                onClose={() => setShowSuccessModal(false)}
                modName={installedModName}
                instanceName={getTargetInstanceName()}
                dependencies={installedDependencies}
            />

            {selectedItem && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 50, backgroundColor: '#0f0f0f' }}>
                    <ModDetailsView
                        item={selectedItem}
                        onBack={() => setSelectedItem(null)}
                        onInstall={(item, version) => handleInstall(item, version)}
                        isInstalling={installingModId === selectedItem.id}
                        isInstalled={installedMods.has(selectedItem.id) || (selectedItem.original?.slug && installedSlugs.has(selectedItem.original.slug))}
                        hasUpdate={updatesAvailable.get(selectedItem.id) || false}
                        type={searchType}
                        gameVersion={filterVersion}
                        loader={filterLoader}
                    />
                </div>
            )}

            <DependencySelectModal
                isOpen={depSelectModal.isOpen}
                dependencies={depSelectModal.dependencies}
                onConfirm={handleDepSelectConfirm}
                onCancel={handleDepSelectCancel}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                danger={confirmModal.danger}
                onConfirm={confirmModal.onConfirm}
                onCancel={handleConfirmCancel}
            />
        </div>
    );
};

export default Mods;
