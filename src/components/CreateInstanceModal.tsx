import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Upload, Box, Type, Hash, Gamepad2, ChevronDown, Search } from 'lucide-react';
import { useLauncherStore, Instance } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import styles from './CreateInstanceModal.module.css';

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

const VERSION_ICONS = [
    "Acacia_Planks.png", "Bamboo_Planks_JE2_BE2.png", "Birch_Planks.png", "Black_Glazed_Terracotta_JE1_BE1.png",
    "Block_of_Amethyst_JE3_BE1.png", "Block_of_Coal_JE3_BE2.png", "Block_of_Diamond_JE5_BE3.png", "Block_of_Emerald_JE4_BE3.png",
    "Block_of_Gold_JE6_BE3.png", "Block_of_Iron_JE4_BE3.png", "Block_of_Lapis_Lazuli_JE3_BE3.png", "Block_of_Netherite_JE1_BE1.png",
    "Block_of_Quartz_JE4_BE4.png", "Block_of_Raw_Copper_JE2_BE2.png", "Block_of_Raw_Gold_JE3_BE2.png", "Block_of_Raw_Iron_JE3_BE2.png",
    "Block_of_Redstone_JE2_BE2.png", "Block_of_Resin_JE1_BE1.png", "Block_of_Stripped_Bamboo_JE3_BE2.png", "Blue_Glazed_Terracotta_JE1_BE1.png",
    "Bookshelf_JE4_BE2.png", "Brain_Coral_Block_JE2_BE1.png", "Bubble_Coral_Block_JE2_BE1.png", "Cake_JE4.png",
    "Cartography_Table_JE3_BE2.png", "Carved_Pumpkin_(S)_JE5.png", "Cauldron_JE7.png", "Cherry_Leaves_JE2.png",
    "Cherry_Planks_JE1_BE1.png", "Chest.gif", "Copper_Block_JE1_BE1.png", "Crafting_Table_JE4_BE3.png",
    "Crimson_Planks_JE1_BE1.png", "Cyan_Glazed_Terracotta_JE2_BE2.png", "Dark_Oak_Planks_JE3_BE2.png", "Dirt.png",
    "Dirt_Path_JE4_BE3.png", "Fire.gif", "Fire_Coral_Block_JE2_BE1.png", "Frosted_Ice_JE2_BE2.png",
    "Furnace_(S)_JE4.png", "Glass_JE4_BE2.webp", "Grass_Block_JE7_BE6.png", "Horn_Coral_Block_JE2_BE2.png",
    "Jack_o'Lantern_(S)_JE4.png", "Jungle_Planks_JE3_BE2.png", "Light_Blue_Glazed_Terracotta_JE1_BE1.png", "Lime_Glazed_Terracotta_JE1_BE1.png",
    "Mangrove_Planks_JE1_BE1.png", "Oak_Planks.png", "Orange_Glazed_Terracotta_JE2_BE2.png", "Pale_Oak_Planks_JE1_BE1.png",
    "Pink_Glazed_Terracotta_JE1_BE1.png", "Purple_Glazed_Terracotta_JE2.png", "Red_Glazed_Terracotta_JE1_BE1.png", "Spawner_with_fire.webp",
    "Spruce_Planks_JE4_BE2.png", "TNT_JE3_BE2.png", "Tube_Coral_Block_JE2_BE1.png", "Warped_Planks_JE1_BE1.png",
    "White_Glazed_Terracotta_JE2_BE2.png", "Yellow_Glazed_Terracotta_JE1_BE1.png"
];

interface CreateInstanceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({ isOpen, onClose }) => {
    const { 
        addInstance, 
        versions, 
        setVersions, 
        setSelectedInstance,
        updateInstance 
    } = useLauncherStore();

