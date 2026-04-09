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
  items: any[];
  installedMods: Map<string, InstalledMod>;
  installedSlugs: Map<string, InstalledMod>;
  filterVersion: string;
  filterLoader: string;
  targetInstanceId: string;
  updatesAvailable: Map<string, boolean>;
  setUpdatesAvailable: (fn: React.SetStateAction<Map<string, boolean>>) => void;
  handleInstall: (item: any, selectedVersion?: any, options?: { silent?: boolean; ignoreLock?: boolean }) => Promise<void>;
  installModrinth: (
    projectId: string, version: string, loader: string, instancePath: string,
    visited?: Set<string>, specificVersionId?: string, isDependency?: boolean, onProgress?: (msg: string) => void,
  ) => Promise<any[]>;
  installCurseForge: (
    modId: string, version: string, loader: string, instancePath: string,
    visited?: Set<string>, specificFileId?: number, isDependency?: boolean, onProgress?: (msg: string) => void,
  ) => Promise<any[]>;
  setVerificationStatus: (status: string) => void;
  showConfirmAsync: (opts: { title: string; message: string; confirmText?: string; danger?: boolean }) => Promise<boolean>;
  showDependencySelectAsync: (deps: DependencyItem[]) => Promise<string[]>;
  setTargetInstanceId: (id: string) => void;
}

