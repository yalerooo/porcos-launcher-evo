import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { exit } from '@tauri-apps/plugin-process';
import { join, appCacheDir } from '@tauri-apps/api/path';


const UPDATE_JSON_URL = "https://raw.githubusercontent.com/yalerooo/myApis/refs/heads/main/porcosLauncher/updatesporcoslauncher.json";

interface UpdateData {
    version: string;
    date: string;
    downloadUrl: string;
    notes?: string;
}

const compareVersions = (v1: string, v2: string) => {
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

const UpdateChecker: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState<UpdateData | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [currentVersion, setCurrentVersion] = useState('');

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const current = await getVersion();
                setCurrentVersion(current);

                const responseText = await invoke('fetch_cors', { url: UPDATE_JSON_URL }) as string;
                const data = JSON.parse(responseText);

                // Assume JSON structure: { version: "1.0.1", date: "...", downloadUrl: "..." }
                // Or if it's wrapped: { latest: { ... } }
                // Based on user request, I'll try to be flexible or assume root object
                const remoteVersion = data.version;
                
                if (remoteVersion && compareVersions(remoteVersion, current) > 0) {
                    setUpdateAvailable(data);
                    setShowModal(true);
                }
            } catch (e) {
                console.error("Failed to check for updates:", e);
            }
        };

        checkUpdate();
    }, []);

    const handleUpdate = async () => {
        if (!updateAvailable) return;
        setIsDownloading(true);
        setDownloadProgress(0);

        try {
            const cacheDir = await appCacheDir();
            const fileName = `PorcosLauncher_Setup_${updateAvailable.version}.exe`;
            const filePath = await join(cacheDir, fileName);

            // We don't have progress callback for download_file yet in the backend command usually, 
            // unless implemented. The current backend `download_file` likely just awaits.
            // So we'll fake progress or just show "Downloading..."
            
            // Fake progress for UX
            const progressInterval = setInterval(() => {
                setDownloadProgress(prev => {
                    if (prev >= 90) return prev;
                    return prev + 10;
                });
            }, 500);

            await invoke('download_file', { url: updateAvailable.downloadUrl, path: filePath });
            
            clearInterval(progressInterval);
            setDownloadProgress(100);

            // Run the installer
            await open(filePath);
            
            // Close the app
            await exit(0);

        } catch (e) {
            console.error("Update failed:", e);
            setIsDownloading(false);
            alert("Error al descargar la actualización. Por favor, inténtalo manualmente.");
        }
    };

    if (!showModal || !updateAvailable) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-[#1a1a1a] w-full max-w-md rounded-2xl border border-white/10 flex flex-col overflow-hidden shadow-2xl"
                >
                    <div className="p-6 flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-[#ffbfba]/20 flex items-center justify-center text-[#ffbfba]">
                                <Download size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Actualización Disponible</h3>
                                <p className="text-[#a1a1aa]">Nueva versión {updateAvailable.version}</p>
                            </div>
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-[#a1a1aa]">Versión Actual:</span>
                                <span className="text-white font-mono">{currentVersion}</span>
                            </div>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-[#a1a1aa]">Nueva Versión:</span>
                                <span className="text-[#ffbfba] font-mono font-bold">{updateAvailable.version}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[#a1a1aa]">Fecha:</span>
                                <span className="text-white">{updateAvailable.date}</span>
                            </div>
                            {updateAvailable.notes && (
                                <div className="mt-3 pt-3 border-t border-white/10 text-sm text-[#a1a1aa]">
                                    {updateAvailable.notes}
                                </div>
                            )}
                        </div>

                        {isDownloading ? (
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-white">Descargando...</span>
                                    <span className="text-[#ffbfba]">{downloadProgress}%</span>
                                </div>
                                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div 
                                        className="h-full bg-[#ffbfba]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 h-12 rounded-xl bg-[#27272a] text-white hover:bg-[#3f3f46] transition-colors font-medium"
                                >
                                    Más tarde
                                </button>
                                <button
                                    onClick={handleUpdate}
                                    className="flex-1 h-12 bg-[#ffbfba] text-[#1a1a1a] rounded-xl font-bold hover:brightness-110 transition-all shadow-[0_0_15px_rgba(255,191,186,0.3)]"
                                >
                                    Actualizar Ahora
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default UpdateChecker;