    const [newInstanceName, setNewInstanceName] = useState('');
    const [newInstanceVersion, setNewInstanceVersion] = useState('');
    const [selectedModLoader, setSelectedModLoader] = useState('Vanilla');
    const [modLoaderVersion, setModLoaderVersion] = useState('');
    const [availableModLoaderVersions, setAvailableModLoaderVersions] = useState<any[]>([]);
    const [isModLoaderDropdownOpen, setIsModLoaderDropdownOpen] = useState(false);
    const [isModLoaderVersionDropdownOpen, setIsModLoaderVersionDropdownOpen] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedPredefinedImage, setSelectedPredefinedImage] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isVersionDropdownOpen, setIsVersionDropdownOpen] = useState(false);
    const [versionSearch, setVersionSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Reset state when opening
            setNewInstanceName('');
            setSelectedImage(null);
            setPreviewImage(null);
            setSelectedPredefinedImage(null);
            setIsCreating(false);
            setSelectedModLoader('Vanilla');
            setModLoaderVersion('');
            setAvailableModLoaderVersions([]);
            setVersionSearch('');
            
            // Load versions if needed
            const loadVersions = async () => {
                if (versions.length === 0) {
                    try {
                        const { invoke } = await import("@tauri-apps/api/core");
                        const versionList = await invoke("get_available_versions");
                        setVersions(versionList as any[]);
                        if (versionList && (versionList as any[]).length > 0) {
                            setNewInstanceVersion((versionList as any[])[0].id);
                        }
                    } catch (error) {
                        console.error("Failed to load versions:", error);
                    }
                } else if (versions.length > 0) {
                    setNewInstanceVersion(versions[0].id);
                }
            };
            loadVersions();
        }
    }, [isOpen, versions, setVersions]);

    useEffect(() => {
        const fetchModLoaderVersions = async () => {
            if (selectedModLoader === 'Vanilla' || !newInstanceVersion) {
                setAvailableModLoaderVersions([]);
                setModLoaderVersion('');
                return;
            }

            try {
                const { invoke } = await import("@tauri-apps/api/core");
                let versions: any[] = [];
                
                switch (selectedModLoader) {
                    case 'Fabric':
                        versions = await invoke('get_fabric_versions', { minecraftVersion: newInstanceVersion });
                        break;
                    case 'Quilt':
                        versions = await invoke('get_quilt_versions', { minecraftVersion: newInstanceVersion });
                        break;
                    case 'NeoForge':
                        versions = await invoke('get_neoforge_versions', { minecraftVersion: newInstanceVersion });
                        break;
                    case 'Forge':
                        versions = await invoke('get_forge_versions', { minecraftVersion: newInstanceVersion });
                        break;
                }

                // Versions are already sorted newest first by backend
                // versions = versions.reverse();

                setAvailableModLoaderVersions(versions);
                if (versions.length > 0) {
                    // Default to the first stable version if possible, or just the first one
                    setModLoaderVersion(versions[0].version);
                } else {
                    setModLoaderVersion('');
                }
            } catch (error) {
                console.error(`Failed to fetch ${selectedModLoader} versions:`, error);
                setAvailableModLoaderVersions([]);
            }
        };

        fetchModLoaderVersions();
    }, [selectedModLoader, newInstanceVersion]);

    const handleSelectImage = async () => {
        try {
            const file = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'webp']
                }]
            });
            
            if (file) {
                setSelectedImage(file as string);
                setSelectedPredefinedImage(null);
                
                // Read file and create blob URL
                try {
                    const contents = await readFile(file as string);
                    const blob = new Blob([contents]);
                    const url = URL.createObjectURL(blob);
                    setPreviewImage(url);
                } catch (readErr) {
                    console.error("Failed to read image file:", readErr);
                }
            }
        } catch (err) {
            console.error("Failed to select image:", err);
        }
    };

    const handleSelectPredefined = (icon: string) => {
        setSelectedPredefinedImage(icon);
        setSelectedImage(null);
        setPreviewImage(`/assets/versions/${icon}`);
    };

    const handleCreateInstance = async () => {
        if (!newInstanceName || !newInstanceVersion || isCreating) return;
        if (selectedModLoader !== 'Vanilla' && !modLoaderVersion) return;
        
        setIsCreating(true);

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            
            // Determine image path for backend
            let imagePathForBackend = selectedImage;
            if (selectedPredefinedImage) {
                imagePathForBackend = null;
            }

            // Pass imagePath to backend
            const newInstance = await invoke("create_instance", {
                name: newInstanceName,
                version: newInstanceVersion,
                modLoader: selectedModLoader === 'Vanilla' ? null : selectedModLoader,
                modLoaderVersion: selectedModLoader === 'Vanilla' ? null : modLoaderVersion,
                imagePath: imagePathForBackend
            }) as Instance;

            // Capture uploaded image if any (handle both camelCase and snake_case)
            const uploadedImage = newInstance.backgroundImage || (newInstance as any).background_image;

            // Ensure modLoader fields are correctly set in the returned object if backend didn't return them as we expect
            // (Though backend should return them correctly now with the alias fix)
            if (selectedModLoader !== 'Vanilla') {
                newInstance.modLoader = selectedModLoader;
                newInstance.modLoaderVersion = modLoaderVersion;
                
                // Construct complex version string for robust selection
                const complexVersion = `${newInstanceVersion} (${selectedModLoader} ${modLoaderVersion})`;
                newInstance.versions = [complexVersion];
                newInstance.selectedVersion = complexVersion;
            } else {
                newInstance.versions = [newInstanceVersion];
                newInstance.selectedVersion = newInstanceVersion;
                newInstance.modLoader = undefined;
                newInstance.modLoaderVersion = undefined;
            }

            // Create instance_info.json for robustness
            try {
                const { invoke } = await import("@tauri-apps/api/core");
                const { join } = await import("@tauri-apps/api/path");
                const instancePath = await invoke("get_instance_path", { id: newInstance.id }) as string;
                const infoPath = await join(instancePath, 'instance_info.json');
                
                const info = {
                    name: newInstance.name,
                    minecraftVersion: newInstanceVersion,
                    modLoader: selectedModLoader === 'Vanilla' ? null : selectedModLoader,
                    modLoaderVersion: selectedModLoader === 'Vanilla' ? null : modLoaderVersion,
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

            // Always assign a random background
            const randomBg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
            newInstance.backgroundImage = randomBg;

            // Handle Icon
            if (uploadedImage) {
                // If backend returned a background_image (from upload), use it as icon
                newInstance.icon = uploadedImage;
            } else if (selectedPredefinedImage) {
                // Use the predefined image as icon
                newInstance.icon = `assets/versions/${selectedPredefinedImage}`;
            }

            // Persist updates
            await invoke("update_instance", {
                id: newInstance.id,
                backgroundImage: newInstance.backgroundImage,
                icon: newInstance.icon
            });

            // Update store
            updateInstance(newInstance.id, { 
                backgroundImage: newInstance.backgroundImage,
                icon: newInstance.icon
            });

            addInstance(newInstance);
            setSelectedInstance(newInstance);
            onClose();
        } catch (error) {
            console.error("Failed to create instance:", error);
        } finally {
            setIsCreating(false);
        }
    };

    const filteredVersions = versions.filter((v: any) => 
        v.id.toLowerCase().includes(versionSearch.toLowerCase())
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={styles.overlay}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                        className={styles.modal}
                    >
                        {/* Header */}
                        <div className={styles.header}>
                            <div>
                                <h3 className={styles.title}>Nueva Instancia</h3>
                                <p className={styles.subtitle}>Configura tu nueva aventura de Minecraft</p>
                            </div>
                            <button 
                                onClick={onClose}
                                className={styles.closeButton}
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className={styles.content}>
                            {/* Name Input */}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    <Type size={16} />
                                    Nombre de la Instancia
                                </label>
                                <div className={styles.inputWrapper}>
                                    <input
                                        type="text"
                                        value={newInstanceName}
                                        onChange={(e) => setNewInstanceName(e.target.value)}
                                        placeholder="Ej: Mi Mundo Survival 1.21"
                                        className={styles.input}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Version & Loader Grid */}
                            <div className={styles.grid}>
                                {/* Version Selector */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>
                                        <Hash size={16} />
                                        Versión de Minecraft
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <div 
                                            onClick={() => setIsVersionDropdownOpen(!isVersionDropdownOpen)}
                                            className={cn(
                                                styles.dropdownTrigger, 
                                                isVersionDropdownOpen ? styles.dropdownTriggerActive : ""
                                            )}
                                        >
                                            <span className="truncate font-medium">
                                                {newInstanceVersion || 'Seleccionar versión'}
                                            </span>
                                            <ChevronDown size={20} className={cn(styles.chevron, isVersionDropdownOpen ? styles.chevronRotated : "")} />
                                        </div>

                                        <AnimatePresence>
                                            {isVersionDropdownOpen && (
                                                <>
                                                    <div className={styles.backdrop} onClick={() => setIsVersionDropdownOpen(false)} />
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                                        className={styles.dropdownMenu}
                                                    >
                                                        <div className={styles.dropdownSearchHeader}>
                                                            <div className={styles.searchWrapper}>
                                                                <Search size={16} className={styles.searchIcon} />
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Buscar versión..." 
                                                                    className={styles.searchInput}
                                                                    value={versionSearch}
                                                                    onChange={(e) => setVersionSearch(e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className={styles.dropdownList}>
                                                            {filteredVersions.map((v: any) => (
                                                                <div
                                                                    key={v.id}
                                                                    onClick={() => {
                                                                        setNewInstanceVersion(v.id);
                                                                        setIsVersionDropdownOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        styles.dropdownItem,
                                                                        newInstanceVersion === v.id ? styles.dropdownItemActive : ""
                                                                    )}
                                                                >
                                                                    <span className="font-medium">{v.id}</span>
                                                                    {v.version_type && (
                                                                        <span className={cn(
                                                                            styles.versionTag,
                                                                            v.version_type === 'release' ? styles.versionTagRelease : styles.versionTagSnapshot
                                                                        )}>
                                                                            {v.version_type}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Mod Loader Selector */}
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>
                                        <Box size={16} />
                                        Mod Loader
                                    </label>
                                    <div className={styles.inputWrapper}>
                                        <div 
                                            onClick={() => setIsModLoaderDropdownOpen(!isModLoaderDropdownOpen)}
                                            className={cn(
                                                styles.dropdownTrigger, 
                                                isModLoaderDropdownOpen ? styles.dropdownTriggerActive : ""
                                            )}
                                        >
                                            <span className="truncate font-medium">{selectedModLoader}</span>
                                            <ChevronDown size={20} className={cn(styles.chevron, isModLoaderDropdownOpen ? styles.chevronRotated : "")} />
                                        </div>

                                        <AnimatePresence>
                                            {isModLoaderDropdownOpen && (
                                                <>
                                                    <div className={styles.backdrop} onClick={() => setIsModLoaderDropdownOpen(false)} />
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                                        className={styles.dropdownMenu}
                                                    >
                                                        <div className={styles.dropdownList}>
                                                            {['Vanilla', 'Forge', 'Fabric', 'Quilt', 'NeoForge'].map((loader) => (
                                                                <div
                                                                    key={loader}
                                                                    onClick={() => {
                                                                        setSelectedModLoader(loader);
                                                                        setIsModLoaderDropdownOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        styles.dropdownItem,
                                                                        selectedModLoader === loader ? styles.dropdownItemActive : ""
                                                                    )}
                                                                >
                                                                    <span className="font-medium">{loader}</span>
                                                                    {selectedModLoader === loader && <div className="w-1.5 h-1.5 rounded-full bg-[#ffbfba]" />}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>

                            {/* Loader Version (Conditional) */}
                            <AnimatePresence>
                                {selectedModLoader !== 'Vanilla' && (
                                    <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={styles.formGroup}
                                    >
                                        <label className={styles.label}>
                                            <Gamepad2 size={16} />
                                            Versión del Loader
                                        </label>
                                        <div className={styles.inputWrapper}>
                                            <div 
                                                onClick={() => setIsModLoaderVersionDropdownOpen(!isModLoaderVersionDropdownOpen)}
                                                className={cn(
                                                    styles.dropdownTrigger, 
                                                    isModLoaderVersionDropdownOpen ? styles.dropdownTriggerActive : ""
                                                )}
                                            >
                                                <span className="truncate font-medium">
                                                    {modLoaderVersion || 'Select Version'}
                                                </span>
                                                <ChevronDown size={20} className={cn(styles.chevron, isModLoaderVersionDropdownOpen ? styles.chevronRotated : "")} />
                                            </div>

                                            <AnimatePresence>
                                                {isModLoaderVersionDropdownOpen && (
                                                    <>
                                                        <div className={styles.backdrop} onClick={() => setIsModLoaderVersionDropdownOpen(false)} />
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                                            className={styles.dropdownMenu}
                                                        >
                                                            <div className={styles.dropdownList}>
                                                                {availableModLoaderVersions.map((v: any) => (
                                                                    <div
                                                                        key={v.version}
                                                                        onClick={() => {
                                                                            setModLoaderVersion(v.version);
                                                                            setIsModLoaderVersionDropdownOpen(false);
                                                                        }}
                                                                        className={cn(
                                                                            styles.dropdownItem,
                                                                            modLoaderVersion === v.version ? styles.dropdownItemActive : ""
                                                                        )}
                                                                    >
                                                                        <span className="font-medium">{v.version}</span>
                                                                        {v.stable && (
                                                                            <span className={styles.versionTagRelease}>
                                                                                Stable
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {availableModLoaderVersions.length === 0 && (
                                                                    <div className="px-4 py-8 text-center text-white/30 text-sm">
                                                                        No se encontraron versiones compatibles
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    </>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Icon Selection */}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    <Upload size={16} />
                                    Icono de la Instancia
                                </label>
                                <div className={styles.iconGrid}>
                                    {/* Upload Option */}
                                    <div 
                                        onClick={handleSelectImage}
                                        className={cn(
                                            styles.iconItem,
                                            styles.uploadItem,
                                            selectedImage ? styles.iconItemSelected : ""
                                        )}
                                        title="Subir imagen personalizada"
                                    >
                                        {selectedImage ? (
                                            <img src={previewImage!} className={styles.uploadImage} />
                                        ) : (
                                            <Upload className={styles.uploadIcon} />
                                        )}
                                    </div>

                                    {VERSION_ICONS.map(icon => (
                                        <div 
                                            key={icon} 
                                            onClick={() => handleSelectPredefined(icon)}
                                            className={cn(
                                                styles.iconItem,
                                                selectedPredefinedImage === icon ? styles.iconItemSelected : ""
                                            )}
                                        >
                                            <img src={`/assets/versions/${icon}`} className={styles.iconImage} loading="lazy" />
                                            {selectedPredefinedImage === icon && (
                                                <motion.div 
                                                    layoutId="icon-selected"
                                                    className="absolute inset-0 border-2 border-[#ffbfba] rounded-xl"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className={styles.footer}>
                                <button
                                    onClick={onClose}
                                    className={styles.cancelButton}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateInstance}
                                    disabled={!newInstanceName || !newInstanceVersion || isCreating}
                                    className={styles.createButton}
                                >
                                    {isCreating ? <Loader2 className={styles.loader} /> : "Crear Instancia"}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CreateInstanceModal;
