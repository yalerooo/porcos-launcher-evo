import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import type { InstalledMod } from './useModSearch';

export function useInstalledMods(targetInstanceId: string) {
  const [installedMods, setInstalledMods] = useState<Map<string, InstalledMod>>(new Map());
  const [installedSlugs, setInstalledSlugs] = useState<Map<string, InstalledMod>>(new Map());
  const [isLoadingMods, setIsLoadingMods] = useState(false);

  // Load installed mods: phase 1 (mods.json, instant) then phase 2 (JAR scan, background)
  useEffect(() => {
    let cancelled = false;

    const loadInstalled = async () => {
      if (!targetInstanceId) {
        setInstalledMods(new Map());
        setInstalledSlugs(new Map());
        setIsLoadingMods(false);
        return;
      }
      setIsLoadingMods(true);

      const newInstalledMods = new Map<string, InstalledMod>();

      try {
        const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;

        // Phase 1: Read mods.json — show results immediately
        const modsJsonPath = await join(instancePath, 'mods.json');
        const exists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
        if (exists) {
          const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
          const data = JSON.parse(content);
          if (data.mods && Array.isArray(data.mods)) {
            data.mods.forEach((m: any) => {
              newInstalledMods.set(m.id, {
                file: m.file, version: m.version, source: m.source, versionId: m.versionId,
              });
            });
          }
        }

        if (cancelled) return;
        // Show tracked mods instantly — single atomic update for both maps
        const newInstalledSlugs = new Map<string, InstalledMod>();
        setInstalledMods(new Map(newInstalledMods));
        setInstalledSlugs(newInstalledSlugs);

        // Phase 2: Scan mods folder for slug mapping + untracked mods (background)
        const modsDir = await join(instancePath, 'mods');
        const modsDirExists = await invoke('file_exists', { path: modsDir }) as boolean;

        if (modsDirExists) {
          const files = await invoke('list_files', { path: modsDir }) as any[];
          const jarFiles = files.filter(f => f.name.endsWith('.jar') || f.name.endsWith('.jar.disabled'));

          const trackedFiles = new Set<string>();
          newInstalledMods.forEach(mod => trackedFiles.add(mod.file));

          // Only scan JARs not already tracked — skip metadata for known files
          const untrackedJars = jarFiles.filter(f => !trackedFiles.has(f.name));

          if (untrackedJars.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < untrackedJars.length; i += chunkSize) {
              if (cancelled) return;
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
                    const modInfo = { file: file.name, version: metadata.version || 'unknown' };
                    newInstalledSlugs.set(normalizedId, modInfo);
                    if (!newInstalledMods.has(normalizedId)) {
                      newInstalledMods.set(normalizedId, modInfo);
                    }
                  }
                } catch (e) { /* ignore errors reading metadata */ }
              }));
            }

            if (cancelled) return;
            // Single batch update after all JARs scanned
            setInstalledMods(new Map(newInstalledMods));
            setInstalledSlugs(new Map(newInstalledSlugs));
          }
        }
      } catch (e) {
        console.error("Failed to load installed mods", e);
      } finally {
        if (!cancelled) setIsLoadingMods(false);
      }
    };
    loadInstalled();

    return () => { cancelled = true; };
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

      setInstalledMods(prev => new Map(prev).set(modInfo.id, {
        file: modInfo.file, version: modInfo.version,
        source: modInfo.source, versionId: modInfo.versionId,
      }));
    } catch (e) {
      console.error("Failed to save installed mod", e);
    }
  };

  return {
    installedMods, setInstalledMods,
    installedSlugs, setInstalledSlugs,
    isLoadingMods,
    saveInstalledMod,
  };
}
