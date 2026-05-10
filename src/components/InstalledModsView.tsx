import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import ModCard from './ModCard';
import ModsFilterBar, { type FilterState } from './ModsFilterBar';
import UpdatesPanel from './UpdatesPanel';
import { useModsStore } from '@/stores/modsStore';
import { type ModSource } from '@/types/modTypes';
import styles from './InstalledModsView.module.css';

interface InstalledModInfo {
  id: string;
  name: string;
  file: string;
  version?: string;
  source: ModSource;
  versionId?: string;
  icon?: string;
}

interface InstalledModsViewProps {
  onSelectMod: (mod: any) => void;
}

const InstalledModsView: React.FC<InstalledModsViewProps> = memo(({ onSelectMod }) => {
  const {
    instancePath,
    installedMods,
    installedSlugs,
    isLoadingInstalled,
    verifyDependencies,
    isVerifyingDeps,
    verificationStatus,
  } = useModsStore();

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    source: 'all',
    status: 'all',
    update: 'all',
  });

  const [updateItems, setUpdateItems] = useState<Map<string, {
    id: string;
    name: string;
    icon?: string;
    source: ModSource;
    currentVersion: string;
    newVersion: string;
    changelog?: string;
    isUpdating?: boolean;
    isUpdated?: boolean;
  }>>(new Map());

  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  // Merge installedMods and installedSlugs into a single list
  const installedModsList = useMemo(() => {
    const result: InstalledModInfo[] = [];
    const seen = new Set<string>();

    // First add from installedMods
    installedMods.forEach((mod, id) => {
      if (!seen.has(id)) {
        seen.add(id);
        result.push({
          id,
          name: mod.name || id,
          file: mod.file,
          version: mod.version,
          source: mod.source as ModSource,
          versionId: mod.versionId,
          icon: mod.icon,
        });
      }
    });

    // Then add from installedSlugs for untracked mods
    installedSlugs.forEach((mod, slug) => {
      if (!seen.has(slug) && !seen.has(slug.toLowerCase())) {
        seen.add(slug);
        seen.add(slug.toLowerCase());
        result.push({
          id: slug,
          name: mod.name || slug,
          file: mod.file,
          version: mod.version,
          source: 'local' as ModSource,
          icon: mod.icon,
        });
      }
    });

    return result;
  }, [installedMods, installedSlugs]);

  // Filter mods
  const filteredMods = useMemo(() => {
    return installedModsList.filter(mod => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!mod.name.toLowerCase().includes(searchLower) &&
            !mod.file.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Source filter
      if (filters.source !== 'all' && mod.source !== filters.source) {
        return false;
      }

      // Status filter
      if (filters.status === 'enabled') {
        return !mod.file.endsWith('.disabled');
      } else if (filters.status === 'disabled') {
        return mod.file.endsWith('.disabled');
      }

      return true;
    });
  }, [installedModsList, filters]);

  // Calculate counts
  const counts = useMemo(() => {
    const total = installedModsList.length;
    const enabled = installedModsList.filter(m => !m.file.endsWith('.disabled')).length;
    const disabled = total - enabled;
    const updates = updateItems.size;

    return { total, enabled, disabled, updates };
  }, [installedModsList, updateItems]);

  // Load mod details (name, icon) for installed mods
  const loadModDetails = useCallback(async () => {
    if (installedModsList.length === 0) return;

    const modsWithoutDetails = installedModsList.filter(m => !m.name || m.name === m.id || !m.icon);
    if (modsWithoutDetails.length === 0) return;

    // Load details for Modrinth and CurseForge mods
    const modrinthIds: string[] = [];
    const curseforgeIds: number[] = [];

    modsWithoutDetails.forEach(mod => {
      if (mod.source === 'modrinth') modrinthIds.push(mod.id);
      else if (mod.source === 'curseforge') curseforgeIds.push(parseInt(mod.id));
      else if (/^\d+$/.test(mod.id)) curseforgeIds.push(parseInt(mod.id));
    });

    // Fetch Modrinth details
    for (let i = 0; i < modrinthIds.length; i += 20) {
      const chunk = modrinthIds.slice(i, i + 20);
      try {
        const { getModrinthProjects } = await import('@/lib/modApiService');
        await getModrinthProjects(chunk);
      } catch (e) {}
    }
  }, [installedModsList]);

  useEffect(() => {
    loadModDetails();
  }, [loadModDetails]);

  const handleVerifyDependencies = async () => {
    try {
      await verifyDependencies();
    } catch (e) {
      console.error('Verification failed:', e);
    }
  };

  const handleUpdate = (id: string) => {
    // Placeholder - would trigger update flow
    console.log('Update mod:', id);
  };

  const handleUpdateAll = () => {
    setIsUpdatingAll(true);
    updateItems.forEach((_, id) => {
      handleUpdate(id);
    });
    setTimeout(() => setIsUpdatingAll(false), 1000);
  };

  const handleDismissUpdate = (id: string) => {
    const newUpdates = new Map(updateItems);
    newUpdates.delete(id);
    setUpdateItems(newUpdates);
  };

  const handleInstall = (mod: InstalledModInfo) => {
    onSelectMod({
      id: mod.id,
      name: mod.name,
      source: mod.source,
      original: { slug: mod.id },
    });
  };

  const handleUninstall = async (mod: InstalledModInfo) => {
    if (!instancePath) return;

    const modPath = await join(instancePath, 'mods', mod.file);
    try {
      await invoke('delete_file', { path: modPath });

      // Update mods.json
      const modsJsonPath = await join(instancePath, 'mods.json');
      const content = await invoke('read_text_file', { path: modsJsonPath }) as string;
      const data = JSON.parse(content);
      data.mods = data.mods.filter((m: any) => m.id !== mod.id && m.file !== mod.file);
      await invoke('write_text_file', {
        path: modsJsonPath,
        content: JSON.stringify(data, null, 2),
      });

      // Reload
      const { loadInstalledMods } = useModsStore.getState();
      await loadInstalledMods();
    } catch (e) {
      console.error('Failed to uninstall mod:', e);
    }
  };

  const handleToggle = async (mod: InstalledModInfo) => {
    if (!instancePath) return;

    const modsDir = await join(instancePath, 'mods');
    const currentFile = mod.file;
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

      // Reload
      const { loadInstalledMods } = useModsStore.getState();
      await loadInstalledMods();
    } catch (e) {
      console.error('Failed to toggle mod:', e);
    }
  };

  if (isLoadingInstalled) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className="animate-spin" size={40} />
        <p>Cargando mods instalados...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Updates Panel */}
      {updateItems.size > 0 && (
        <UpdatesPanel
          updates={updateItems}
          onUpdate={handleUpdate}
          onUpdateAll={handleUpdateAll}
          onDismiss={handleDismissUpdate}
          isUpdatingAll={isUpdatingAll}
          totalUpdates={updateItems.size}
        />
      )}

      {/* Filter Bar */}
      <ModsFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        counts={counts}
      />

      {/* Mods List */}
      <div className={styles.modsList}>
        {filteredMods.length > 0 ? (
          filteredMods.map(mod => {
            const isEnabled = !mod.file.endsWith('.disabled');
            const updateInfo = updateItems.get(mod.id);

            return (
              <ModCard
                key={mod.id}
                id={mod.id}
                name={mod.name || mod.id}
                description={`Archivo: ${mod.file}`}
                author="Local"
                icon={mod.icon}
                downloads={undefined}
                source={mod.source}
                version={mod.version}
                hasUpdate={!!updateInfo}
                updateInfo={updateInfo ? {
                  currentVersion: updateInfo.currentVersion,
                  newVersion: updateInfo.newVersion,
                } : undefined}
                isInstalled={true}
                isEnabled={isEnabled}
                onSelect={() => handleInstall(mod)}
                onInstall={() => handleInstall(mod)}
                onUninstall={() => handleUninstall(mod)}
                onToggle={() => handleToggle(mod)}
              />
            );
          })
        ) : (
          <div className={styles.emptyState}>
            {installedModsList.length === 0 ? (
              <>
                <p className={styles.emptyTitle}>No hay mods instalados</p>
                <p className={styles.emptySubtitle}>
                  Instala mods desde la pestaña "Examinar"
                </p>
              </>
            ) : filters.search || filters.source !== 'all' || filters.status !== 'all' ? (
              <>
                <p className={styles.emptyTitle}>No se encontraron mods</p>
                <p className={styles.emptySubtitle}>
                  Prueba con otros filtros
                </p>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Actions Bar */}
      <div className={styles.actionsBar}>
        <button
          onClick={handleVerifyDependencies}
          disabled={isVerifyingDeps}
          className={styles.verifyButton}
        >
          {isVerifyingDeps ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {verificationStatus || 'Verificando...'}
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Verificar dependencias
            </>
          )}
        </button>
      </div>
    </div>
  );
});

InstalledModsView.displayName = 'InstalledModsView';

export default InstalledModsView;