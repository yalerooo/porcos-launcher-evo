import React from 'react';
import { Settings as SettingsIcon, Cpu, Globe } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { SettingsPage, SettingsSection, SettingsCard } from '@/components/SettingsLayout';
import { useI18n } from '@/i18n';
import styles from './Settings.module.css';

const Settings: React.FC = () => {
    const { t, language, setLanguage } = useI18n();
    const {
        memoryMin,
        setMemoryMin,
        memoryMax,
        setMemoryMax,
    } = useLauncherStore();

    return (
        <SettingsPage 
            title={t('settingsTitle')} 
            subtitle=""
            icon={<SettingsIcon size={32} />}
        >
            {/* Language Settings */}
            <SettingsSection title={t('settingsAppearance')} icon={<Globe size={20} />}>
                <SettingsCard>
                    <div className={styles.settingRow}>
                        <div className={styles.settingInfo}>
                            <span className={styles.settingLabel}>{t('language')}</span>
                        </div>
                        <div className={styles.languageButtons}>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`${styles.langButton} ${language === 'en' ? styles.langButtonActive : ''}`}
                            >
                                🇺🇸 {t('english')}
                            </button>
                            <button
                                onClick={() => setLanguage('es')}
                                className={`${styles.langButton} ${language === 'es' ? styles.langButtonActive : ''}`}
                            >
                                🇪🇸 {t('spanish')}
                            </button>
                        </div>
                    </div>
                </SettingsCard>
            </SettingsSection>

            {/* Java Settings */}
            <SettingsSection title={t('javaSettings')} icon={<Cpu size={20} />}>
                <SettingsCard>
                    <div className={styles.sliderGroup}>
                        <div className={styles.sliderHeader}>
                            <span className={styles.sliderLabel}>{t('minMemory')} (RAM)</span>
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
                            <span className={styles.sliderLabel}>{t('maxMemory')} (RAM)</span>
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
