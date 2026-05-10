import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import {
  getModrinthFilteredVersions,
  getModrinthVersionsByIds,
  getModrinthProjects,
  getCurseForgeModFiles,
  getCurseForgeFile,
  getCurseForgeModsBatch,
  resolveModrinthHashes,
  resolveCurseForgeFingerprints,
  getExpandedLoaders,
} from '@/lib/modApiService';
import type { InstalledMod, ModSource } from './useModSearch';
import type { DependencyItem } from '@/components/DependencySelectModal';

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  name?: string;
  icon?: string;
  source?: string;
}

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

interface UseModUpdatesOptions {
  installedMods: Map<string, InstalledMod>;
  installedSlugs: Map<string, InstalledMod>;
  filterVersion: string;
  filterLoader: string;
  targetInstanceId: string;
  updatesAvailable: Map<string, UpdateInfo>;
  setUpdatesAvailable: (fn: React.SetStateAction<Map<string, UpdateInfo>>) => void;
  handleInstall: (item: any, selectedVersion?: any, options?: { silent?: boolean; ignoreLock?: boolean }) => Promise<void>;
  setVerificationStatus: (status: string) => void;
  setIsCheckingUpdates?: (val: boolean) => void;
}

export function useModUpdates({
  installedMods,
  installedSlugs,
  filterVersion,
  filterLoader,
  targetInstanceId,
  updatesAvailable,
  setUpdatesAvailable,
  handleInstall,
  setVerificationStatus,
  setIsCheckingUpdates,
}: UseModUpdatesOptions) {
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [checkedCount, setCheckedCount] = useState(0);
  const [totalToCheck, setTotalToCheck] = useState(0);
  const currentUpdateRequestId = useRef(0);
  const checkedModIds = useRef(new Set<string>());

  // Check for updates on installed mods (NOT search results)
  useEffect(() => {
    if (!filterVersion || installedMods.size === 0) {
      setIsCheckingUpdates?.(false);
      return;
    }

    let requestId = ++currentUpdateRequestId.current;
    const modsToCheck = Array.from(installedMods.keys()).filter(id => !checkedModIds.current.has(id));

    if (modsToCheck.length === 0) {
      setIsCheckingUpdates?.(false);
      return;
    }

    setTotalToCheck(modsToCheck.length);
    setCheckedCount(0);
    setIsCheckingUpdates?.(true);

    const checkUpdates = async () => {
      const batchResults = new Map<string, UpdateInfo>();
      let processed = 0;

      await processInChunks(modsToCheck, 3, async (modId) => {
        if (currentUpdateRequestId.current !== requestId) return;

        const mod = installedMods.get(modId);
        if (!mod) return;

        try {
          let updateInfo: UpdateInfo | null = null;
          const source = mod.source || 'modrinth';

          if (source === 'modrinth') {
            const loaders = filterLoader ? getExpandedLoaders(filterLoader) : [];
            const versions = await getModrinthFilteredVersions(modId, loaders, [filterVersion]);
            if (versions && versions.length > 0) {
              const latest = versions[0];
              const isFileMatch = latest.files.some((f: any) => f.filename === mod!.file);
              const isVersionMatch = mod.version && latest.version_number === mod.version;
              if (!isFileMatch && !isVersionMatch) {
                let name = modId;
                let icon: string | undefined;
                try {
                  const projects = await getModrinthProjects([modId]);
                  if (projects.length > 0) {
                    name = projects[0].title;
                    icon = projects[0].icon_url;
                  }
                } catch {}
                updateInfo = {
                  currentVersion: mod.version || 'unknown',
                  newVersion: latest.version_number,
                  changelog: latest.changelog,
                  name,
                  icon,
                  source: 'modrinth',
                };
              }
            }
          } else if (source === 'curseforge') {
            const cfData = await getCurseForgeModFiles(modId, filterVersion);
            if (cfData.data && cfData.data.length > 0) {
              let compatibleFile = cfData.data.find((f: any) => {
                const hasVersion = f.gameVersions.includes(filterVersion);
                let hasLoader = true;
                if (filterLoader) hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === filterLoader.toLowerCase());
                return hasVersion && hasLoader;
              }) || cfData.data[0];

              if (compatibleFile) {
                const isFileMatch = compatibleFile.fileName === mod!.file;
                const isVersionMatch = mod.version && compatibleFile.displayName === mod.version;
                if (!isFileMatch && !isVersionMatch) {
                  let name = modId;
                  let icon: string | undefined;
                  try {
                    const cfMod = await getCurseForgeModsBatch([parseInt(modId)]);
                    if (cfMod.data && cfMod.data.length > 0) {
                      name = cfMod.data[0].name;
                      icon = cfMod.data[0].logo?.url;
                    }
                  } catch {}
                  updateInfo = {
                    currentVersion: mod.version || 'unknown',
                    newVersion: compatibleFile.displayName,
                    name,
                    icon,
                    source: 'curseforge',
                  };
                }
              }
            }
          }

          if (updateInfo) {
            batchResults.set(modId, updateInfo);
          }

          processed++;
          setCheckedCount(processed);
        } catch (e) {
          processed++;
          setCheckedCount(processed);
          console.error("Failed to check update for", modId, e);
        }
      });

      if (currentUpdateRequestId.current === requestId) {
        for (const modId of modsToCheck) {
          checkedModIds.current.add(modId);
        }

        setUpdatesAvailable(prev => {
          const merged = new Map(prev);
          for (const [id, val] of batchResults) {
            merged.set(id, val);
          }
          return merged;
        });
      }
    };

    checkUpdates().finally(() => {
      setIsCheckingUpdates?.(false);
      setCheckedCount(0);
      setTotalToCheck(0);
    });
  }, [installedMods, filterVersion, filterLoader, targetInstanceId]);

  // Clear updates and checked cache when instance changes
  useEffect(() => {
    setUpdatesAvailable(new Map());
    checkedModIds.current.clear();
  }, [targetInstanceId]);

  const handleUpdateAll = async () => {
    const modsWithUpdates = Array.from(installedMods.keys()).filter(id => updatesAvailable.has(id));
    if (modsWithUpdates.length === 0) return;
    setIsUpdatingAll(true);
    try {
      for (const modId of modsWithUpdates) {
        const updateInfo = updatesAvailable.get(modId);
        if (!updateInfo) continue;
        // We don't have the full item object here, so we'll install the specific version
        // This needs handleInstall to support updating by modId
        await handleInstall({ id: modId, source: installedMods.get(modId)?.source || 'modrinth' }, updateInfo.newVersion, { silent: true, ignoreLock: true });
      }
    } finally {
      setIsUpdatingAll(false);
    }
  };

  const verifyDependencies = async (): Promise<{
    success: boolean;
    deps?: DependencyItem[];
    installedCount?: number;
    error?: string;
  }> => {
    if (!targetInstanceId) {
      return { success: false, error: 'No instance selected' };
    }
    setIsUpdatingAll(true);
    setVerificationStatus('Iniciando verificación...');

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      const missingDeps = new Map<string, { id: string; source: ModSource; type: 'required' | 'optional' }>();

      const localMods = new Map<string, InstalledMod>();
      for (const [id, mod] of installedMods.entries()) {
        localMods.set(id, { ...mod });
      }

      const installedProjectIds = new Set<string>();
      for (const id of localMods.keys()) installedProjectIds.add(id);
      for (const slug of installedSlugs.keys()) installedProjectIds.add(slug);

      setVerificationStatus('Analizando archivos...');
      const hashesToResolve: string[] = [];
      const hashToModId = new Map<string, string>();
      const murmurHashesToResolve: number[] = [];

      let processedHashes = 0;
      const allMods = Array.from(localMods.entries());

      await processInChunks(allMods, 5, async ([id, mod]) => {
        try {
          const filePath = await join(instancePath, 'mods', mod.file);
          const exists = await invoke('file_exists', { path: filePath }) as boolean;
          if (exists) {
            if (!mod.versionId && mod.source !== 'curseforge') {
              const hash = await invoke('get_file_hash', { path: filePath }) as string;
              hashesToResolve.push(hash);
              hashToModId.set(hash, id);
            }
            const murmur = await invoke('get_file_hash_murmur2', { path: filePath }) as number;
            murmurHashesToResolve.push(murmur);
          }
        } catch (e) {}
        processedHashes++;
        if (processedHashes % 5 === 0) setVerificationStatus(`Analizando archivos (${processedHashes}/${allMods.length})...`);
      });

      if (hashesToResolve.length > 0) {
        setVerificationStatus('Consultando API de Modrinth (Hashes)...');
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
          } catch (e) { console.error("Batch hash lookup failed", e); }
        }
      }

      const curseforgeChecks: { modId: string; fileId: string }[] = [];
      if (murmurHashesToResolve.length > 0) {
        setVerificationStatus('Consultando API de CurseForge (Fingerprints)...');
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
          } catch (e) { console.error("Batch fingerprint lookup failed", e); }
        }
      }

      setVerificationStatus('Verificando dependencias...');
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

      if (modrinthVersionIds.length > 0) {
        setVerificationStatus(`Verificando ${modrinthVersionIds.length} mods de Modrinth...`);
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
          } catch (e) { console.error("Batch version lookup failed", e); }
        }
      }

      if (curseforgeChecks.length > 0) {
        setVerificationStatus(`Verificando ${curseforgeChecks.length} mods de CurseForge...`);
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
          if (processedCF % 5 === 0) setVerificationStatus(`Verificando CurseForge (${processedCF}/${curseforgeChecks.length})...`);
        });
      }

      setVerificationStatus('');

      if (missingDeps.size > 0) {
        setVerificationStatus('Obteniendo información de dependencias...');
        const depsArray = Array.from(missingDeps.values());
        const modrinthDepIds = depsArray.filter(d => d.source === 'modrinth').map(d => d.id);
        const curseforgeDepIds = depsArray.filter(d => d.source === 'curseforge').map(d => parseInt(d.id));

        const depInfoMap = new Map<string, { name: string; icon?: string; slug?: string }>();

        if (modrinthDepIds.length > 0) {
          for (let i = 0; i < modrinthDepIds.length; i += 20) {
            const chunk = modrinthDepIds.slice(i, i + 20);
            try {
              const projects = await getModrinthProjects(chunk);
              for (const p of projects) {
                depInfoMap.set(p.id, { name: p.title, icon: p.icon_url, slug: p.slug });
              }
            } catch (e) { console.error("Failed to fetch Modrinth project info", e); }
          }
        }

        if (curseforgeDepIds.length > 0) {
          for (let i = 0; i < curseforgeDepIds.length; i += 50) {
            const chunk = curseforgeDepIds.slice(i, i + 50);
            try {
              const result = await getCurseForgeModsBatch(chunk);
              if (result.data) {
                for (const mod of result.data) {
                  depInfoMap.set(mod.id.toString(), { name: mod.name, icon: mod.logo?.url, slug: mod.slug });
                }
              }
            } catch (e) { console.error("Failed to fetch CurseForge mod info", e); }
          }
        }

        const installedNames = new Set<string>();
        for (const slug of installedSlugs.keys()) installedNames.add(slug.toLowerCase());
        for (const id of installedMods.keys()) installedNames.add(id.toLowerCase());

        const filteredDeps = depsArray.filter(dep => {
          const info = depInfoMap.get(dep.id);
          if (!info) return true;
          const slug = info.slug?.toLowerCase();
          const name = info.name.toLowerCase().replace(/\s+/g, '-');
          if (slug && installedNames.has(slug)) return false;
          if (installedNames.has(name)) return false;
          if (installedNames.has(dep.id.toLowerCase())) return false;
          return true;
        });

        setVerificationStatus('');

        if (filteredDeps.length === 0) {
          return { success: true };
        }

        const depItemsRaw: DependencyItem[] = filteredDeps.map(dep => {
          const info = depInfoMap.get(dep.id);
          return {
            id: dep.id,
            source: dep.source as 'modrinth' | 'curseforge',
            name: info?.name || dep.id,
            icon: info?.icon,
            type: dep.type,
          };
        });

        const seenNames = new Map<string, DependencyItem>();
        for (const dep of depItemsRaw) {
          const key = dep.name.toLowerCase();
          const existing = seenNames.get(key);
          if (!existing) {
            seenNames.set(key, dep);
          } else {
            if (dep.type === 'required' && existing.type !== 'required') {
              seenNames.set(key, dep);
            } else if (dep.type === existing.type && existing.source === 'curseforge' && dep.source === 'modrinth') {
              seenNames.set(key, dep);
            }
          }
        }
        const depItems = Array.from(seenNames.values());
        depItems.sort((a, b) => {
          if (a.type === 'required' && b.type !== 'required') return -1;
          if (a.type !== 'required' && b.type === 'required') return 1;
          return a.name.localeCompare(b.name);
        });

        return { success: false, deps: depItems };
      } else {
        return { success: true };
      }
    } catch (e) {
      console.error("Verification failed", e);
      return { success: false, error: String(e) };
    } finally {
      setIsUpdatingAll(false);
      setVerificationStatus('');
    }
  };

  return {
    isUpdatingAll,
    handleUpdateAll,
    verifyDependencies,
    checkedCount,
    totalToCheck,
  };
}
