import React from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Cpu } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import styles from './Settings.module.css';

const Settings: React.FC = () => {
    const {
        memoryMin,
        setMemoryMin,
        memoryMax,
        setMemoryMax,
    } = useLauncherStore();

    return (
        <div className={styles.container}>
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={styles.content}
            >
                <div className={styles.header}>
                    <div className={styles.iconWrapper}>
                        <SettingsIcon size={32} />
                    </div>
                    <div>
                        <h1 className={styles.title}>Configuración</h1>
                        <p className={styles.subtitle}>Personaliza tu experiencia de juego</p>
                    </div>
                </div>

                {/* Java Settings */}
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>
                        <Cpu size={20} className={styles.sectionIcon} />
                        Java y Memoria
                    </h2>

                    <div className={styles.card}>
                        <div className={styles.sliderGroup}>
                            <div className={styles.sliderHeader}>
                                <span className={styles.sliderLabel}>Memoria Mínima (RAM)</span>
                                <span className={styles.sliderValue}>{memoryMin} GB</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="32"
                                value={memoryMin}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setMemoryMin(val);
                                    if (parseInt(val) > parseInt(memoryMax)) setMemoryMax(val);
                                }}
                                className={styles.slider}
                            />
                        </div>

                        <div className={styles.sliderGroup}>
                            <div className={styles.sliderHeader}>
                                <span className={styles.sliderLabel}>Memoria Máxima (RAM)</span>
                                <span className={styles.sliderValue}>{memoryMax} GB</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="32"
                                value={memoryMax}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setMemoryMax(val);
                                    if (parseInt(val) < parseInt(memoryMin)) setMemoryMin(val);
                                }}
                                className={styles.slider}
                            />
                        </div>
                    </div>
                </section>
            </motion.div>
        </div>
    );
};

export default Settings;
