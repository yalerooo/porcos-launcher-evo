import { useState, useEffect, useRef } from 'react';
import {
  searchModrinth as apiSearchModrinth,
  searchCurseForge as apiSearchCurseForge,
  fetchPorcosModpacks as apiFetchPorcos,
  getModrinthProjects,
  getCurseForgeModsBatch,
  getLoaderTypeId,
} from '@/lib/modApiService';

type ModSource = 'modrinth' | 'curseforge' | 'porcos';
type SearchType = 'mods' | 'modpacks' | 'updates';

interface InstalledMod {
  file: string;
  version?: string;
  source?: string;
  versionId?: string;
}

const CATEGORIES = [
  { id: "adventure", nameKey: "catAdventure", cfId: 406 },
  { id: "decoration", nameKey: "catDecoration", cfId: 420 },
  { id: "equipment", nameKey: "catEquipment", cfId: 434 },
  { id: "food", nameKey: "catFood", cfId: 411 },
  { id: "game-mechanics", nameKey: "catGameMechanics", cfId: 416 },
  { id: "library", nameKey: "catLibrary", cfId: 421 },
  { id: "magic", nameKey: "catMagic", cfId: 419 },
  { id: "management", nameKey: "catManagement", cfId: 408 },
  { id: "minigame", nameKey: "catMinigame", cfId: 430 },
  { id: "mobs", nameKey: "catMobs", cfId: 414 },
  { id: "optimization", nameKey: "catOptimization", cfId: 427 },
  { id: "social", nameKey: "catSocial", cfId: 428 },
  { id: "storage", nameKey: "catStorage", cfId: 423 },
  { id: "technology", nameKey: "catTechnology", cfId: 412 },
  { id: "transportation", nameKey: "catTransportation", cfId: 415 },
  { id: "utility", nameKey: "catUtility", cfId: 426 },
  { id: "world-generation", nameKey: "catWorldGeneration", cfId: 409 },
];

