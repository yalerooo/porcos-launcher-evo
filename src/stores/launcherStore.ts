import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

export const useLauncherStore = create<LauncherState>()(
    persist(
        (set) => ({
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
            setInstances: (instances) => set({ instances }),
            addInstance: (instance) => set((state) => ({ 
                instances: [...state.instances, {
                    ...instance,
                    versions: instance.versions || [instance.version],
                    selectedVersion: instance.selectedVersion || instance.version
                }] 
            })),
            updateInstance: (id, updates) => set((state) => ({
                instances: state.instances.map(i => i.id === id ? { ...i, ...updates } : i),
                selectedInstance: state.selectedInstance?.id === id ? { ...state.selectedInstance, ...updates } : state.selectedInstance
            })),
            removeInstance: (id) => set((state) => ({ instances: state.instances.filter(i => i.id !== id) })),
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