export function useModUpdates({
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
}: UseModUpdatesOptions) {
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const currentUpdateRequestId = useRef(0);
  const checkedItemIds = useRef(new Set<string>());

  // Check for updates on visible items
  useEffect(() => {
    const checkUpdates = async () => {
      if (!filterVersion) return;
      const requestId = ++currentUpdateRequestId.current;
      const batchResults = new Map<string, boolean>();

      // Only check items we haven't already checked in this session
      const itemsToCheck = items.filter(item => !checkedItemIds.current.has(item.id));
      if (itemsToCheck.length === 0) return;

      await processInChunks(itemsToCheck, 5, async (item) => {
        if (currentUpdateRequestId.current !== requestId) return;

        let installed = installedMods.get(item.id);
        if (!installed && item.original?.slug) installed = installedSlugs.get(item.original.slug.toLowerCase());

        if (installed) {
          try {
            let needsUpdate = false;

            if (item.source === 'modrinth') {
              const loaders = filterLoader ? getExpandedLoaders(filterLoader) : [];
              const data = await getModrinthFilteredVersions(item.id, loaders, [filterVersion]);
              if (data && data.length > 0) {
                const latest = data[0];
                if ((installed as any).versionId && latest.id === (installed as any).versionId) {
                  // match
                } else {
                  const isFileMatch = latest.files.some((f: any) => f.filename === installed!.file);
                  const isVersionMatch = latest.version_number === installed!.version;
                  if (!isFileMatch && !isVersionMatch) needsUpdate = true;
                }
              }
            } else if (item.source === 'curseforge') {
              const cfData = await getCurseForgeModFiles(item.id, filterVersion);
              if (cfData.data && cfData.data.length > 0) {
                let compatibleFile = cfData.data.find((f: any) => {
                  const hasVersion = f.gameVersions.includes(filterVersion);
                  let hasLoader = true;
                  if (filterLoader) hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === filterLoader.toLowerCase());
                  return hasVersion && hasLoader;
                }) || cfData.data[0];

                if (compatibleFile) {
                  if ((installed as any).versionId && compatibleFile.id.toString() === (installed as any).versionId) {
                    // match
                  } else {
                    const isFileMatch = compatibleFile.fileName === installed!.file;
                    const isVersionMatch = installed!.version && compatibleFile.displayName === installed!.version;
                    if (!isFileMatch && !isVersionMatch) needsUpdate = true;
                  }
                }
              }
            }

            if (needsUpdate) batchResults.set(item.id, true);
          } catch (e) {
            console.error("Failed to check update for", item.name, e);
          }
        }
      });

      // Merge results into existing map instead of replacing
      if (currentUpdateRequestId.current === requestId) {
        // Mark all checked items so we don't recheck them
        for (const item of itemsToCheck) {
          checkedItemIds.current.add(item.id);
        }

        setUpdatesAvailable(prev => {
          const merged = new Map(prev);
          // Add new update results
          for (const [id, val] of batchResults) {
            merged.set(id, val);
          }
          // Remove items we checked that DON'T need updates
          for (const item of itemsToCheck) {
            if (!batchResults.has(item.id)) {
              merged.delete(item.id);
            }
          }
          return merged;
        });
      }
    };

    if (items.length > 0) checkUpdates();
  }, [items, installedMods, installedSlugs, filterVersion, filterLoader]);

  // Clear updates and checked cache when instance changes
  useEffect(() => {
    setUpdatesAvailable(new Map());
    checkedItemIds.current.clear();
  }, [targetInstanceId]);

  const handleUpdateAll = async () => {
    const updates = items.filter(item => updatesAvailable.get(item.id));
    if (updates.length === 0) return;
    setIsUpdatingAll(true);
    try {
      for (const item of updates) {
        await handleInstall(item, undefined, { silent: true, ignoreLock: true });
      }
    } finally {
      setIsUpdatingAll(false);
    }
  };

  const verifyDependencies = async () => {
    if (!targetInstanceId) return;
    setIsUpdatingAll(true);
    setVerificationStatus('Iniciando verificación...');

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      // Track deps with their type: required or optional
      const missingDeps = new Map<string, { id: string; source: ModSource; type: 'required' | 'optional' }>();

      // Work on a local copy so we don't mutate React state
      const localMods = new Map<string, InstalledMod>();
      for (const [id, mod] of installedMods.entries()) {
        localMods.set(id, { ...mod });
      }

      const installedProjectIds = new Set<string>();
      for (const id of localMods.keys()) installedProjectIds.add(id);
      // Also add slug-based IDs so cross-platform matches work
      for (const slug of installedSlugs.keys()) installedProjectIds.add(slug);

      setVerificationStatus('Analizando archivos...');
      const hashesToResolve: string[] = [];
      const hashToModId = new Map<string, string>();
      const murmurHashesToResolve: number[] = [];
      const murmurToModId = new Map<number, string>();

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
            murmurToModId.set(murmur, id);
          }
        } catch (e) {}
        processedHashes++;
        if (processedHashes % 5 === 0) setVerificationStatus(`Analizando archivos (${processedHashes}/${allMods.length})...`);
      });

      // Batch Modrinth hashes
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

      // Batch CurseForge fingerprints
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

      // Check dependencies (required + optional)
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

      // Batch Modrinth versions — check required AND optional
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
                    // Only add as required if not already tracked (don't downgrade optional→required conflict)
                    if (!missingDeps.has(dep.project_id) || missingDeps.get(dep.project_id)!.type !== 'required') {
                      missingDeps.set(dep.project_id, { id: dep.project_id, source: 'modrinth', type: 'required' });
                    }
                  } else if (dep.dependency_type === 'optional') {
                    if (!missingDeps.has(dep.project_id)) {
                      missingDeps.set(dep.project_id, { id: dep.project_id, source: 'modrinth', type: 'optional' });
                    }
                  }
                  // Skip 'incompatible' and 'embedded' types
                }
              }
            }
          } catch (e) { console.error("Batch version lookup failed", e); }
        }
      }

      // CurseForge file checks — relationType 3=required, 2=optional
      if (curseforgeChecks.length > 0) {
        setVerificationStatus(`Verificando ${curseforgeChecks.length} mods de CurseForge...`);
        let processedCF = 0;
        await processInChunks(curseforgeChecks, 5, async ({ modId, fileId }) => {
          try {
            const data = await getCurseForgeFile(modId, fileId);
            if (data.data.dependencies) {
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
                // Skip relationType 1 (embedded), 5 (incompatible), etc.
              }
            }
          } catch (e) { console.error(`Failed to check CF deps for file ${fileId}`, e); }
          processedCF++;
          if (processedCF % 5 === 0) setVerificationStatus(`Verificando CurseForge (${processedCF}/${curseforgeChecks.length})...`);
        });
      }

      setVerificationStatus('');

      if (missingDeps.size > 0) {
        // Resolve names and icons for all missing deps
        setVerificationStatus('Obteniendo información de dependencias...');
        const depsArray = Array.from(missingDeps.values());
        const modrinthDepIds = depsArray.filter(d => d.source === 'modrinth').map(d => d.id);
        const curseforgeDepIds = depsArray.filter(d => d.source === 'curseforge').map(d => parseInt(d.id));

        const depInfoMap = new Map<string, { name: string; icon?: string; slug?: string }>();

        // Batch resolve Modrinth project names
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

        // Batch resolve CurseForge mod names
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

        // Filter out deps that are actually installed (cross-platform: check by slug and name)
        const installedNames = new Set<string>();
        // Collect all known slugs/IDs as lowercase for matching
        for (const slug of installedSlugs.keys()) installedNames.add(slug.toLowerCase());
        for (const id of installedMods.keys()) installedNames.add(id.toLowerCase());

        const filteredDeps = depsArray.filter(dep => {
          const info = depInfoMap.get(dep.id);
          if (!info) return true; // keep if we couldn't resolve — can't verify
          const slug = info.slug?.toLowerCase();
          const name = info.name.toLowerCase().replace(/\s+/g, '-');
          // Check if slug or name-as-slug matches any installed mod
          if (slug && installedNames.has(slug)) return false;
          if (installedNames.has(name)) return false;
          if (installedNames.has(dep.id.toLowerCase())) return false;
          return true;
        });

        setVerificationStatus('');

        if (filteredDeps.length === 0) {
          // All deps were actually already installed
          await showConfirmAsync({
            title: 'Verificación completada',
            message: 'Todas las dependencias parecen estar instaladas.',
            confirmText: 'Entendido',
          });
        } else {
        // Build the dependency items for the selection modal
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

        // Deduplicate: same dep can appear from both Modrinth and CurseForge
        // Keep the one with the highest priority: required > optional, modrinth > curseforge
        const seenNames = new Map<string, DependencyItem>();
        for (const dep of depItemsRaw) {
          const key = dep.name.toLowerCase();
          const existing = seenNames.get(key);
          if (!existing) {
            seenNames.set(key, dep);
          } else {
            // Prefer required over optional
            if (dep.type === 'required' && existing.type !== 'required') {
              seenNames.set(key, dep);
            } else if (dep.type === existing.type && existing.source === 'curseforge' && dep.source === 'modrinth') {
              // Same priority, prefer modrinth
              seenNames.set(key, dep);
            }
          }
        }
        const depItems = Array.from(seenNames.values());

        // Sort: required first, then optional
        depItems.sort((a, b) => {
          if (a.type === 'required' && b.type !== 'required') return -1;
          if (a.type !== 'required' && b.type === 'required') return 1;
          return a.name.localeCompare(b.name);
        });

        const selectedIds = await showDependencySelectAsync(depItems);

        if (selectedIds.length > 0) {
          let installedCount = 0;
          for (let i = 0; i < selectedIds.length; i++) {
            const depId = selectedIds[i];
            const dep = missingDeps.get(depId);
            if (!dep) continue;
            setVerificationStatus(`Instalando dependencia ${i + 1}/${selectedIds.length}...`);
            try {
              if (dep.source === 'modrinth') await installModrinth(dep.id, filterVersion, filterLoader, instancePath, new Set(), undefined, true);
              else await installCurseForge(dep.id, filterVersion, filterLoader, instancePath, new Set(), undefined, true);
              installedCount++;
            } catch (e) { console.error(`Failed to install dependency ${dep.id}`, e); }
          }
          setVerificationStatus('');
          await showConfirmAsync({
            title: 'Verificación completada',
            message: `Se instalaron ${installedCount} de ${selectedIds.length} dependencias seleccionadas.`,
            confirmText: 'Entendido',
          });
          const currentId = targetInstanceId;
          setTargetInstanceId('');
          setTimeout(() => setTargetInstanceId(currentId), 50);
        }
        } // end filteredDeps.length > 0
      } else {
        setVerificationStatus('');
        await showConfirmAsync({
          title: 'Verificación completada',
          message: 'Todas las dependencias parecen estar instaladas.',
          confirmText: 'Entendido',
        });
      }
    } catch (e) {
      console.error("Verification failed", e);
      setVerificationStatus('');
      await showConfirmAsync({
        title: 'Error',
        message: 'Error al verificar dependencias.',
        confirmText: 'Entendido', danger: true,
      });
    } finally {
      setIsUpdatingAll(false);
      setVerificationStatus('');
    }
  };

  return {
    isUpdatingAll,
    handleUpdateAll,
    verifyDependencies,
  };
}
