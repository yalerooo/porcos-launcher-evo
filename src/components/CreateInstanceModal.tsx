import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Upload, Box } from 'lucide-react';
import { useLauncherStore, Instance } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
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

                // Reverse to show newest first
                versions = versions.reverse();

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
                setPreviewImage(convertFileSrc(file as string));
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

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-12"
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-[#1a1a1a] w-full max-w-md rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl"
                    >
                        <div className={cn(styles.modalHeader, "border-b border-white/10 flex items-center justify-between bg-[#1a1a1a]")}>
                            <h3 className="text-xl font-bold text-white">Nueva Instancia</h3>
                            <button 
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className={cn(styles.modalContent, "space-y-8")}>
                            <div>
                                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Nombre</label>
                                <input
                                    type="text"
                                    value={newInstanceName}
                                    onChange={(e) => setNewInstanceName(e.target.value)}
                                    placeholder="Mi Mundo Survival"
                                    className={cn("w-full bg-[#27272a] border border-transparent focus:border-[#ffbfba] rounded-lg h-14 text-white outline-none transition-all", styles.formInput)}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Versión</label>
                                <div className="relative">
                                    <div 
                                        onClick={() => setIsVersionDropdownOpen(!isVersionDropdownOpen)}
                                        className={cn(
                                            "w-full bg-[#27272a] border border-transparent rounded-lg h-14 text-white flex items-center cursor-pointer transition-all hover:bg-[#3f3f46]", 
                                            isVersionDropdownOpen ? "border-[#ffbfba] rounded-b-none" : "",
                                            styles.formInput
                                        )}
                                    >
                                        <span className="truncate">
                                            {newInstanceVersion 
                                                ? `${newInstanceVersion} ${versions.find((v: any) => v.id === newInstanceVersion)?.version_type ? `(${versions.find((v: any) => v.id === newInstanceVersion)?.version_type})` : ''}`
                                                : 'Seleccionar versión'}
                                        </span>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#a1a1aa]">
                                            <Box size={16} />
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isVersionDropdownOpen && (
                                            <>
                                                <div 
                                                    className="fixed inset-0 z-40" 
                                                    onClick={() => setIsVersionDropdownOpen(false)} 
                                                />
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -10 }}
                                                    className={cn(
                                                        "absolute top-full left-0 right-0 bg-[#27272a] rounded-b-lg border-x border-b border-white/10 shadow-xl max-h-60 overflow-y-auto z-50 -mt-[1px]",
                                                        styles.dropdownScrollbar
                                                    )}
                                                >
                                                    {versions.map((v: any) => (
                                                        <div
                                                            key={v.id}
                                                            onClick={() => {
                                                                setNewInstanceVersion(v.id);
                                                                setIsVersionDropdownOpen(false);
                                                            }}
                                                            className={cn(
                                                                "px-4 py-3 hover:bg-white/5 cursor-pointer text-white transition-colors flex items-center justify-between",
                                                                newInstanceVersion === v.id ? "bg-white/10 text-[#ffbfba]" : ""
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Mod Loader</label>
                                    <div className="relative">
                                        <div 
                                            onClick={() => setIsModLoaderDropdownOpen(!isModLoaderDropdownOpen)}
                                            className={cn(
                                                "w-full bg-[#27272a] border border-transparent rounded-lg h-14 text-white flex items-center cursor-pointer transition-all hover:bg-[#3f3f46]", 
                                                isModLoaderDropdownOpen ? "border-[#ffbfba] rounded-b-none" : "",
                                                styles.formInput
                                            )}
                                        >
                                            <span className="truncate px-4">{selectedModLoader}</span>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#a1a1aa]">
                                                <Box size={16} />
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {isModLoaderDropdownOpen && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-40" 
                                                        onClick={() => setIsModLoaderDropdownOpen(false)} 
                                                    />
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className={cn(
                                                            "absolute top-full left-0 right-0 bg-[#27272a] rounded-b-lg border-x border-b border-white/10 shadow-xl z-50 -mt-[1px]",
                                                            styles.dropdownScrollbar
                                                        )}
                                                    >
                                                        {['Vanilla', 'Forge', 'Fabric', 'Quilt', 'NeoForge'].map((loader) => (
                                                            <div
                                                                key={loader}
                                                                onClick={() => {
                                                                    setSelectedModLoader(loader);
                                                                    setIsModLoaderDropdownOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "px-4 py-3 hover:bg-white/5 cursor-pointer text-white transition-colors flex items-center justify-between",
                                                                    selectedModLoader === loader ? "bg-white/10 text-[#ffbfba]" : ""
                                                                )}
                                                            >
                                                                <span>{loader}</span>
                                                            </div>
                                                        ))}
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {selectedModLoader !== 'Vanilla' && (
                                    <div>
                                        <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Loader Version</label>
                                        <div className="relative">
                                            <div 
                                                onClick={() => setIsModLoaderVersionDropdownOpen(!isModLoaderVersionDropdownOpen)}
                                                className={cn(
                                                    "w-full bg-[#27272a] border border-transparent rounded-lg h-14 text-white flex items-center cursor-pointer transition-all hover:bg-[#3f3f46]", 
                                                    isModLoaderVersionDropdownOpen ? "border-[#ffbfba] rounded-b-none" : "",
                                                    styles.formInput
                                                )}
                                            >
                                                <span className="truncate px-4">
                                                    {modLoaderVersion || 'Select Version'}
                                                </span>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#a1a1aa]">
                                                    <Box size={16} />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {isModLoaderVersionDropdownOpen && (
                                                    <>
                                                        <div 
                                                            className="fixed inset-0 z-40" 
                                                            onClick={() => setIsModLoaderVersionDropdownOpen(false)} 
                                                        />
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            className={cn(
                                                                "absolute top-full left-0 right-0 bg-[#27272a] rounded-b-lg border-x border-b border-white/10 shadow-xl max-h-60 overflow-y-auto z-50 -mt-[1px]",
                                                                styles.dropdownScrollbar
                                                            )}
                                                        >
                                                            {availableModLoaderVersions.map((v: any) => (
                                                                <div
                                                                    key={v.version}
                                                                    onClick={() => {
                                                                        setModLoaderVersion(v.version);
                                                                        setIsModLoaderVersionDropdownOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        "px-4 py-3 hover:bg-white/5 cursor-pointer text-white transition-colors flex items-center justify-between",
                                                                        modLoaderVersion === v.version ? "bg-white/10 text-[#ffbfba]" : ""
                                                                    )}
                                                                >
                                                                    <span>{v.version}</span>
                                                                    {v.stable && (
                                                                        <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 rounded">
                                                                            Stable
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {availableModLoaderVersions.length === 0 && (
                                                                <div className="px-4 py-3 text-white/50 text-sm">
                                                                    No versions found
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    </>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-[#a1a1aa] mb-2">Icono de la Instancia</label>
                                <div className="grid grid-cols-5 gap-4 max-h-64 overflow-y-auto p-6 bg-[#121212] rounded-xl border border-white/5 scrollbar-thin scrollbar-thumb-white/10">
                                    {/* Upload Option */}
                                    <div 
                                        onClick={handleSelectImage}
                                        className={cn(
                                            "aspect-square rounded-lg cursor-pointer border-2 border-dashed border-white/10 transition-all p-1 flex items-center justify-center hover:bg-white/5 hover:border-[#ffbfba] group",
                                            selectedImage ? "border-[#ffbfba] bg-[#ffbfba]/20" : ""
                                        )}
                                        title="Subir imagen personalizada"
                                    >
                                        {selectedImage ? (
                                            <img src={previewImage!} className="w-full h-full object-cover rounded-md" />
                                        ) : (
                                            <Upload className="text-white/20 group-hover:text-[#ffbfba] transition-colors w-6 h-6" />
                                        )}
                                    </div>

                                    {VERSION_ICONS.map(icon => (
                                        <div 
                                            key={icon} 
                                            onClick={() => handleSelectPredefined(icon)}
                                            className={cn(
                                                "aspect-square rounded-lg cursor-pointer border-2 transition-all p-1 flex items-center justify-center hover:bg-white/5",
                                                selectedPredefinedImage === icon ? "border-[#ffbfba] bg-[#ffbfba]/20" : "border-transparent"
                                            )}
                                        >
                                            <img src={`/assets/versions/${icon}`} className="w-full h-full object-contain" loading="lazy" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={cn("flex gap-4", styles.modalFooter)}>
                                <button
                                    onClick={onClose}
                                    className="flex-1 h-14 rounded-lg bg-[#27272a] text-white hover:bg-[#3f3f46] transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateInstance}
                                    disabled={!newInstanceName || !newInstanceVersion || isCreating}
                                    className="flex-1 h-14 bg-[#ffbfba] text-[#1a1a1a] rounded-lg font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Crear"}
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
