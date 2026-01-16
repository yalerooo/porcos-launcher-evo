import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { exit } from '@tauri-apps/plugin-process';
import { join, appCacheDir } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';

const UPDATE_JSON_URL = "https://raw.githubusercontent.com/yalerooo/myApis/refs/heads/main/porcosLauncher/updatesporcoslauncher.json";

// Enable window dragging
const appWindow = getCurrentWindow();
document.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  // Don't drag if clicking on buttons or interactive elements
  if (target.closest('button') || target.closest('input') || target.closest('a')) {
    return;
  }
  appWindow.startDragging();
});

interface UpdateData {
  version: string;
  date: string;
  downloadUrl: string;
  notes?: string;
}

// Get system language
function getSystemLanguage(): 'en' | 'es' {
  const lang = navigator.language.toLowerCase();
  return lang.startsWith('es') ? 'es' : 'en';
}

// Translations
const translations = {
  en: {
    starting: 'Starting...',
    checkingUpdates: 'Checking for updates...',
    loadingResources: 'Loading resources...',
    updateTitle: 'New version available!',
    updateSubtitle: 'An update is ready to install',
    currentLabel: 'Current',
    newLabel: 'New',
    skip: 'Skip',
    update: 'Update',
    downloading: 'Downloading update...',
    downloadInfo: 'Will restart automatically when complete',
    installing: 'Installing...',
  },
  es: {
    starting: 'Iniciando...',
    checkingUpdates: 'Buscando actualizaciones...',
    loadingResources: 'Cargando recursos...',
    updateTitle: '¡Nueva versión disponible!',
    updateSubtitle: 'Una actualización está lista para instalar',
    currentLabel: 'Actual',
    newLabel: 'Nueva',
    skip: 'Omitir',
    update: 'Actualizar',
    downloading: 'Descargando actualización...',
    downloadInfo: 'Se reiniciará automáticamente al completar',
    installing: 'Instalando...',
  }
};

const lang = getSystemLanguage();
const t = translations[lang];

const compareVersions = (v1: string, v2: string): number => {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
};

// DOM Elements
const statusText = document.getElementById('statusText') as HTMLElement;
const loaderSection = document.getElementById('loaderSection') as HTMLElement;
const updateSection = document.getElementById('updateSection') as HTMLElement;
const downloadSection = document.getElementById('downloadSection') as HTMLElement;
const splashContainer = document.getElementById('splashContainer') as HTMLElement;
const currentVersionEl = document.getElementById('currentVersion') as HTMLElement;
const newVersionEl = document.getElementById('newVersion') as HTMLElement;
const updateNotes = document.getElementById('updateNotes') as HTMLElement;
const skipBtn = document.getElementById('skipBtn') as HTMLButtonElement;
const updateBtn = document.getElementById('updateBtn') as HTMLButtonElement;
const downloadPercent = document.getElementById('downloadPercent') as HTMLElement;
const downloadProgress = document.getElementById('downloadProgress') as HTMLElement;
const downloadText = document.getElementById('downloadText') as HTMLElement;
const downloadInfo = document.getElementById('downloadInfo') as HTMLElement;

// Translate UI
function translateUI() {
  statusText.textContent = t.starting;
  (document.getElementById('updateTitle') as HTMLElement).textContent = t.updateTitle;
  (document.getElementById('updateSubtitle') as HTMLElement).textContent = t.updateSubtitle;
  (document.getElementById('currentLabel') as HTMLElement).textContent = t.currentLabel;
  (document.getElementById('newLabel') as HTMLElement).textContent = t.newLabel;
  skipBtn.textContent = t.skip;
  (document.getElementById('updateBtnText') as HTMLElement).textContent = t.update;
  downloadText.textContent = t.downloading;
  downloadInfo.textContent = t.downloadInfo;
}

let updateData: UpdateData | null = null;

async function checkForUpdates(): Promise<boolean> {
  try {
    statusText.textContent = t.checkingUpdates;
    
    const currentVersion = await getVersion();
    const urlWithTimestamp = `${UPDATE_JSON_URL}?t=${Date.now()}`;
    const responseText = await invoke('fetch_cors', { url: urlWithTimestamp }) as string;
    const data: UpdateData = JSON.parse(responseText);
    
    if (data.version && compareVersions(data.version, currentVersion) > 0) {
      updateData = data;
      
      // Show update UI
      splashContainer.classList.add('expanded');
      loaderSection.style.display = 'none';
      updateSection.classList.add('visible');
      
      currentVersionEl.textContent = currentVersion;
      newVersionEl.textContent = data.version;
      
      if (data.notes) {
        updateNotes.textContent = data.notes;
        updateNotes.style.display = 'block';
      }
      
      return true;
    }
  } catch (e) {
    console.error('Failed to check for updates:', e);
  }
  
  return false;
}

async function downloadUpdate() {
  if (!updateData) return;
  
  updateSection.classList.remove('visible');
  downloadSection.classList.add('visible');
  
  const downloadId = 'update-download';
  let unlisten: (() => void) | undefined;
  
  try {
    const cacheDir = await appCacheDir();
    const fileName = `PorcosLauncher_Setup_${updateData.version}.exe`;
    const filePath = await join(cacheDir, fileName);
    
    // Listen for download progress
    unlisten = await listen<{ id: string; progress: number }>('download-progress', (event) => {
      if (event.payload.id === downloadId) {
        const progress = Math.round(event.payload.progress);
        downloadPercent.textContent = `${progress}%`;
        downloadProgress.style.width = `${progress}%`;
      }
    });
    
    await invoke('download_file', {
      url: updateData.downloadUrl,
      path: filePath,
      id: downloadId
    });
    
    if (unlisten) unlisten();
    
    downloadPercent.textContent = '100%';
    downloadProgress.style.width = '100%';
    downloadText.textContent = t.installing;
    
    // Run installer
    try {
      await invoke('run_update_installer', { installerPath: filePath });
    } catch (e) {
      console.warn('Update script failed, trying normal installer:', e);
      await invoke('run_installer', { path: filePath });
    }
    
    await exit(0);
  } catch (e) {
    console.error('Update failed:', e);
    if (unlisten) unlisten();
    // Continue to main app on error
    continueToApp();
  }
}

async function continueToApp() {
  statusText.textContent = t.loadingResources;
  loaderSection.style.display = 'block';
  updateSection.classList.remove('visible');
  downloadSection.classList.remove('visible');
  splashContainer.classList.remove('expanded');
  
  // Small delay for smooth transition
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    await invoke('set_complete', { task: 'frontend' });
    console.log('Splash screen: Frontend task marked as complete');
  } catch (error) {
    console.error('Splash screen: Error invoking set_complete:', error);
  }
}

async function setup() {
  console.log('Splash screen: Starting...');
  
  translateUI();
  
  // Check for updates
  const hasUpdate = await checkForUpdates();
  
  if (hasUpdate) {
    // Set up button handlers
    skipBtn.addEventListener('click', () => {
      continueToApp();
    });
    
    updateBtn.addEventListener('click', () => {
      updateBtn.disabled = true;
      downloadUpdate();
    });
  } else {
    // No update, continue normally
    statusText.textContent = t.loadingResources;
    await new Promise(resolve => setTimeout(resolve, 1000));
    await continueToApp();
  }
}

setup();
