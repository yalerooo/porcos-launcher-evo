import React, { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import {
  getModrinthVersions,
  getModrinthProject,
  getCurseForgeModFiles,
  getCurseForgeMod,
} from '@/lib/modApiService';
import type { InstalledMod } from './useModSearch';

interface UseModInstallOptions {
  targetInstanceId: string;
  filterVersion: string;
  filterLoader: string;
  searchType: string;
  installedMods: Map<string, InstalledMod>;
  installedSlugs: Map<string, InstalledMod>;
  saveInstalledMod: (modInfo: any) => Promise<void>;
  setInstalledMods: (fn: React.SetStateAction<Map<string, InstalledMod>>) => void;
  setInstalledSlugs: (fn: React.SetStateAction<Map<string, InstalledMod>>) => void;
  setUpdatesAvailable: (fn: React.SetStateAction<Map<string, { currentVersion: string; newVersion: string; changelog?: string }>>) => void;
  showConfirmAsync: (opts: { title: string; message: string; confirmText?: string; danger?: boolean }) => Promise<boolean>;
}

export function useModInstall({
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
}: UseModInstallOptions) {
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [installedModName, setInstalledModName] = useState('');
  const [installedDependencies, setInstalledDependencies] = useState<any[]>([]);
  const [selectedModpack, setSelectedModpack] = useState<any>(null);
  const [showModpackModal, setShowModpackModal] = useState(false);
  const versionCacheRef = useRef<Map<string, any[]>>(new Map());

  const installModrinth = async (
    projectId: string, version: string, loader: string, instancePath: string,
    visited: Set<string> = new Set(), specificVersionId?: string,
    isDependency = false, onProgress?: (msg: string) => void, targetFolder = 'mods',
  ): Promise<any[]> => {
    if (visited.has(projectId)) return [];
    visited.add(projectId);
    if (isDependency && installedMods.has(projectId)) return [];

    const cacheKey = `modrinth:${projectId}`;
    let versions;
    if (versionCacheRef.current.has(cacheKey)) {
      versions = versionCacheRef.current.get(cacheKey)!;
    } else {
      versions = await getModrinthVersions(projectId);
      versionCacheRef.current.set(cacheKey, versions);
    }

    let compatibleVersion;
    if (specificVersionId) compatibleVersion = versions.find((v: any) => v.id === specificVersionId);
    if (!compatibleVersion) {
      compatibleVersion = versions.find((v: any) =>
        v.game_versions.includes(version) && (loader ? v.loaders.includes(loader.toLowerCase()) : true)
      );
    }
    if (!compatibleVersion) {
      const msg = `No compatible version found for ${isDependency ? 'dependency ' : ''}${projectId}`;
      if (!isDependency) throw new Error(msg);
      return [{ name: projectId, file: '', icon: undefined, error: msg }];
    }

    let installedFiles: any[] = [];
    if (compatibleVersion.dependencies) {
      const requiredDeps = compatibleVersion.dependencies.filter((d: any) => d.dependency_type === "required" && d.project_id);
      for (let i = 0; i < requiredDeps.length; i++) {
        const dep = requiredDeps[i];
        onProgress?.(`Dependency ${i + 1}/${requiredDeps.length}: ${dep.project_id}`);
        try {
          const deps = await installModrinth(dep.project_id, version, loader, instancePath, visited, undefined, true, onProgress, targetFolder);
          installedFiles = [...installedFiles, ...deps];
        } catch (e: any) {
          installedFiles.push({ name: dep.project_id, file: '', icon: undefined, error: e.message || String(e) });
        }
      }
    }

    const file = compatibleVersion.files.find((f: any) => f.primary) || compatibleVersion.files[0];
    const targetPath = await ensureFolderExists(instancePath, targetFolder);
    const filePath = await join(targetPath, file.filename);
    const fileExists = await invoke('file_exists', { path: filePath }) as boolean;
    if (fileExists && isDependency) return installedFiles;

    onProgress?.(`Downloading ${file.filename}...`);
    await invoke('download_file', { url: file.url, path: filePath });

    let icon = undefined;
    let name = file.filename;
    try {
      const projectData = await getModrinthProject(projectId);
      icon = projectData.icon_url;
      name = projectData.title;
    } catch (e) {}

    await saveInstalledMod({
      id: projectId, source: 'modrinth', versionId: compatibleVersion.id,
      version: compatibleVersion.version_number, file: file.filename,
      name, icon,
    });

    installedFiles.push({ name, file: file.filename, icon });
    return installedFiles;
  };

  const installCurseForge = async (
    modId: string, version: string, loader: string, instancePath: string,
    visited: Set<string> = new Set(), specificFileId?: number,
    isDependency = false, onProgress?: (msg: string) => void, targetFolder = 'mods',
  ): Promise<any[]> => {
    if (visited.has(modId)) return [];
    visited.add(modId);
    if (isDependency && installedMods.has(modId)) return [];

    const cacheKey = `curseforge:${modId}`;
    let data;
    if (versionCacheRef.current.has(cacheKey)) {
      data = { data: versionCacheRef.current.get(cacheKey)! };
    } else {
      data = await getCurseForgeModFiles(modId);
      versionCacheRef.current.set(cacheKey, data.data);
    }

    let compatibleFile;
    if (specificFileId) compatibleFile = data.data.find((f: any) => f.id === specificFileId);
    if (!compatibleFile) {
      compatibleFile = data.data.find((f: any) => {
        const hasVersion = f.gameVersions.includes(version);
        let hasLoader = true;
        if (loader) hasLoader = f.gameVersions.some((gv: string) => gv.toLowerCase() === loader.toLowerCase());
        return hasVersion && hasLoader;
      });
    }
    if (!compatibleFile) {
      const msg = `No compatible version found for ${isDependency ? 'dependency ' : ''}${modId}`;
      if (!isDependency) throw new Error(msg);
      return [{ name: modId, file: '', icon: undefined, error: msg }];
    }
    if (!compatibleFile.downloadUrl) {
      const msg = `Mod ${modId} has restricted distribution. Download manually from CurseForge.`;
      if (!isDependency) throw new Error(msg);
      return [{ name: modId, file: '', icon: undefined, error: msg }];
    }

    let installedFiles: any[] = [];
    if (compatibleFile.dependencies) {
      const requiredDeps = compatibleFile.dependencies.filter((d: any) => d.relationType === 3);
      for (let i = 0; i < requiredDeps.length; i++) {
        const dep = requiredDeps[i];
        onProgress?.(`Dependency ${i + 1}/${requiredDeps.length}: ${dep.modId}`);
        try {
          const deps = await installCurseForge(dep.modId.toString(), version, loader, instancePath, visited, undefined, true, onProgress, targetFolder);
          installedFiles = [...installedFiles, ...deps];
        } catch (e: any) {
          installedFiles.push({ name: dep.modId.toString(), file: '', icon: undefined, error: e.message || String(e) });
        }
      }
    }

    const targetPath = await ensureFolderExists(instancePath, targetFolder);
    const filePath = await join(targetPath, compatibleFile.fileName);
    const fileExists = await invoke('file_exists', { path: filePath }) as boolean;
    if (fileExists && isDependency) return installedFiles;

    onProgress?.(`Downloading ${compatibleFile.fileName}...`);
    await invoke('download_file', { url: compatibleFile.downloadUrl, path: filePath });

    let icon = undefined;
    let name = compatibleFile.displayName;
    try {
      const projectData = await getCurseForgeMod(modId);
      icon = projectData.data.logo?.url;
      name = projectData.data.name;
    } catch (e) {}

    await saveInstalledMod({
      id: modId, source: 'curseforge', versionId: compatibleFile.id.toString(),
      version: compatibleFile.displayName, file: compatibleFile.fileName,
      name, icon,
    });

    installedFiles.push({ name, file: compatibleFile.fileName, icon });
    return installedFiles;
  };

  const getTargetFolder = (searchType: string): string => {
    switch (searchType) {
      case 'shaders':
        return 'shaderpacks';
      case 'texture_packs':
        return 'resourcepacks';
      case 'mods':
      default:
        return 'mods';
    }
  };

  const ensureFolderExists = async (instancePath: string, folder: string): Promise<string> => {
    const folderPath = await join(instancePath, folder);
    const exists = await invoke('file_exists', { path: folderPath }) as boolean;
    if (!exists) {
      await invoke('create_dir', { path: folderPath });
    }
    return folderPath;
  };

  const handleInstall = async (item: any, selectedVersion?: any, options: { silent?: boolean; ignoreLock?: boolean } = {}) => {
    if (searchType === 'modpacks') {
      setSelectedModpack(selectedVersion ? { ...item, preSelectedVersion: selectedVersion } : item);
      setShowModpackModal(true);
      return;
    }
    if (!targetInstanceId || (!options.ignoreLock && installingModId)) return;
    setInstallingModId(item.id);

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      const targetFolder = getTargetFolder(searchType);
      const targetPath = await ensureFolderExists(instancePath, targetFolder);

      let installed = installedMods.get(item.id);
      if (!installed && item.original?.slug) installed = installedSlugs.get(item.original.slug.toLowerCase());

      if (installed) {
        const oldFilePath = await join(targetPath, installed.file);
        const exists = await invoke('file_exists', { path: oldFilePath }) as boolean;
        if (exists) await invoke('delete_file', { path: oldFilePath });
      }

      let installedFiles: any[] = [];
      const progressCb = (msg: string) => setVerificationStatus(msg);
      if (item.source === 'modrinth') {
        installedFiles = await installModrinth(item.id, filterVersion, filterLoader, instancePath, new Set(), selectedVersion?.id, false, progressCb, targetFolder);
      } else if (item.source === 'curseforge') {
        installedFiles = await installCurseForge(item.id, filterVersion, filterLoader, instancePath, new Set(), selectedVersion?.id, false, progressCb, targetFolder);
      }

      setInstalledModName(item.name);
      const failedDeps = installedFiles.filter(f => f.error);
      const successDeps = installedFiles.filter(f => !f.error).slice(0, -1);
      setInstalledDependencies(successDeps);

      if ((successDeps.length > 0 || failedDeps.length > 0) && !options.silent) {
        if (failedDeps.length > 0) setInstalledDependencies([...successDeps, ...failedDeps]);
        setShowSuccessModal(true);
      }
    } catch (error: any) {
      console.error("Failed to install mod:", error);
      if (!options.silent) {
        setInstalledModName(item.name);
        setInstalledDependencies([{ name: 'Error', file: error.message || String(error), icon: undefined, error: true }]);
        setShowSuccessModal(true);
      }
    } finally {
      setInstallingModId(null);
      setVerificationStatus('');
      versionCacheRef.current.clear();
    }
  };

  const handleUninstall = async (item: any) => {
    if (!targetInstanceId) return;
    const confirmed = await showConfirmAsync({
      title: '¿Desinstalar mod?',
      message: `¿Estás seguro de que quieres desinstalar "${item.name}"? El archivo .jar será eliminado.`,
      confirmText: 'Desinstalar', danger: true,
    });
    if (!confirmed) return;

    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      const installed = installedMods.get(item.id) || installedSlugs.get(item.original?.slug?.toLowerCase());

      if (installed?.file) {
        const filePath = await join(instancePath, 'mods', installed.file);
        const exists = await invoke('file_exists', { path: filePath }) as boolean;
        if (exists) await invoke('delete_file', { path: filePath });
        const disabledPath = filePath + '.disabled';
        const disabledExists = await invoke('file_exists', { path: disabledPath }) as boolean;
        if (disabledExists) await invoke('delete_file', { path: disabledPath });
      }

      const modsJsonPath = await join(instancePath, 'mods.json');
      const modsJsonExists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
      if (modsJsonExists) {
        const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
        const data = JSON.parse(content);
        if (data.mods && Array.isArray(data.mods)) {
          data.mods = data.mods.filter((m: any) => m.id !== item.id);
          await invoke('write_text_file', { path: modsJsonPath, content: JSON.stringify(data, null, 2) });
        }
      }

      setInstalledMods(prev => { const m = new Map(prev); m.delete(item.id); return m; });
      if (item.original?.slug) {
        setInstalledSlugs(prev => { const m = new Map(prev); m.delete(item.original.slug.toLowerCase()); return m; });
      }
      setUpdatesAvailable(prev => { const m = new Map(prev); m.delete(item.id); return m; });
    } catch (e) {
      console.error("Failed to uninstall mod:", e);
    }
  };

  const handleToggleMod = async (item: any) => {
    if (!targetInstanceId) return;
    try {
      const instancePath = await invoke('get_instance_path', { id: targetInstanceId }) as string;
      const installed = installedMods.get(item.id) || installedSlugs.get(item.original?.slug?.toLowerCase());
      if (!installed?.file) return;

      const modsDir = await join(instancePath, 'mods');
      const currentFile = installed.file;
      const isDisabled = currentFile.endsWith('.disabled');
      const newFile = isDisabled ? currentFile.replace(/\.disabled$/, '') : currentFile + '.disabled';
      const currentPath = await join(modsDir, currentFile);
      const newPath = await join(modsDir, newFile);

      await invoke('move_file', { source: currentPath, target: newPath });

      const modsJsonPath = await join(instancePath, 'mods.json');
      const modsJsonExists = await invoke('file_exists', { path: modsJsonPath }) as boolean;
      if (modsJsonExists) {
        const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
        const data = JSON.parse(content);
        if (data.mods && Array.isArray(data.mods)) {
          const mod = data.mods.find((m: any) => m.id === item.id);
          if (mod) {
            mod.file = newFile;
            await invoke('write_text_file', { path: modsJsonPath, content: JSON.stringify(data, null, 2) });
          }
        }
      }

      setInstalledMods(prev => {
        const m = new Map(prev);
        const mod = m.get(item.id);
        if (mod) m.set(item.id, { ...mod, file: newFile });
        return m;
      });
    } catch (e) {
      console.error("Failed to toggle mod:", e);
    }
  };

  return {
    installingModId,
    verificationStatus, setVerificationStatus,
    showSuccessModal, setShowSuccessModal,
    installedModName, setInstalledModName,
    installedDependencies, setInstalledDependencies,
    selectedModpack, setSelectedModpack,
    showModpackModal, setShowModpackModal,
    versionCacheRef,
    handleInstall,
    handleUninstall,
    handleToggleMod,
    installModrinth,
    installCurseForge,
  };
}
