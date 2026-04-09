import { invoke } from '@tauri-apps/api/core';
import { CURSEFORGE_HEADERS } from './constants';

// ─── Types ─────────────────────────────────────────────────────

export interface ModrinthSearchResult {
  hits: Array<{
    project_id: string;
    title: string;
    description: string;
    downloads: number;
    author: string;
    icon_url: string;
    slug: string;
    [key: string]: any;
  }>;
  total_hits: number;
}

export interface CurseForgeSearchResult {
  data: Array<{
    id: number;
    name: string;
    summary: string;
    downloadCount: number;
    authors: Array<{ name: string }>;
    logo?: { url: string };
    slug: string;
    [key: string]: any;
  }>;
  pagination: { totalCount: number };
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{ url: string; filename: string; primary: boolean; hashes: { sha1: string } }>;
  dependencies: Array<{ project_id: string; dependency_type: string; version_id?: string }>;
  [key: string]: any;
}

export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  gameVersions: string[];
  dependencies: Array<{ modId: number; relationType: number }>;
  [key: string]: any;
}

// ─── Helpers ───────────────────────────────────────────────────

async function fetchJson<T>(url: string, options?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<T> {
  const responseText = await invoke('fetch_cors', {
    url,
    ...(options?.method && { method: options.method }),
    ...(options?.body && { body: options.body }),
    ...(options?.headers && { headers: options.headers }),
  }) as string;
  return JSON.parse(responseText);
}

// ─── Modrinth API ──────────────────────────────────────────────

export async function searchModrinth(
  query: string,
  facets: string[][],
  offset: number = 0,
  limit: number = 20,
): Promise<ModrinthSearchResult> {
  const facetString = JSON.stringify(facets);
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facetString)}&limit=${limit}&offset=${offset}`;
  return fetchJson(url);
}

export async function getModrinthProject(projectId: string): Promise<any> {
  return fetchJson(`https://api.modrinth.com/v2/project/${projectId}`);
}

export async function getModrinthProjects(ids: string[]): Promise<any[]> {
  const url = `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`;
  return fetchJson(url);
}

export async function getModrinthVersions(projectId: string): Promise<ModrinthVersion[]> {
  return fetchJson(`https://api.modrinth.com/v2/project/${projectId}/version`);
}

export async function getModrinthFilteredVersions(
  projectId: string,
  loaders: string[],
  gameVersions: string[],
): Promise<ModrinthVersion[]> {
  const url = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify(loaders))}&game_versions=${encodeURIComponent(JSON.stringify(gameVersions))}`;
  return fetchJson(url);
}

export async function getModrinthVersionsByIds(ids: string[]): Promise<ModrinthVersion[]> {
  const url = `https://api.modrinth.com/v2/versions?ids=${encodeURIComponent(JSON.stringify(ids))}`;
  return fetchJson(url);
}

export async function resolveModrinthHashes(hashes: string[]): Promise<Record<string, any>> {
  return fetchJson('https://api.modrinth.com/v2/version_files', {
    method: 'POST',
    body: JSON.stringify({ hashes, algorithm: 'sha1' }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── CurseForge API ────────────────────────────────────────────

export async function searchCurseForge(
  query: string,
  classId: number,
  options: {
    gameVersion?: string;
    modLoaderType?: number;
    categoryId?: number;
    sortField?: number;
    sortOrder?: string;
    pageSize?: number;
    index?: number;
  } = {},
): Promise<CurseForgeSearchResult> {
  let url = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=${classId}&searchFilter=${encodeURIComponent(query)}&sortField=${options.sortField ?? 2}&sortOrder=${options.sortOrder ?? 'desc'}&pageSize=${options.pageSize ?? 20}&index=${options.index ?? 0}`;

  if (options.gameVersion) url += `&gameVersion=${encodeURIComponent(options.gameVersion)}`;
  if (options.modLoaderType && options.modLoaderType > 0) url += `&modLoaderType=${options.modLoaderType}`;
  if (options.categoryId) url += `&categoryId=${options.categoryId}`;

  return fetchJson(url, { headers: CURSEFORGE_HEADERS });
}

export async function getCurseForgeModFiles(modId: string, gameVersion?: string): Promise<{ data: CurseForgeFile[] }> {
  let url = `https://api.curseforge.com/v1/mods/${modId}/files`;
  if (gameVersion) url += `?gameVersion=${encodeURIComponent(gameVersion)}`;
  return fetchJson(url, { headers: CURSEFORGE_HEADERS });
}

export async function getCurseForgeFile(modId: string, fileId: string): Promise<{ data: CurseForgeFile }> {
  return fetchJson(`https://api.curseforge.com/v1/mods/${modId}/files/${fileId}`, { headers: CURSEFORGE_HEADERS });
}

export async function getCurseForgeMod(modId: string): Promise<{ data: any }> {
  return fetchJson(`https://api.curseforge.com/v1/mods/${modId}`, { headers: CURSEFORGE_HEADERS });
}

export async function getCurseForgeModsBatch(modIds: number[]): Promise<{ data: any[] }> {
  return fetchJson('https://api.curseforge.com/v1/mods', {
    method: 'POST',
    body: JSON.stringify({ modIds }),
    headers: { ...CURSEFORGE_HEADERS, 'Content-Type': 'application/json' },
  });
}

export async function resolveCurseForgeFingerprints(fingerprints: number[]): Promise<{ data: { exactMatches: any[] } }> {
  return fetchJson('https://api.curseforge.com/v1/fingerprints', {
    method: 'POST',
    body: JSON.stringify({ fingerprints }),
    headers: { ...CURSEFORGE_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── Porcos API ────────────────────────────────────────────────

export async function fetchPorcosModpacks(): Promise<any> {
  const url = 'https://raw.githubusercontent.com/yalerooo/myApis/refs/heads/main/porcosLauncher/modpacks.json';
  return fetchJson(url);
}

// ─── Loader Helpers ────────────────────────────────────────────

export function getLoaderTypeId(loader: string): number {
  switch (loader.toLowerCase()) {
    case 'forge': return 1;
    case 'fabric': return 4;
    case 'quilt': return 5;
    case 'neoforge': return 6;
    default: return 0;
  }
}

export function getExpandedLoaders(loader: string): string[] {
  const l = loader.toLowerCase();
  const loaders = [l];
  if (l === 'quilt') loaders.push('fabric');
  if (l === 'neoforge') loaders.push('forge');
  return loaders;
}
