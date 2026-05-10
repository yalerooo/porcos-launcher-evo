import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import {
  searchModrinth as apiSearchModrinth,
  searchCurseForge as apiSearchCurseForge,
  fetchPorcosModpacks as apiFetchPorcos,
  getModrinthFilteredVersions,
  getModrinthVersionsByIds,
  getCurseForgeModFiles,
  getCurseForgeFile,
  resolveModrinthHashes,
  resolveCurseForgeFingerprints,
  getExpandedLoaders,
  getLoaderTypeId,
} from '@/lib/modApiService';
import type { ModSource, SearchType } from '@/hooks/useModSearch';

export interface InstalledMod {
  file: string;
  version?: string;
  source?: ModSource;
  versionId?: string;
  icon?: string;
  name?: string;
}

export interface ModInfo {
  id: string;
  name: string;
  description: string;
  downloads: string;
  author: string;
  icon?: string;
  source: ModSource;
  version?: string;
  versionId?: string;
  original?: any;
  hasUpdate?: boolean;
  isEnabled?: boolean;
}

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  changelog?: string;
}

export interface DependencyItem {
  id: string;
  source: ModSource;
  name: string;
  icon?: string;
  type: 'required' | 'optional';
}

interface ModsState {
  // Instance
  targetInstanceId: string | null;
  instancePath: string | null;

  // Installed mods tracking
  installedMods: Map<string, InstalledMod>;
  installedSlugs: Map<string, InstalledMod>;

  // Updates
  updatesAvailable: Map<string, UpdateInfo>;

  // Search results
  searchResults: ModInfo[];
  searchQuery: string;
  activeSource: ModSource;
  searchType: SearchType;
  totalHits: number;
  currentPage: number;

  // Filters
  filterVersion: string;
  filterLoader: string;
  filterCategory: string;

  // Loading states
  isLoadingInstalled: boolean;
  isLoadingSearch: boolean;
  isLoadingUpdates: boolean;
  isVerifyingDeps: boolean;
  verificationStatus: string;

  // Installation
  installingModId: string | null;

  // Actions
  setTargetInstance: (id: string) => void;
  loadInstalledMods: () => Promise<void>;
  saveInstalledMod: (modInfo: any) => Promise<void>;
  searchMods: (query: string, page: number) => Promise<void>;
  loadUpdates: () => Promise<void>;
  checkModUpdate: (mod: ModInfo) => Promise<UpdateInfo | null>;
  installMod: (item: ModInfo, version?: any) => Promise<void>;
  uninstallMod: (mod: ModInfo) => Promise<void>;
  toggleMod: (mod: ModInfo) => Promise<void>;
  verifyDependencies: () => Promise<void>;
  clearSearchResults: () => void;
  setFilters: (filters: { version?: string; loader?: string; category?: string }) => void;
  setSearchType: (type: SearchType) => void;
  setActiveSource: (source: ModSource) => void;
  setSearchQuery: (query: string) => void;
}

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

async function processInChunks<T, R>(
  items: T[], chunkSize: number, iterator: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(iterator));
    results.push(...chunkResults);
  }
  return results;
}

