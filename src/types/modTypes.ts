export type ModSource = 'modrinth' | 'curseforge' | 'porcos' | 'local';
export type SearchType = 'mods' | 'modpacks' | 'shaders' | 'texture_packs' | 'updates';

export interface InstalledMod {
  id: string;
  file: string;
  version?: string;
  versionId?: string;
  source: ModSource;
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
}

export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  changelog?: string;
}

export interface DependencyInfo {
  id: string;
  source: ModSource;
  name: string;
  icon?: string;
  type: 'required' | 'optional';
}

export interface ModVersion {
  id: string;
  name: string;
  type: 'release' | 'beta' | 'alpha';
  gameVersions: string[];
  loaders: string[];
  date: string;
  changelog?: string;
  downloads: number;
  original: any;
}

export interface ModDetails {
  id: string;
  name: string;
  description: string;
  body?: string;
  downloads: string;
  author: string;
  icon?: string;
  gallery: string[];
  source: ModSource;
  versions: ModVersion[];
  categories: string[];
  original?: any;
}

export const SOURCE_CONFIG = {
  modrinth: {
    color: '#1bd96a',
    bgColor: 'rgba(27, 217, 106, 0.15)',
    label: 'Modrinth',
    icon: 'M',
  },
  curseforge: {
    color: '#f16436',
    bgColor: 'rgba(241, 100, 54, 0.15)',
    label: 'CurseForge',
    icon: 'CF',
  },
  porcos: {
    color: '#ffbfba',
    bgColor: 'rgba(255, 191, 186, 0.15)',
    label: 'Porcos',
    icon: 'P',
  },
  local: {
    color: '#a1a1aa',
    bgColor: 'rgba(161, 161, 170, 0.15)',
    label: 'Local',
    icon: 'L',
  },
} as const;

export const LOADER_CONFIG = {
  forge: { label: 'Forge', color: '#a86428' },
  fabric: { label: 'Fabric', color: '#db94f7' },
  quilt: { label: 'Quilt', color: '#6dafc4' },
  neoforge: { label: 'NeoForge', color: '#e68a00' },
} as const;

export function getSourceConfig(source: ModSource) {
  return SOURCE_CONFIG[source] || SOURCE_CONFIG.local;
}

export function getLoaderConfig(loader: string) {
  const key = loader.toLowerCase() as keyof typeof LOADER_CONFIG;
  return LOADER_CONFIG[key] || { label: loader, color: '#a1a1aa' };
}