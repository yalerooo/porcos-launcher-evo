import React, { useState, useEffect } from 'react';
import { Search, Download, Loader2, Filter, Box, Package, ChevronDown, Plus, Gamepad2, Cpu, Check, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { useLauncherStore } from '@/stores/launcherStore';
import { cn } from '@/lib/utils';
import ModpackInstallModal from '@/components/ModpackInstallModal';
import ModInstallSuccessModal from '@/components/ModInstallSuccessModal';
import ModDetailsView from '@/components/ModDetailsView';

// Force refresh check
console.log("Mods Page Loaded - Timestamp:", Date.now());
import styles from './Mods.module.css';

type ModSource = 'modrinth' | 'curseforge' | 'porcos';
type SearchType = 'mods' | 'modpacks' | 'updates';

const CATEGORIES = [
    { id: "adventure", name: "Aventura", cfId: 406 },
    { id: "decoration", name: "Decoración", cfId: 420 },
    { id: "equipment", name: "Equipamiento", cfId: 434 },
    { id: "food", name: "Comida", cfId: 411 },
    { id: "game-mechanics", name: "Mecánicas de Juego", cfId: 416 },
    { id: "library", name: "Librería", cfId: 421 },
    { id: "magic", name: "Magia", cfId: 419 },
    { id: "management", name: "Gestión", cfId: 408 },
    { id: "minigame", name: "Minijuego", cfId: 430 },
    { id: "mobs", name: "Mobs", cfId: 414 },
    { id: "optimization", name: "Optimización", cfId: 427 },
    { id: "social", name: "Social", cfId: 428 },
    { id: "storage", name: "Almacenamiento", cfId: 423 },
    { id: "technology", name: "Tecnología", cfId: 412 },
    { id: "transportation", name: "Transporte", cfId: 415 },
    { id: "utility", name: "Utilidad", cfId: 426 },
    { id: "world-generation", name: "Generación de Mundo", cfId: 409 },
];

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
                // Custom file
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

interface InstalledMod {
    file: string;
    version?: string;
    source?: string;
}

const Mods: React.FC = () => {
    const { selectedInstance, instances } = useLauncherStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSource, setActiveSource] = useState<ModSource>('modrinth');
    const [searchType, setSearchType] = useState<SearchType>('mods');
    const [targetInstanceId, setTargetInstanceId] = useState<string>(selectedInstance?.id || instances[0]?.id || '');
    const [isLoading, setIsLoading] = useState(false);
    
    // Modpack Modal State
    const [selectedModpack, setSelectedModpack] = useState<any>(null);
    const [showModpackModal, setShowModpackModal] = useState(false);

    // Mod Success Modal State
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [installedModName, setInstalledModName] = useState('');

    // Mod Details Modal State
    const [selectedItem, setSelectedItem] = useState<any>(null);
    
    // Filters
    const [filterVersion, setFilterVersion] = useState<string>('');
    const [filterLoader, setFilterLoader] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [page, setPage] = useState(0);
    const [totalHits, setTotalHits] = useState(0);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [installedMods, setInstalledMods] = useState<Map<string, InstalledMod>>(new Map());
    const [installedSlugs, setInstalledSlugs] = useState<Map<string, InstalledMod>>(new Map());
    const [updatesAvailable, setUpdatesAvailable] = useState<Map<string, boolean>>(new Map());
    const [installingModId, setInstallingModId] = useState<string | null>(null);
    const [installedDependencies, setInstalledDependencies] = useState<string[]>([]);

    // Mock data
    const [items, setItems] = useState<any[]>([]);

    // Ensure we have a valid target instance
    useEffect(() => {
        if (!targetInstanceId && instances.length > 0) {
            setTargetInstanceId(instances[0].id);
        }
    }, [instances, targetInstanceId]);

    // Check for updates on visible items
    useEffect(() => {
        const checkUpdates = async () => {
            if (!filterVersion) return;

            const updates = new Map<string, boolean>();
            const promises = items.map(async (item) => {
                // Check if installed
                let installed = installedMods.get(item.id);
                if (!installed && item.original?.slug) {
                    installed = installedSlugs.get(item.original.slug);
                }

                if (installed) {
                    try {
                        if (item.source === 'modrinth') {
                            // Fetch compatible versions
                            const loaders = filterLoader ? `["${filterLoader.toLowerCase()}"]` : '[]';
                            const versions = `["${filterVersion}"]`;
                            const url = `https://api.modrinth.com/v2/project/${item.id}/version?loaders=${encodeURIComponent(loaders)}&game_versions=${encodeURIComponent(versions)}`;
                            
                            const responseText = await invoke('fetch_cors', { url }) as string;
                            const data = JSON.parse(responseText);
                            
                            if (data && data.length > 0) {
                                const latest = data[0];
                                // Check if filename matches (strongest check)
                                const latestFile = latest.files.find((f: any) => f.primary) || latest.files[0];
                                const isFileMatch = latest.files.some((f: any) => f.filename === installed.file);
                                const isVersionMatch = latest.version_number === installed.version;

                                // Only update if NEITHER file nor version matches
                                if (!isFileMatch && !isVersionMatch) {
                                    updates.set(item.id, true);
                                }
                            }
                        } else if (item.source === 'curseforge') {
                            // Check latestFiles from original item
                            const mod = item.original;
                            if (mod.latestFiles) {
                                const compatibleFile = mod.latestFiles.find((f: any) => {
                                    const hasVersion = f.gameVersions.includes(filterVersion);
                                    let hasLoader = true;
                                    if (filterLoader) {
                                        const loaderName = filterLoader.toLowerCase();
                                        hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === loaderName);
                                    }
                                    return hasVersion && hasLoader;
                                });

                                if (compatibleFile) {
                                    // Compare filename as we might not have version string in installedMod for CF sometimes
                                    // But installed.file should be accurate
                                    const isFileMatch = compatibleFile.fileName === installed.file;
                                    const isVersionMatch = installed.version && compatibleFile.displayName === installed.version;

                                    if (!isFileMatch && !isVersionMatch) {
                                        updates.set(item.id, true);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Failed to check update for", item.name, e);
                    }
                }
            });

            await Promise.all(promises);
            setUpdatesAvailable(updates);
        };

        if (items.length > 0) {
            checkUpdates();
        }
    }, [items, installedMods, installedSlugs, filterVersion, filterLoader]);

    // Load installed mods
    useEffect(() => {
        const loadInstalled = async () => {
            if (!targetInstanceId) return;
            const newInstalledMods = new Map<string, InstalledMod>();
            const newInstalledSlugs = new Map<string, InstalledMod>();

            try {
                const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
                
                // 1. Read mods.json
                const modsJsonPath = await join(instancePath, 'mods.json');
                const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
                if (exists) {
                    const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
                    const data = JSON.parse(content);
                    if (data.mods && Array.isArray(data.mods)) {
                        data.mods.forEach((m: any) => {
                            newInstalledMods.set(m.id, { file: m.file, version: m.version, source: m.source });
                        });
                    }
                }

                // 2. Scan mods folder
                const modsDir = await join(instancePath, 'mods');
                const modsDirExists = await invoke('file_exists', { path: modsDir }) as boolean;
                
                if (modsDirExists) {
                    const files = await invoke('list_files', { path: modsDir }) as any[];
                    const jarFiles = files.filter(f => f.name.endsWith('.jar'));
                    
                    // Process in parallel chunks
                    const chunkSize = 5;
                    for (let i = 0; i < jarFiles.length; i += chunkSize) {
                        const chunk = jarFiles.slice(i, i + chunkSize);
                        await Promise.all(chunk.map(async (file) => {
                            try {
                                const fullPath = await join(modsDir, file.name);
                                const metadata = await invoke('get_mod_metadata', { path: fullPath }) as any;
                                if (metadata.id) {
                                    const modInfo = { file: file.name, version: metadata.version };
                                    newInstalledSlugs.set(metadata.id, modInfo);
                                    // Also add as ID just in case slug == id (rare for CF, common for Modrinth internal)
                                    newInstalledMods.set(metadata.id, modInfo); 
                                }
                            } catch (e) {
                                // Ignore errors reading metadata
                            }
                        }));
                    }
                }

                setInstalledMods(newInstalledMods);
                setInstalledSlugs(newInstalledSlugs);

            } catch (e) {
                console.error("Failed to load installed mods", e);
            }
        };
        loadInstalled();
    }, [targetInstanceId]);

    const saveInstalledMod = async (modInfo: any) => {
        if (!targetInstanceId) return;
        try {
            const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
            const modsJsonPath = await join(instancePath, 'mods.json');
            
            let currentMods = [];
            const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
            if (exists) {
                const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
                const data = JSON.parse(content);
                if (data.mods && Array.isArray(data.mods)) {
                    currentMods = data.mods;
                }
            }

            // Check if already exists and update or add
            const existingIndex = currentMods.findIndex((m: any) => m.id === modInfo.id);
            if (existingIndex >= 0) {
                currentMods[existingIndex] = { ...currentMods[existingIndex], ...modInfo };
            } else {
                currentMods.push(modInfo);
            }

            await invoke('write_text_file', { 
                path: modsJsonPath, 
                content: JSON.stringify({ mods: currentMods }, null, 2) 
            });
            
            setInstalledMods(prev => new Map(prev).set(modInfo.id, { 
                file: modInfo.file, 
                version: modInfo.version, 
                source: modInfo.source 
            }));

            // Clear update flag
            setUpdatesAvailable(prev => {
                const newMap = new Map(prev);
                newMap.delete(modInfo.id);
                return newMap;
            });
        } catch (e) {
            console.error("Failed to save installed mod", e);
        }
    };

    // Reset page when filters change
    useEffect(() => {
        setPage(0);
    }, [searchQuery, activeSource, searchType, filterVersion, filterLoader, filterCategory]);

    // Auto-set filters when switching to Mods mode with an instance selected
    useEffect(() => {
        if (searchType === 'mods') {
            // Reset active source if it was Porcos
            if (activeSource === 'porcos') {
                setActiveSource('modrinth');
            }

            if (targetInstanceId) {
                const instance = instances.find(i => i.id === targetInstanceId);
                if (instance) {
                    // Set version filter
                    const version = instance.selectedVersion || instance.version;
                    if (version) setFilterVersion(version);

                    // Set loader filter
                    if (instance.modLoader) {
                        setFilterLoader(instance.modLoader.toLowerCase());
                    } else {
                        setFilterLoader(''); // Vanilla or unknown
                    }
                }
            }
        }
    }, [searchType, targetInstanceId, instances, activeSource]);

    // Fetch Data
    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    const searchModrinth = async (query: string, pageIndex: number) => {
        try {
            let facets = [];
            
            // Type Facet
            if (searchType === 'modpacks') {
                facets.push(["project_type:modpack"]);
            } else {
                facets.push(["project_type:mod"]);
            }

            // Version Facet
            if (filterVersion) {
                facets.push([`versions:${filterVersion}`]);
            }

            // Loader Facet
            if (filterLoader) {
                facets.push([`categories:${filterLoader}`]);
            }

            // Category Facet
            if (filterCategory) {
                facets.push([`categories:${filterCategory}`]);
            }

            const facetString = JSON.stringify(facets);
            const offset = pageIndex * 20;
                
            const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facetString)}&limit=20&offset=${offset}`;
            
            const responseText = await invoke('fetch_cors', { url }) as string;
            const data = JSON.parse(responseText);
            
            setTotalHits(data.total_hits);

            const formatted = data.hits.map((hit: any) => ({
                id: hit.project_id,
                name: hit.title,
                description: hit.description,
                downloads: formatNumber(hit.downloads),
                author: hit.author,
                icon: hit.icon_url,
                source: 'modrinth',
                original: hit
            }));
            
            setItems(formatted);
        } catch (error) {
            console.error("Failed to search Modrinth:", error);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    };

    const searchCurseForge = async (query: string, pageIndex: number) => {
        try {
            const classId = searchType === 'modpacks' ? 4471 : 6;
            const sortField = query ? 2 : 2; // 2 = Popularity
            const sortOrder = 'desc';
            const index = pageIndex * 20;
            
            let url = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(query)}&sortField=${sortField}&sortOrder=${sortOrder}&pageSize=20&index=${index}`;
            
            // Version Filter
            if (filterVersion) {
                url += `&gameVersion=${encodeURIComponent(filterVersion)}`;
            }

            // Loader Filter
            if (filterLoader) {
                let typeId = 0;
                switch (filterLoader.toLowerCase()) {
                    case 'forge': typeId = 1; break;
                    case 'fabric': typeId = 4; break;
                    case 'quilt': typeId = 5; break;
                    case 'neoforge': typeId = 6; break;
                }
                if (typeId > 0) {
                    url += `&modLoaderType=${typeId}`;
                }
            }

            // Category Filter
            if (filterCategory) {
                const category = CATEGORIES.find(c => c.id === filterCategory);
                if (category && category.cfId) {
                    url += `&categoryId=${category.cfId}`;
                }
            }

            const responseText = await invoke('fetch_cors', { 
                url,
                headers: {
                    'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC',
                    'Accept': 'application/json'
                }
            }) as string;

            const data = JSON.parse(responseText);
            
            setTotalHits(data.pagination.totalCount);

            const formatted = data.data.map((mod: any) => ({
                id: mod.id.toString(),
                name: mod.name,
                description: mod.summary,
                downloads: formatNumber(mod.downloadCount),
                author: mod.authors[0]?.name || 'Unknown',
                icon: mod.logo?.url || 'https://www.curseforge.com/images/logo-curseforge.png',
                source: 'curseforge',
                original: mod
            }));
            
            setItems(formatted);
        } catch (error) {
            console.error("Failed to search CurseForge:", error);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPorcosModpacks = async () => {
        try {
            const url = "https://raw.githubusercontent.com/yalerooo/myApis/refs/heads/main/porcosLauncher/modpacks.json";
            const responseText = await invoke('fetch_cors', { url }) as string;
            const data = JSON.parse(responseText);
            
            // Group by ID
            const grouped = new Map();
            if (data.modpacks && Array.isArray(data.modpacks)) {
                data.modpacks.forEach((mp: any) => {
                    if (!grouped.has(mp.id)) {
                        grouped.set(mp.id, {
                            id: mp.id,
                            name: mp.name,
                            description: mp.description,
                            author: "Porcos Team",
                            icon: mp.icon,
                            source: 'porcos',
                            versions: []
                        });
                    }
                    grouped.get(mp.id).versions.push(mp);
                });
            }

            const items = Array.from(grouped.values()).map((g: any) => ({
                ...g,
                downloads: "N/A",
                // Sort versions descending
                versions: g.versions.sort((a: any, b: any) => b.version.localeCompare(a.version, undefined, { numeric: true }))
            }));
            
            setItems(items);
        } catch (error) {
            console.error("Failed to fetch Porcos modpacks:", error);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    };

    const loadAllInstalledModsDetails = async () => {
        setIsLoading(true);
        setItems([]);
        
        try {
            const modrinthIds: string[] = [];
            const curseforgeIds: number[] = [];

            // Group IDs
            installedMods.forEach((mod, id) => {
                if (mod.source === 'modrinth') modrinthIds.push(id);
                else if (mod.source === 'curseforge') curseforgeIds.push(parseInt(id));
                // Fallback inference
                else if (/^\d+$/.test(id)) curseforgeIds.push(parseInt(id));
                else modrinthIds.push(id);
            });

            let allItems: any[] = [];

            // Fetch Modrinth
            if (modrinthIds.length > 0) {
                // Modrinth allows bulk fetch
                const url = `https://api.modrinth.com/v2/projects?ids=${JSON.stringify(modrinthIds)}`;
                const responseText = await invoke('fetch_cors', { url }) as string;
                const data = JSON.parse(responseText);
                const formatted = data.map((hit: any) => ({
                    id: hit.id,
                    name: hit.title,
                    description: hit.description,
                    downloads: formatNumber(hit.downloads),
                    author: "Unknown", 
                    icon: hit.icon_url,
                    source: 'modrinth',
                    original: hit
                }));
                allItems = [...allItems, ...formatted];
            }

            // Fetch CurseForge (Looping GETs as bulk POST might not be supported by fetch_cors wrapper)
            if (curseforgeIds.length > 0) {
                const cfPromises = curseforgeIds.map(async (id) => {
                     try {
                        const url = `https://api.curseforge.com/v1/mods/${id}`;
                        const res = await invoke('fetch_cors', { 
                            url,
                            headers: {
                                'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC',
                                'Accept': 'application/json'
                            }
                        }) as string;
                        const data = JSON.parse(res);
                        const mod = data.data;
                        return {
                            id: mod.id.toString(),
                            name: mod.name,
                            description: mod.summary,
                            downloads: formatNumber(mod.downloadCount),
                            author: mod.authors[0]?.name || 'Unknown',
                            icon: mod.logo?.url || 'https://www.curseforge.com/images/logo-curseforge.png',
                            source: 'curseforge',
                            original: mod
                        };
                     } catch (e) { return null; }
                });
                
                const cfResults = await Promise.all(cfPromises);
                allItems = [...allItems, ...cfResults.filter(r => r !== null)];
            }

            setItems(allItems);
        } catch (e) {
            console.error("Failed to load installed details", e);
            setItems([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setIsLoading(true);
        
        const timer = setTimeout(() => {
            if (searchType === 'updates') {
                loadAllInstalledModsDetails();
            } else if (activeSource === 'modrinth') {
                searchModrinth(searchQuery, page);
            } else if (activeSource === 'curseforge') {
                searchCurseForge(searchQuery, page);
            } else if (activeSource === 'porcos') {
                fetchPorcosModpacks();
            }
        }, 500); // Debounce

        return () => clearTimeout(timer);
    }, [searchQuery, activeSource, searchType, filterVersion, filterLoader, filterCategory, page, installedMods]);

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
    };

    const installModrinth = async (projectId: string, version: string, loader: string, instancePath: string, visited: Set<string> = new Set()): Promise<string[]> => {
        if (visited.has(projectId)) return [];
        visited.add(projectId);

        const url = `https://api.modrinth.com/v2/project/${projectId}/version`;
        const responseText = await invoke('fetch_cors', { url }) as string;
        const versions = JSON.parse(responseText);

        const compatibleVersion = versions.find((v: any) => {
            const matchesGameVersion = v.game_versions.includes(version);
            const matchesLoader = loader ? v.loaders.includes(loader.toLowerCase()) : true;
            return matchesGameVersion && matchesLoader;
        });

        if (!compatibleVersion) {
            console.warn(`No compatible version found for dependency ${projectId}`);
            return [];
        }

        let installedFiles: string[] = [];

        // Install dependencies first
        if (compatibleVersion.dependencies) {
            for (const dep of compatibleVersion.dependencies) {
                if (dep.dependency_type === "required" && dep.project_id) {
                    const deps = await installModrinth(dep.project_id, version, loader, instancePath, visited);
                    installedFiles = [...installedFiles, ...deps];
                }
            }
        }

        const file = compatibleVersion.files.find((f: any) => f.primary) || compatibleVersion.files[0];
        const filePath = await join(instancePath, 'mods', file.filename);
        
        await invoke('download_file', { url: file.url, path: filePath });
        
        await saveInstalledMod({
            id: projectId,
            source: 'modrinth',
            versionId: compatibleVersion.id,
            version: compatibleVersion.version_number,
            file: file.filename
        });

        installedFiles.push(file.filename);
        return installedFiles;
    };

    const installCurseForge = async (modId: string, version: string, loader: string, instancePath: string, visited: Set<string> = new Set()): Promise<string[]> => {
        if (visited.has(modId)) return [];
        visited.add(modId);

        const url = `https://api.curseforge.com/v1/mods/${modId}/files`;
        const responseText = await invoke('fetch_cors', { 
            url,
            headers: {
                'x-api-key': '$2a$10$/Dc9lilNTw0EvobjzoQLWu7zJpqX38hahG/jugi41F39z08R1rMZC',
                'Accept': 'application/json'
            }
        }) as string;
        const data = JSON.parse(responseText);
        
        const compatibleFile = data.data.find((f: any) => {
            const hasVersion = f.gameVersions.includes(version);
            let hasLoader = true;
            if (loader) {
                const loaderName = loader.toLowerCase();
                hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === loaderName);
            }
            return hasVersion && hasLoader;
        });

        if (!compatibleFile) {
            console.warn(`No compatible version found for dependency ${modId}`);
            return [];
        }

        let installedFiles: string[] = [];

        // Install dependencies
        if (compatibleFile.dependencies) {
            for (const dep of compatibleFile.dependencies) {
                if (dep.relationType === 3) { // RequiredDependency
                    const deps = await installCurseForge(dep.modId.toString(), version, loader, instancePath, visited);
                    installedFiles = [...installedFiles, ...deps];
                }
            }
        }

        const filePath = await join(instancePath, 'mods', compatibleFile.fileName);
        await invoke('download_file', { url: compatibleFile.downloadUrl, path: filePath });

        await saveInstalledMod({
            id: modId,
            source: 'curseforge',
            versionId: compatibleFile.id.toString(),
            version: compatibleFile.displayName,
            file: compatibleFile.fileName
        });

        installedFiles.push(compatibleFile.fileName);
        return installedFiles;
    };

    const handleInstall = async (item: any) => {
        if (searchType === 'modpacks') {
            setSelectedModpack(item);
            setShowModpackModal(true);
            return;
        }

        if (!targetInstanceId || installingModId) return;
        setInstallingModId(item.id);

        try {
            const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
            
            // Check if update (delete old)
            const installed = installedMods.get(item.id) || (item.original?.slug && installedSlugs.has(item.original.slug) ? installedSlugs.get(item.original.slug) : null);
            
            if (installed) {
                // Delete old file
                const oldFilePath = await join(instancePath, 'mods', installed.file);
                const exists = await invoke('file_exists', { path: oldFilePath }) as boolean;
                if (exists) {
                    await invoke('delete_file', { path: oldFilePath });
                }
            }

            let installedFiles: string[] = [];
            if (item.source === 'modrinth') {
                installedFiles = await installModrinth(item.id, filterVersion, filterLoader, instancePath);
            } else if (item.source === 'curseforge') {
                installedFiles = await installCurseForge(item.id, filterVersion, filterLoader, instancePath);
            }

            setInstalledModName(item.name);
            setInstalledDependencies(installedFiles.slice(1)); // Exclude main mod
            setShowSuccessModal(true);
            
        } catch (error) {
            console.error("Failed to install mod:", error);
            alert("Error al instalar el mod. Revisa la consola.");
        } finally {
            setInstallingModId(null);
        }
    };

    const handleUpdateAll = async () => {
        const updates = items.filter(item => updatesAvailable.get(item.id));
        if (updates.length === 0) return;

        for (const item of updates) {
            await handleInstall(item);
        }
    };

    const getTargetInstanceName = () => {
        return instances.find(i => i.id === targetInstanceId)?.name || "Seleccionar Instancia";
    };

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
                            Mods
                        </button>
                        <button
                            onClick={() => setSearchType('modpacks')}
                            className={cn(styles.switchButton, searchType === 'modpacks' && styles.switchButtonActive)}
                        >
                            <Box size={16} />
                            Modpacks
                        </button>
                        <button
                            onClick={() => setSearchType('updates')}
                            className={cn(styles.switchButton, searchType === 'updates' && styles.switchButtonActive)}
                        >
                            <RefreshCw size={16} />
                            Actualizaciones
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
                        <span className={styles.label}>Instalar en:</span>
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
                        
                        {/* Active Filters Badge */}
                        {(filterVersion || filterLoader) && (
                            <div className={styles.filterBadge}>
                                <Filter size={12} className="text-[#ffbfba]" />
                                <span className={styles.filterBadgeText}>
                                    Filtrado por: {filterVersion} {filterLoader && `(${filterLoader})`}
                                </span>
                            </div>
                        )}

                        {/* Update All Button */}
                        {searchType === 'updates' && items.filter(item => updatesAvailable.get(item.id)).length > 0 && (
                            <button 
                                onClick={handleUpdateAll}
                                className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors text-sm font-medium"
                            >
                                <RefreshCw size={14} />
                                Actualizar Todo ({items.filter(item => updatesAvailable.get(item.id)).length})
                            </button>
                        )}
                    </div>
                )}

                {/* Filters Row */}
                {searchType === 'modpacks' && (
                    <div className={styles.controlsRow}>
                        <div className={styles.filterInputContainer}>
                            <Gamepad2 size={16} className="text-[#a1a1aa]" />
                            <input 
                                type="text" 
                                placeholder="Versión (ej. 1.20.1)" 
                                value={filterVersion}
                                onChange={(e) => setFilterVersion(e.target.value)}
                                className={styles.filterInput}
                            />
                        </div>
                        <div className={styles.filterInputContainer}>
                            <Cpu size={16} className="text-[#a1a1aa]" />
                            <select 
                                value={filterLoader}
                                onChange={(e) => setFilterLoader(e.target.value)}
                                className={styles.filterSelect}
                            >
                                <option value="">Cualquiera</option>
                                <option value="forge">Forge</option>
                                <option value="fabric">Fabric</option>
                                <option value="quilt">Quilt</option>
                                <option value="neoforge">NeoForge</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                {searchType !== 'updates' && (
                    <div className={styles.searchSection}>
                        <form onSubmit={handleSearch}>
                            <div className={styles.searchContainer}>
                                <Search className={styles.searchIcon} size={20} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={`Buscar ${searchType} en ${activeSource === 'modrinth' ? 'Modrinth' : 'CurseForge'}...`}
                                    className={styles.searchInput}
                                />
                                <button type="submit" className={styles.searchButton}>
                                    Buscar
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* List & Pagination */}
                
                    <div className={styles.resultsList}>
                        {isLoading ? (
                            <div className={styles.loadingContainer}>
                                <Loader2 className={styles.loadingSpinner} size={40} />
                            </div>
                        ) : items.length > 0 ? (
                            <div className={styles.grid}>
                                {items
                                    .filter(item => searchType !== 'updates' || updatesAvailable.get(item.id))
                                    .map((item) => {
                                    const isInstalled = installedMods.has(item.id) || (item.original?.slug && installedSlugs.has(item.original.slug));
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

                                            {/* Action */}
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
                                                    isInstalled && hasUpdate && searchType === 'mods' && "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/30"
                                                )}
                                            >
                                                {installingModId === item.id ? (
                                                    <Loader2 className="animate-spin" size={18} />
                                                ) : searchType === 'modpacks' ? (
                                                    <>
                                                        <Plus size={18} />
                                                        Crear Instancia
                                                    </>
                                                ) : isInstalled ? (
                                                    hasUpdate ? (
                                                        <>
                                                            <Download size={18} />
                                                            Actualizar
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check size={18} />
                                                            Instalado
                                                        </>
                                                    )
                                                ) : (
                                                    <>
                                                        <Download size={18} />
                                                        Instalar
                                                    </>
                                                )}
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                {searchType === 'updates' ? (
                                    <>
                                        <Check size={48} className={styles.emptyIcon} />
                                        <p>¡Todo está actualizado!</p>
                                    </>
                                ) : (
                                    <>
                                        <Search size={48} className={styles.emptyIcon} />
                                        <p>Busca {searchType} para empezar</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pagination Bar - Always visible if items exist */}
                    {!isLoading && items.length > 0 && searchType !== 'updates' && (
                        <div className={styles.paginationBar}>
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className={styles.pageButton}
                            >
                                Anterior
                            </button>
                            <span className={styles.pageInfo}>
                                Página {page + 1} de {Math.ceil(totalHits / 20)}
                            </span>
                            <button
                                onClick={() => setPage(p => p + 1)}
                                disabled={(page + 1) * 20 >= totalHits}
                                className={styles.pageButton}
                            >
                                Siguiente
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
                        onInstall={(item) => handleInstall(item)}
                        isInstalling={installingModId === selectedItem.id}
                        isInstalled={installedMods.has(selectedItem.id) || (selectedItem.original?.slug && installedSlugs.has(selectedItem.original.slug))}
                        hasUpdate={updatesAvailable.get(selectedItem.id) || false}
                        type={searchType}
                    />
                </div>
            )}
        </div>
    );
};

export default Mods;
