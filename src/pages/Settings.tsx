import React from 'react';
import { Settings as SettingsIcon, Cpu } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { SettingsPage, SettingsSection, SettingsCard } from '@/components/SettingsLayout';
import styles from './Settings.module.css';

const Settings: React.FC = () => {
    const {
        memoryMin,
        setMemoryMin,
        memoryMax,
        setMemoryMax,
    } = useLauncherStore();

    return (
        <SettingsPage 
            title="Configuración" 
            subtitle="Personaliza tu experiencia de juego"
            icon={<SettingsIcon size={32} />}
        >
            {/* Java Settings */}
            <SettingsSection title="Java y Memoria" icon={<Cpu size={20} />}>
                <SettingsCard>
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
                </SettingsCard>
            </SettingsSection>
        </SettingsPage>
    );
};

export default Settings;
