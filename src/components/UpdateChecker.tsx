import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
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

import styles from './UpdateChecker.module.css';

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

                // Add timestamp to prevent caching
                const urlWithTimestamp = `${UPDATE_JSON_URL}?t=${new Date().getTime()}`;
                const responseText = await invoke('fetch_cors', { url: urlWithTimestamp }) as string;
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

        const downloadId = "update-download";
        let unlisten: (() => void) | undefined;

        try {
            const cacheDir = await appCacheDir();
            const fileName = `PorcosLauncher_Setup_${updateAvailable.version}.exe`;
            const filePath = await join(cacheDir, fileName);

            // Listen for download progress
            unlisten = await listen<{ id: string; progress: number }>('download-progress', (event) => {
                if (event.payload.id === downloadId) {
                    setDownloadProgress(Math.round(event.payload.progress));
                }
            });

            await invoke('download_file', { 
                url: updateAvailable.downloadUrl, 
                path: filePath,
                id: downloadId 
            });
            
            if (unlisten) unlisten();
            setDownloadProgress(100);

            // Run the installer
            await invoke('run_installer', { path: filePath });
            
            // Close the app
            await exit(0);

        } catch (e) {
            console.error("Update failed:", e);
            if (unlisten) unlisten();
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
                className={styles.overlay}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className={styles.modal}
                >
                    {/* Decorative background glow */}
                    <div className={styles.glowEffect} />
                    
                    <div className={styles.content}>
                        {/* Header */}
                        <div className={styles.header}>
                            <div>
                                <h3 className={styles.title}>¡Actualización Disponible!</h3>
                                <p className={styles.subtitle}>Una nueva versión de Porcos Launcher está lista para instalar.</p>
                            </div>
                        </div>

                        {/* Version Info Card */}
                        <div className={styles.versionCard}>
                            <div className={styles.versionRow}>
                                <div className={styles.versionInfo}>
                                    <span className={styles.label}>Versión Actual</span>
                                    <span className={styles.versionNumber}>{currentVersion}</span>
                                </div>
                                <div className={styles.separator}>
                                    <div className={styles.separatorDot} />
                                </div>
                                <div className={`${styles.versionInfo} ${styles.versionInfoRight}`}>
                                    <span className={`${styles.label} ${styles.labelNew}`}>Nueva Versión</span>
                                    <span className={`${styles.versionNumber} ${styles.versionNumberNew}`}>{updateAvailable.version}</span>
                                </div>
                            </div>
                            
                            {updateAvailable.notes && (
                                <div className={styles.notesSection}>
                                    <span className={styles.label} style={{ display: 'block', marginBottom: '0.5rem' }}>Novedades</span>
                                    <div className={styles.notesContent}>
                                        {updateAvailable.notes}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        {isDownloading ? (
                            <div className={styles.progressContainer}>
                                <div className={styles.progressHeader}>
                                    <span className={styles.progressText}>Descargando actualización...</span>
                                    <span className={styles.progressValue}>{downloadProgress}%</span>
                                </div>
                                <div className={styles.track}>
                                    <motion.div 
                                        className={styles.bar}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${downloadProgress}%` }}
                                        transition={{ type: "spring", stiffness: 50 }}
                                    />
                                </div>
                                <p className={styles.progressFooter}>El lanzador se reiniciará automáticamente al finalizar.</p>
                            </div>
                        ) : (
                            <div className={styles.actions}>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className={styles.buttonSecondary}
                                >
                                    Recordármelo luego
                                </button>
                                <button
                                    onClick={handleUpdate}
                                    className={styles.buttonPrimary}
                                >
                                    <Download size={20} />
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
