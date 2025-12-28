import React from 'react';
import { Layers, PackageCheck, FileCode } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './ModInstallSuccessModal.module.css';

interface ModInstallSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    modName: string;
    instanceName: string;
    dependencies?: string[];
}

const ModInstallSuccessModal: React.FC<ModInstallSuccessModalProps> = ({ isOpen, onClose, modName, instanceName, dependencies = [] }) => {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={styles.modal}
            >
                <div className={styles.header}>
                    <h3 className={styles.title}>
                        <PackageCheck className={styles.titleIcon} size={24} />
                        Instalación Completada
                    </h3>
                    <p className={styles.description}>
                        Se ha añadido <span className={styles.highlight}>{modName}</span> correctamente a la instancia <span className={styles.highlight}>{instanceName}</span>.
                    </p>
                </div>

                {dependencies.length > 0 && (
                    <div className={styles.content}>
                        <div className={styles.dependencyContainer}>
                            <div className={styles.dependencyHeader}>
                                <Layers size={14} />
                                <span>Dependencias Instaladas ({dependencies.length})</span>
                            </div>
                            <div className={styles.dependencyList}>
                                {dependencies.map((dep, i) => (
                                    <div key={i} className={styles.dependencyItem}>
                                        <FileCode size={16} className={styles.fileIcon} />
                                        <span className={styles.fileName}>{dep}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.button}>
                        Entendido
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ModInstallSuccessModal;