export { CATEGORIES };
export type { ModSource, SearchType, InstalledMod };

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export function useModSearch({
  activeSource,
  searchType,
  searchQuery,
  filterVersion,
  filterLoader,
  filterCategory,
  page,
  installingModId,
  installedMods,
}: {
  activeSource: ModSource;
  searchType: SearchType;
  searchQuery: string;
  filterVersion: string;
  filterLoader: string;
  filterCategory: string;
  page: number;
  installingModId: string | null;
  installedMods: Map<string, InstalledMod>;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalHits, setTotalHits] = useState(0);
  const currentDataRequestId = useRef(0);
  const lastInstalledModsSize = useRef(-1);

  const searchModrinth = async (query: string, pageIndex: number) => {
    const requestId = ++currentDataRequestId.current;
    try {
      const facets: string[][] = [];
      facets.push(searchType === 'modpacks' ? ["project_type:modpack"] : ["project_type:mod"]);
      if (filterVersion) facets.push([`versions:${filterVersion}`]);
      if (filterLoader) facets.push([`categories:${filterLoader}`]);
      if (filterCategory) facets.push([`categories:${filterCategory}`]);

      const data = await apiSearchModrinth(query, facets, pageIndex * 20);
      if (currentDataRequestId.current !== requestId) return;

      setTotalHits(data.total_hits);
      setItems(data.hits.map((hit: any) => ({
        id: hit.project_id,
        name: hit.title,
        description: hit.description,
        downloads: formatNumber(hit.downloads),
        author: hit.author,
        icon: hit.icon_url,
        source: 'modrinth',
        original: hit,
      })));
    } catch (error) {
      console.error("Failed to search Modrinth:", error);
      if (currentDataRequestId.current === requestId) setItems([]);
    } finally {
      if (currentDataRequestId.current === requestId) setIsLoading(false);
    }
  };

  const searchCurseForge = async (query: string, pageIndex: number) => {
    const requestId = ++currentDataRequestId.current;
    try {
      const classId = searchType === 'modpacks' ? 4471 : 6;
      const cat = filterCategory ? CATEGORIES.find(c => c.id === filterCategory) : null;

      const data = await apiSearchCurseForge(query, classId, {
        gameVersion: filterVersion || undefined,
        modLoaderType: filterLoader ? getLoaderTypeId(filterLoader) : undefined,
        categoryId: cat?.cfId,
        index: pageIndex * 20,
      });
      if (currentDataRequestId.current !== requestId) return;

      setTotalHits(data.pagination.totalCount);
      setItems(data.data.map((mod: any) => ({
        id: mod.id.toString(),
        name: mod.name,
        description: mod.summary,
        downloads: formatNumber(mod.downloadCount),
        author: mod.authors[0]?.name || 'Unknown',
        icon: mod.logo?.url || 'https://www.curseforge.com/images/logo-curseforge.png',
        source: 'curseforge',
        original: mod,
      })));
    } catch (error) {
      console.error("Failed to search CurseForge:", error);
      if (currentDataRequestId.current === requestId) setItems([]);
    } finally {
      if (currentDataRequestId.current === requestId) setIsLoading(false);
    }
  };

  const fetchPorcosModpacks = async () => {
    const requestId = ++currentDataRequestId.current;
    try {
      const data = await apiFetchPorcos();
      if (currentDataRequestId.current !== requestId) return;

      const grouped = new Map();
      if (data.modpacks && Array.isArray(data.modpacks)) {
        data.modpacks.forEach((mp: any) => {
          if (!grouped.has(mp.id)) {
            grouped.set(mp.id, {
              id: mp.id, name: mp.name, description: mp.description,
              author: "Porcos Team", icon: mp.icon, source: 'porcos', versions: [],
            });
          }
          grouped.get(mp.id).versions.push(mp);
        });
      }

      const allItems = Array.from(grouped.values()).map((g: any) => {
        const sortedVersions = g.versions.sort((a: any, b: any) =>
          b.version.localeCompare(a.version, undefined, { numeric: true })
        );
        return { ...g, icon: sortedVersions[0]?.icon || g.icon, downloads: "N/A", versions: sortedVersions };
      });

      const filtered = allItems.filter(item => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!item.name.toLowerCase().includes(q) && !item.description?.toLowerCase().includes(q)) return false;
        }
        if (!filterVersion && !filterLoader) return true;
        return item.versions.some((v: any) => {
          const versionMatch = !filterVersion || v.minecraftVersion === filterVersion;
          let loaderMatch = !filterLoader;
          if (filterLoader) {
            const l = filterLoader.toLowerCase();
            const vLoader = v.modLoader?.toLowerCase();
            if (vLoader === l) loaderMatch = true;
            else if (l === 'forge' && (v.forgeVersion || vLoader === 'forge')) loaderMatch = true;
            else if (l === 'fabric' && (v.fabricVersion || vLoader === 'fabric')) loaderMatch = true;
            else if (l === 'quilt' && (v.quiltVersion || vLoader === 'quilt')) loaderMatch = true;
            else if (l === 'neoforge' && (v.neoForgeVersion || vLoader === 'neoforge')) loaderMatch = true;
          }
          return versionMatch && loaderMatch;
        });
      });

      setItems(filtered);
    } catch (error) {
      console.error("Failed to fetch Porcos modpacks:", error);
      if (currentDataRequestId.current === requestId) setItems([]);
    } finally {
      if (currentDataRequestId.current === requestId) setIsLoading(false);
    }
  };

  const loadAllInstalledModsDetails = async () => {
    const requestId = ++currentDataRequestId.current;
    setIsLoading(true);
    setItems([]);

    try {
      const modrinthIds: string[] = [];
      const curseforgeIds: number[] = [];
      installedMods.forEach((mod, id) => {
        if (mod.source === 'modrinth') modrinthIds.push(id);
        else if (mod.source === 'curseforge') curseforgeIds.push(parseInt(id));
        else if (/^\d+$/.test(id)) curseforgeIds.push(parseInt(id));
        else modrinthIds.push(id);
      });

      let allItems: any[] = [];

      // Modrinth batch
      for (let i = 0; i < modrinthIds.length; i += 20) {
        if (currentDataRequestId.current !== requestId) return;
        const chunk = modrinthIds.slice(i, i + 20);
        try {
          const data = await getModrinthProjects(chunk);
          allItems.push(...data.map((hit: any) => ({
            id: hit.id, name: hit.title, description: hit.description,
            downloads: formatNumber(hit.downloads), author: "Unknown",
            icon: hit.icon_url, source: 'modrinth', original: hit,
          })));
        } catch (e) { console.error("Failed to fetch Modrinth chunk", e); }
      }

      // CurseForge batch POST
      for (let i = 0; i < curseforgeIds.length; i += 50) {
        if (currentDataRequestId.current !== requestId) return;
        const chunk = curseforgeIds.slice(i, i + 50);
        try {
          const data = await getCurseForgeModsBatch(chunk);
          if (data.data) {
            allItems.push(...data.data.map((mod: any) => ({
              id: mod.id.toString(), name: mod.name, description: mod.summary,
              downloads: formatNumber(mod.downloadCount),
              author: mod.authors?.[0]?.name || 'Unknown',
              icon: mod.logo?.url || 'https://www.curseforge.com/images/logo-curseforge.png',
              source: 'curseforge', original: mod,
            })));
          }
        } catch (e) { console.error("Failed to fetch CurseForge batch", e); }
      }

      if (currentDataRequestId.current === requestId) {
        const unique = Array.from(new Map(allItems.map(item => [item.id, item])).values());
        setItems(unique);
      }
    } catch (e) {
      console.error("Failed to load installed details", e);
      if (currentDataRequestId.current === requestId) setItems([]);
    } finally {
      if (currentDataRequestId.current === requestId) setIsLoading(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    if (installingModId) return;
    if (searchType === 'updates') return;

    setIsLoading(true);
    const timer = setTimeout(() => {
      if (activeSource === 'modrinth') searchModrinth(searchQuery, page);
      else if (activeSource === 'curseforge') searchCurseForge(searchQuery, page);
      else if (activeSource === 'porcos') fetchPorcosModpacks();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, activeSource, searchType, filterVersion, filterLoader, filterCategory, page]);

  // Updates tab — reload when switching to updates or when installedMods changes meaningfully
  useEffect(() => {
    if (searchType === 'updates' && !installingModId) {
      const currentSize = installedMods.size;
      if (currentSize > 0) {
        // Always reload when switching TO updates tab, or when mods count changes
        if (currentSize !== lastInstalledModsSize.current || items.length === 0 || items[0]?.source === undefined) {
          lastInstalledModsSize.current = currentSize;
          loadAllInstalledModsDetails();
        }
      }
    } else {
      // Reset when leaving updates tab so next entry reloads
      lastInstalledModsSize.current = -1;
    }
  }, [searchType, installedMods]);

  return { items, setItems, isLoading, totalHits, loadAllInstalledModsDetails };
}