export const useModsStore = create<ModsState>((set, get) => ({
  // Initial state
  targetInstanceId: null,
  instancePath: null,

  installedMods: new Map(),
  installedSlugs: new Map(),

  updatesAvailable: new Map(),

  searchResults: [],
  searchQuery: '',
  activeSource: 'modrinth',
  searchType: 'mods',
  totalHits: 0,
  currentPage: 0,

  filterVersion: '',
  filterLoader: '',
  filterCategory: '',

  isLoadingInstalled: false,
  isLoadingSearch: false,
  isLoadingUpdates: false,
  isVerifyingDeps: false,
  verificationStatus: '',

  installingModId: null,

  // Actions
  setTargetInstance: async (id: string) => {
    let instancePath = null;
    if (id) {
      try {
        instancePath = await invoke('get_instance_path', { id }) as string;
      } catch (e) {
        console.error('Failed to get instance path:', e);
      }
    }
    set({ targetInstanceId: id, instancePath });
    if (id) {
      await get().loadInstalledMods();
    }
  },

  loadInstalledMods: async () => {
    const { targetInstanceId } = get();
    if (!targetInstanceId) {
      set({ installedMods: new Map(), installedSlugs: new Map() });
      return;
    }

    set({ isLoadingInstalled: true });

    const newInstalledMods = new Map<string, InstalledMod>();

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      set({ instancePath });

      // Phase 1: Read mods.json
      const modsJsonPath = await join(instancePath, 'mods.json');
      const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
      if (exists) {
        const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
        const data = JSON.parse(content);
        if (data.mods && Array.isArray(data.mods)) {
          data.mods.forEach((m: any) => {
            newInstalledMods.set(m.id, {
              file: m.file,
              version: m.version,
              source: m.source,
              versionId: m.versionId,
              icon: m.icon,
              name: m.name,
            });
          });
        }
      }

      set({
        installedMods: new Map(newInstalledMods),
        installedSlugs: new Map(),
      });

      // Phase 2: Scan mods folder for slug mapping + untracked mods
      const modsDir = await join(instancePath, 'mods');
      const modsDirExists = await invoke('file_exists', { path: modsDir }) as boolean;

      if (modsDirExists) {
        const files = await invoke('list_files', { path: modsDir }) as any[];
        const jarFiles = files.filter(f => f.name.endsWith('.jar') || f.name.endsWith('.jar.disabled'));

        const trackedFiles = new Set<string>();
        newInstalledMods.forEach(mod => trackedFiles.add(mod.file));

        const untrackedJars = jarFiles.filter(f => !trackedFiles.has(f.name));

        if (untrackedJars.length > 0) {
          const chunkSize = 10;
          for (let i = 0; i < untrackedJars.length; i += chunkSize) {
            const chunk = untrackedJars.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (file) => {
              try {
                const fullPath = await join(modsDir, file.name);
                const metadata = await invoke('get_mod_metadata', { path: fullPath }) as any;
                let modId = metadata.id;

                if (!modId) {
                  const match = file.name.match(/^([a-zA-Z0-9_-]+?)[-_.](?=\d)/);
                  modId = match ? match[1] : file.name.replace(/\.jar(\.disabled)?$/, '');
                }

                if (modId) {
                  const normalizedId = modId.toLowerCase();
                  const modInfo = {
                    file: file.name,
                    version: metadata.version || 'unknown',
                    source: 'local' as ModSource,
                  };
                  const newInstalledSlugs = new Map(get().installedSlugs);
                  newInstalledSlugs.set(normalizedId, modInfo);
                  if (!newInstalledMods.has(normalizedId)) {
                    newInstalledMods.set(normalizedId, modInfo);
                  }
                  set({ installedSlugs: newInstalledSlugs, installedMods: new Map(newInstalledMods) });
                }
              } catch (e) {}
            }));
          }
        }
      }
    } catch (e) {
      console.error('Failed to load installed mods:', e);
    } finally {
      set({ isLoadingInstalled: false });
    }
  },

  saveInstalledMod: async (modInfo: any) => {
    const { targetInstanceId } = get();
    if (!targetInstanceId) return;

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      const modsJsonPath = await join(instancePath, 'mods.json');

      let currentMods: any[] = [];
      const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
      if (exists) {
        const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
        const data = JSON.parse(content);
        if (data.mods && Array.isArray(data.mods)) currentMods = data.mods;
      }

      const existingIndex = currentMods.findIndex((m: any) => m.id === modInfo.id);
      if (existingIndex >= 0) {
        currentMods[existingIndex] = { ...currentMods[existingIndex], ...modInfo };
      } else {
        currentMods.push(modInfo);
      }

      await invoke('write_text_file', {
        path: modsJsonPath,
        content: JSON.stringify({ mods: currentMods }, null, 2),
      });

      const newInstalledMods = new Map(get().installedMods);
      newInstalledMods.set(modInfo.id, {
        file: modInfo.file,
        version: modInfo.version,
        source: modInfo.source,
        versionId: modInfo.versionId,
        icon: modInfo.icon,
        name: modInfo.name,
      });
      set({ installedMods: newInstalledMods });
    } catch (e) {
      console.error('Failed to save installed mod:', e);
    }
  },

  searchMods: async (query: string, page: number) => {
    const { activeSource, searchType, filterVersion, filterLoader, filterCategory } = get();
    set({ isLoadingSearch: true, searchQuery: query, currentPage: page });

    try {
      let results: ModInfo[] = [];
      let totalHits = 0;

      if (activeSource === 'modrinth') {
        const facets: string[][] = [];
        facets.push(searchType === 'modpacks' ? ['project_type:modpack'] : ['project_type:mod']);
        if (filterVersion) facets.push([`versions:${filterVersion}`]);
        if (filterLoader) facets.push([`categories:${filterLoader}`]);
        if (filterCategory) facets.push([`categories:${filterCategory}`]);

        const data = await apiSearchModrinth(query, facets, page * 20);
        totalHits = data.total_hits;
        results = data.hits.map((hit: any) => ({
          id: hit.project_id,
          name: hit.title,
          description: hit.description,
          downloads: formatNumber(hit.downloads),
          author: hit.author,
          icon: hit.icon_url,
          source: 'modrinth' as ModSource,
          original: hit,
        }));
      } else if (activeSource === 'curseforge') {
        const CATEGORIES = [
          { id: 'adventure', cfId: 406 }, { id: 'decoration', cfId: 420 }, { id: 'equipment', cfId: 434 },
          { id: 'food', cfId: 411 }, { id: 'game-mechanics', cfId: 416 }, { id: 'library', cfId: 421 },
          { id: 'magic', cfId: 419 }, { id: 'management', cfId: 408 }, { id: 'minigame', cfId: 430 },
          { id: 'mobs', cfId: 414 }, { id: 'optimization', cfId: 427 }, { id: 'social', cfId: 428 },
          { id: 'storage', cfId: 423 }, { id: 'technology', cfId: 412 }, { id: 'transportation', cfId: 415 },
          { id: 'utility', cfId: 426 }, { id: 'world-generation', cfId: 409 },
        ];
        const classId = searchType === 'modpacks' ? 4471 : 6;
        const cat = filterCategory ? CATEGORIES.find(c => c.id === filterCategory) : null;

        const data = await apiSearchCurseForge(query, classId, {
          gameVersion: filterVersion || undefined,
          modLoaderType: filterLoader ? getLoaderTypeId(filterLoader) : undefined,
          categoryId: cat?.cfId,
          index: page * 20,
        });

        totalHits = data.pagination.totalCount;
        results = data.data.map((mod: any) => ({
          id: mod.id.toString(),
          name: mod.name,
          description: mod.summary,
          downloads: formatNumber(mod.downloadCount),
          author: mod.authors?.[0]?.name || 'Unknown',
          icon: mod.logo?.url || 'https://www.curseforge.com/images/logo-curseforge.png',
          source: 'curseforge' as ModSource,
          original: mod,
        }));
      } else if (activeSource === 'porcos') {
        const data = await apiFetchPorcos();
        const grouped = new Map();
        if (data.modpacks && Array.isArray(data.modpacks)) {
          data.modpacks.forEach((mp: any) => {
            if (!grouped.has(mp.id)) {
              grouped.set(mp.id, {
                id: mp.id, name: mp.name, description: mp.description,
                author: 'Porcos Team', icon: mp.icon, source: 'porcos' as ModSource, versions: [],
              });
            }
            grouped.get(mp.id).versions.push(mp);
          });
        }

        results = Array.from(grouped.values()).map((g: any) => {
          const sortedVersions = g.versions.sort((a: any, b: any) =>
            b.version.localeCompare(a.version, undefined, { numeric: true })
          );
          return {
            ...g,
            icon: sortedVersions[0]?.icon || g.icon,
            downloads: 'N/A',
            versions: sortedVersions,
          };
        });

        if (query) {
          const q = query.toLowerCase();
          results = results.filter(item =>
            item.name.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q)
          );
        }
      }

      set({ searchResults: results, totalHits, isLoadingSearch: false });
    } catch (e) {
      console.error('Failed to search mods:', e);
      set({ searchResults: [], isLoadingSearch: false });
    }
  },

  loadUpdates: async () => {
    const { searchResults, installedMods, installedSlugs, instancePath } = get();
    if (!instancePath || installedMods.size === 0) return;

    set({ isLoadingUpdates: true });

    const updates = new Map<string, UpdateInfo>();
    const itemsToCheck = searchResults.filter(item =>
      installedMods.has(item.id) || (item.original?.slug && installedSlugs.has(item.original.slug.toLowerCase()))
    );

    await processInChunks(itemsToCheck, 5, async (item) => {
      try {
        const update = await get().checkModUpdate(item);
        if (update) {
          updates.set(item.id, update);
        }
      } catch (e) {}
    });

    set({ updatesAvailable: updates, isLoadingUpdates: false });
  },

  checkModUpdate: async (mod: ModInfo): Promise<UpdateInfo | null> => {
    const { installedMods, installedSlugs, filterVersion, filterLoader } = get();
    let installed = installedMods.get(mod.id);
    if (!installed && mod.original?.slug) installed = installedSlugs.get(mod.original.slug.toLowerCase());
    if (!installed) return null;

    try {
      if (mod.source === 'modrinth') {
        const loaders = filterLoader ? getExpandedLoaders(filterLoader) : [];
        const data = await getModrinthFilteredVersions(mod.id, loaders, [filterVersion]);
        if (data && data.length > 0) {
          const latest = data[0];
          if ((installed as any).versionId && latest.id === (installed as any).versionId) return null;
          const isFileMatch = latest.files.some((f: any) => f.filename === installed!.file);
          const isVersionMatch = latest.version_number === installed!.version;
          if (!isFileMatch && !isVersionMatch) {
            return {
              currentVersion: installed!.version || 'unknown',
              newVersion: latest.version_number,
              changelog: latest.changelog,
            };
          }
        }
      } else if (mod.source === 'curseforge') {
        const cfData = await getCurseForgeModFiles(mod.id, filterVersion);
        if (cfData.data && cfData.data.length > 0) {
          let compatibleFile = cfData.data.find((f: any) => {
            const hasVersion = f.gameVersions.includes(filterVersion);
            let hasLoader = true;
            if (filterLoader) hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === filterLoader.toLowerCase());
            return hasVersion && hasLoader;
          }) || cfData.data[0];

          if (compatibleFile) {
            if ((installed as any).versionId && compatibleFile.id.toString() === (installed as any).versionId) return null;
            const isFileMatch = compatibleFile.fileName === installed!.file;
            const isVersionMatch = installed!.version && compatibleFile.displayName === installed!.version;
            if (!isFileMatch && !isVersionMatch) {
              return {
                currentVersion: installed!.version || 'unknown',
                newVersion: compatibleFile.displayName,
              };
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to check update for', mod.name, e);
    }
    return null;
  },

  installMod: async (item: ModInfo, version?: any) => {
    const { targetInstanceId, instancePath } = get();
    if (!targetInstanceId || !instancePath) return;

    set({ installingModId: item.id });

    try {
      // Simplified - full implementation in useModInstall hook
      // This is a placeholder that should be replaced
      console.log('Installing mod:', item.name, 'version:', version);
    } finally {
      set({ installingModId: null });
    }
  },

  uninstallMod: async (mod: ModInfo) => {
    const { targetInstanceId, instancePath, installedMods, installedSlugs } = get();
    if (!targetInstanceId || !instancePath) return;

    let installed = installedMods.get(mod.id);
    if (!installed && mod.original?.slug) installed = installedSlugs.get(mod.original.slug.toLowerCase());
    if (!installed) return;

    const fileName = installed.file;
    const modPath = await join(instancePath, 'mods', fileName);

    try {
      const exists = await invoke('file_exists', { path: modPath }) as boolean;
      if (exists) {
        await invoke('delete_file', { path: modPath });
      }

      // Update mods.json
      const modsJsonPath = await join(instancePath, 'mods.json');
      const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
      const data = JSON.parse(content);
      data.mods = data.mods.filter((m: any) => m.id !== mod.id && m.file !== fileName);
      await invoke('write_text_file', {
        path: modsJsonPath,
        content: JSON.stringify(data, null, 2),
      });

      // Reload installed mods
      await get().loadInstalledMods();
    } catch (e) {
      console.error('Failed to uninstall mod:', e);
    }
  },

  toggleMod: async (mod: ModInfo) => {
    const { targetInstanceId, instancePath, installedMods, installedSlugs } = get();
    if (!targetInstanceId || !instancePath) return;

    let installed = installedMods.get(mod.id);
    if (!installed && mod.original?.slug) installed = installedSlugs.get(mod.original.slug.toLowerCase());
    if (!installed) return;

    const currentFile = installed.file;
    const modsDir = await join(instancePath, 'mods');
    const isDisabled = currentFile.endsWith('.disabled');
    const newFile = isDisabled ? currentFile.replace('.disabled', '') : currentFile + '.disabled';
    const oldPath = await join(modsDir, currentFile);
    const newPath = await join(modsDir, newFile);

    try {
      await invoke('rename_file', { path: oldPath, newPath });

      // Update mods.json
      const modsJsonPath = await join(instancePath, 'mods.json');
      const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
      const data = JSON.parse(content);
      const modEntry = data.mods.find((m: any) => m.id === mod.id || m.file === currentFile);
      if (modEntry) modEntry.file = newFile;
      await invoke('write_text_file', {
        path: modsJsonPath,
        content: JSON.stringify(data, null, 2),
      });

      // Reload installed mods
      await get().loadInstalledMods();
    } catch (e) {
      console.error('Failed to toggle mod:', e);
    }
  },

  verifyDependencies: async () => {
    const { targetInstanceId, instancePath, installedMods, installedSlugs } = get();
    if (!targetInstanceId || !instancePath) return;

    set({ isVerifyingDeps: true, verificationStatus: 'Iniciando verificación...' });

    try {
      const localMods = new Map<string, InstalledMod>();
      for (const [id, mod] of installedMods.entries()) {
        localMods.set(id, { ...mod });
      }

      const installedProjectIds = new Set<string>();
      for (const id of localMods.keys()) installedProjectIds.add(id);
      for (const slug of installedSlugs.keys()) installedProjectIds.add(slug);

      set({ verificationStatus: 'Analizando archivos...' });
      const hashesToResolve: string[] = [];
      const hashToModId = new Map<string, string>();
      const murmurHashesToResolve: number[] = [];
      const murmurToModId = new Map<number, string>();

      let processedHashes = 0;
      const allMods = Array.from(localMods.entries());

      await processInChunks(allMods, 5, async ([id, mod]) => {
        try {
          const filePath = await join(instancePath!, 'mods', mod.file);
          const exists = await invoke('file_exists', { path: filePath }) as boolean;
          if (exists) {
            if (!mod.versionId && mod.source !== 'curseforge') {
              const hash = await invoke('get_file_hash', { path: filePath }) as string;
              hashesToResolve.push(hash);
              hashToModId.set(hash, id);
            }
            const murmur = await invoke('get_file_hash_murmur2', { path: filePath }) as number;
            murmurHashesToResolve.push(murmur);
            murmurToModId.set(murmur, id);
          }
        } catch (e) {}
        processedHashes++;
        if (processedHashes % 5 === 0) set({ verificationStatus: `Analizando archivos (${processedHashes}/${allMods.length})...` });
      });

      // Batch Modrinth hashes
      if (hashesToResolve.length > 0) {
        set({ verificationStatus: 'Consultando API de Modrinth (Hashes)...' });
        for (let i = 0; i < hashesToResolve.length; i += 50) {
          const chunk = hashesToResolve.slice(i, i + 50);
          try {
            const data = await resolveModrinthHashes(chunk);
            for (const [hash, versionData] of Object.entries(data)) {
              const vData = versionData as any;
              const modId = hashToModId.get(hash);
              if (modId && vData.project_id) {
                installedProjectIds.add(vData.project_id);
                const mod = localMods.get(modId);
                if (mod) { mod.versionId = vData.id; mod.source = 'modrinth'; localMods.set(modId, mod); }
              }
            }
          } catch (e) { console.error('Batch hash lookup failed', e); }
        }
      }

      // Batch CurseForge fingerprints
      const curseforgeChecks: { modId: string; fileId: string }[] = [];
      if (murmurHashesToResolve.length > 0) {
        set({ verificationStatus: 'Consultando API de CurseForge (Fingerprints)...' });
        for (let i = 0; i < murmurHashesToResolve.length; i += 50) {
          const chunk = murmurHashesToResolve.slice(i, i + 50);
          try {
            const data = await resolveCurseForgeFingerprints(chunk);
            if (data.data?.exactMatches) {
              for (const match of data.data.exactMatches) {
                curseforgeChecks.push({ modId: match.id.toString(), fileId: match.file.id.toString() });
                installedProjectIds.add(match.id.toString());
              }
            }
          } catch (e) { console.error('Batch fingerprint lookup failed', e); }
        }
      }

      // Check dependencies
      set({ verificationStatus: 'Verificando dependencias...' });
      const modrinthVersionIds: string[] = [];
      localMods.forEach((mod, id) => {
        if (mod.versionId) {
          if (mod.source === 'modrinth') modrinthVersionIds.push(mod.versionId);
          else if (mod.source === 'curseforge') {
            if (!curseforgeChecks.some(c => c.modId === id && c.fileId === mod.versionId)) {
              curseforgeChecks.push({ modId: id, fileId: mod.versionId! });
            }
          }
        }
      });

      // Batch Modrinth versions
      const missingDeps = new Map<string, { id: string; source: ModSource; type: 'required' | 'optional' }>();
      if (modrinthVersionIds.length > 0) {
        set({ verificationStatus: `Verificando ${modrinthVersionIds.length} mods de Modrinth...` });
        for (let i = 0; i < modrinthVersionIds.length; i += 50) {
          const chunk = modrinthVersionIds.slice(i, i + 50);
          try {
            const versionsData = await getModrinthVersionsByIds(chunk);
            for (const versionData of versionsData) {
              if (versionData.dependencies) {
                for (const dep of versionData.dependencies) {
                  if (!dep.project_id || installedProjectIds.has(dep.project_id)) continue;
                  if (dep.dependency_type === 'required') {
                    if (!missingDeps.has(dep.project_id) || missingDeps.get(dep.project_id)!.type !== 'required') {
                      missingDeps.set(dep.project_id, { id: dep.project_id, source: 'modrinth', type: 'required' });
                    }
                  } else if (dep.dependency_type === 'optional') {
                    if (!missingDeps.has(dep.project_id)) {
                      missingDeps.set(dep.project_id, { id: dep.project_id, source: 'modrinth', type: 'optional' });
                    }
                  }
                }
              }
            }
          } catch (e) { console.error('Batch version lookup failed', e); }
        }
      }

      // CurseForge file checks
      if (curseforgeChecks.length > 0) {
        set({ verificationStatus: `Verificando ${curseforgeChecks.length} mods de CurseForge...` });
        let processedCF = 0;
        await processInChunks(curseforgeChecks, 5, async ({ modId, fileId }) => {
          try {
            const data = await getCurseForgeFile(modId, fileId);
            if (data.data?.dependencies) {
              for (const dep of data.data.dependencies) {
                const depId = dep.modId.toString();
                if (localMods.has(depId) || installedProjectIds.has(depId)) continue;
                if (dep.relationType === 3) {
                  if (!missingDeps.has(depId) || missingDeps.get(depId)!.type !== 'required') {
                    missingDeps.set(depId, { id: depId, source: 'curseforge', type: 'required' });
                  }
                } else if (dep.relationType === 2) {
                  if (!missingDeps.has(depId)) {
                    missingDeps.set(depId, { id: depId, source: 'curseforge', type: 'optional' });
                  }
                }
              }
            }
          } catch (e) { console.error(`Failed to check CF deps for file ${fileId}`, e); }
          processedCF++;
          if (processedCF % 5 === 0) set({ verificationStatus: `Verificando CurseForge (${processedCF}/${curseforgeChecks.length})...` });
        });
      }

      set({ verificationStatus: '', isVerifyingDeps: false });
    } catch (e) {
      console.error('Verification failed', e);
      set({ verificationStatus: '', isVerifyingDeps: false });
      throw e;
    }
  },

  clearSearchResults: () => set({ searchResults: [] }),

  setFilters: (filters) => set({
    filterVersion: filters.version ?? get().filterVersion,
    filterLoader: filters.loader ?? get().filterLoader,
    filterCategory: filters.category ?? get().filterCategory,
  }),

  setSearchType: (type) => set({ searchType: type }),
  setActiveSource: (source) => set({ activeSource: source }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

export default useModsStore;