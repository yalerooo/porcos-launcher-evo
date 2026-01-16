import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

// List of predefined backgrounds
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

// Global image cache (module level, persists across renders)
const imageCache = {
    icons: new Map<string, string>(),
    thumbnails: new Map<string, string>(),
    backgrounds: new Map<string, string>(),
};

// Helper to resolve image source
async function resolveImageSource(
    instance: Instance, 
    type: 'icon' | 'thumbnail' | 'background'
): Promise<string> {
    const source = type === 'icon' 
        ? (instance.icon || instance.backgroundImage)
        : instance.backgroundImage;
    
    const isBackground = type === 'background';
    const folder = isBackground ? 'backgrounds' : 'thumbnails';
    const defaultImg = `/assets/${folder}/${BACKGROUNDS[0]}`;
    
    if (!source) return defaultImg;
    
    if (source.startsWith('http')) {
        return source;
    } else if (source.startsWith('assets/') || source.startsWith('/assets/')) {
        const filename = source.split('/').pop() || '';
        return BACKGROUNDS.includes(filename) 
            ? `/assets/${folder}/${filename}` 
            : (source.startsWith('/') ? source : `/${source}`);
    } else if (BACKGROUNDS.includes(source)) {
        return `/assets/${folder}/${source}`;
    } else {
        // Custom file - need to read from disk
        try {
            const { join, isAbsolute } = await import("@tauri-apps/api/path");
            let fullPath = source;
            const isAbs = await isAbsolute(source) || source.includes(':\\') || source.startsWith('/');
            if (!isAbs) {
                const instancePath = await invoke("get_instance_path", { id: instance.id }) as string;
                fullPath = await join(instancePath, source);
            }
            const data = await invoke("read_binary_file", { path: fullPath }) as number[];
            const blob = new Blob([new Uint8Array(data)], { type: 'image/png' });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error(`Failed to load ${type}:`, e);
            return defaultImg;
        }
    }
}

// Preload all images for a single instance
async function preloadInstanceImages(instance: Instance): Promise<void> {
    const iconKey = `${instance.id}-icon`;
    const thumbKey = `${instance.id}-thumb`;
    const bgKey = `${instance.id}-bg`;
    
    // Only load if not already cached
    const promises: Promise<void>[] = [];
    
    if (!imageCache.icons.has(iconKey)) {
        promises.push(
            resolveImageSource(instance, 'icon').then(src => {
                imageCache.icons.set(iconKey, src);
            })
        );
    }
    
    if (!imageCache.thumbnails.has(thumbKey)) {
        promises.push(
            resolveImageSource(instance, 'thumbnail').then(src => {
                imageCache.thumbnails.set(thumbKey, src);
            })
        );
    }
    
    if (!imageCache.backgrounds.has(bgKey)) {
        promises.push(
            resolveImageSource(instance, 'background').then(src => {
                imageCache.backgrounds.set(bgKey, src);
            })
        );
    }
    
    await Promise.all(promises);
}

// Public function to get cached images
export function getCachedImages(instanceId: string) {
    return {
        icon: imageCache.icons.get(`${instanceId}-icon`),
        thumbnail: imageCache.thumbnails.get(`${instanceId}-thumb`),
        background: imageCache.backgrounds.get(`${instanceId}-bg`),
    };
}

// Public function to invalidate cache for an instance (when image changes)
export function invalidateInstanceImageCache(instanceId: string) {
    imageCache.icons.delete(`${instanceId}-icon`);
    imageCache.thumbnails.delete(`${instanceId}-thumb`);
    imageCache.backgrounds.delete(`${instanceId}-bg`);
}

export interface Instance {
    id: string;
    name: string;
    version: string; // Primary/Created version
    versions?: string[]; // List of available versions
    selectedVersion?: string; // Currently selected version
    modLoader?: string;
    modLoaderVersion?: string;
    icon?: string;
    backgroundImage?: string;
    created: number;
}

interface LauncherState {
    versions: any[];
    instances: Instance[];
    selectedInstance: Instance | null;
    selectedVersion: string; // Fallback for quick play
    memoryMin: string;
    memoryMax: string;
    isLaunching: boolean;
    launchStage: string;
    launchProgress: number;
    launchStartTime: number | null;
    consoleOutput: string[];
    crashReport: { path: string, content: string } | null;
    
    setVersions: (versions: any[]) => void;
    setInstances: (instances: Instance[]) => void;
    addInstance: (instance: Instance) => void;
    updateInstance: (id: string, updates: Partial<Instance>) => void;
    removeInstance: (id: string) => void;
    setSelectedInstance: (instance: Instance | null) => void;
    setSelectedVersion: (version: string) => void;
    setMemoryMin: (val: string) => void;
    setMemoryMax: (val: string) => void;
    setIsLaunching: (isLaunching: boolean) => void;
    setLaunchStage: (stage: string) => void;
    setLaunchProgress: (progress: number) => void;
    setLaunchStartTime: (time: number | null) => void;
    addLog: (message: string) => void;
    clearLogs: () => void;
    setCrashReport: (report: { path: string, content: string } | null) => void;
    preloadAllImages: () => Promise<void>;
}

export const useLauncherStore = create<LauncherState>()(
    persist(
        (set, get) => ({
            versions: [],
            instances: [],
            selectedInstance: null,
            selectedVersion: '',
            memoryMin: '2',
            memoryMax: '4',
            isLaunching: false,
            launchStage: '',
            launchProgress: 0,
            launchStartTime: null,
            consoleOutput: [],
            crashReport: null,

            setVersions: (versions) => set({ versions }),
            setInstances: (instances) => {
                set({ instances });
                // Preload images for all instances in background
                Promise.all(instances.map(inst => preloadInstanceImages(inst))).catch(console.error);
            },
            addInstance: (instance) => {
                const newInstance = {
                    ...instance,
                    versions: instance.versions || [instance.version],
                    selectedVersion: instance.selectedVersion || instance.version
                };
                set((state) => ({ instances: [...state.instances, newInstance] }));
                // Preload images for new instance
                preloadInstanceImages(newInstance).catch(console.error);
            },
            updateInstance: (id, updates) => {
                set((state) => ({
                    instances: state.instances.map(i => i.id === id ? { ...i, ...updates } : i),
                    selectedInstance: state.selectedInstance?.id === id ? { ...state.selectedInstance, ...updates } : state.selectedInstance
                }));
                // If icon or background changed, invalidate and reload cache
                if (updates.icon !== undefined || updates.backgroundImage !== undefined) {
                    invalidateInstanceImageCache(id);
                    const instance = get().instances.find(i => i.id === id);
                    if (instance) {
                        preloadInstanceImages(instance).catch(console.error);
                    }
                }
            },
            removeInstance: (id) => {
                invalidateInstanceImageCache(id);
                set((state) => ({ instances: state.instances.filter(i => i.id !== id) }));
            },
            setSelectedInstance: (selectedInstance) => set({ selectedInstance }),
            setSelectedVersion: (selectedVersion) => set({ selectedVersion }),
            setMemoryMin: (memoryMin) => set({ memoryMin }),
            setMemoryMax: (memoryMax) => set({ memoryMax }),
            setIsLaunching: (isLaunching) => set({ isLaunching }),
            setLaunchStage: (launchStage) => set({ launchStage }),
            setLaunchProgress: (launchProgress) => set({ launchProgress }),
            setLaunchStartTime: (launchStartTime) => set({ launchStartTime }),
            addLog: (message) => set((state) => ({ 
                consoleOutput: [...state.consoleOutput, `[${new Date().toLocaleTimeString()}] ${message}`] 
            })),
            clearLogs: () => set({ consoleOutput: [] }),
            setCrashReport: (crashReport) => set({ crashReport }),
            preloadAllImages: async () => {
                const instances = get().instances;
                await Promise.all(instances.map(inst => preloadInstanceImages(inst)));
            },
        }),
        {
            name: 'launcher-storage',
            partialize: (state) => ({ 
                instances: state.instances,
                selectedInstance: state.selectedInstance,
                selectedVersion: state.selectedVersion,
                memoryMin: state.memoryMin,
                memoryMax: state.memoryMax,
                crashReport: state.crashReport,
                launchStartTime: state.launchStartTime
            }),
        }
    )
);
