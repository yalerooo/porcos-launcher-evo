import React from 'react';
import { Settings as SettingsIcon, Cpu, Globe, Monitor, Info } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { SettingsPage, SettingsSection, SettingsCard, settingsStyles } from '@/components/SettingsLayout';
import { useI18n } from '@/i18n';
import flagEn from '@/assets/flags/en.png';
import flagEs from '@/assets/flags/es.png';
import styles from './Settings.module.css';

const PRESET_RESOLUTIONS = [
    { label: '800x600', width: '800', height: '600' },
    { label: '1280x720', width: '1280', height: '720' },
    { label: '1366x768', width: '1366', height: '768' },
    { label: '1920x1080', width: '1920', height: '1080' },
    { label: '2560x1440', width: '2560', height: '1440' },
    { label: '3840x2160', width: '3840', height: '2160' },
];

const Settings: React.FC = () => {
    const { t, language, setLanguage } = useI18n();
    const {
        memoryMin,
        setMemoryMin,
        memoryMax,
        setMemoryMax,
        resolutionWidth,
        resolutionHeight,
        setResolution,
    } = useLauncherStore();

    const [customWidth, setCustomWidth] = React.useState(resolutionWidth);
    const [customHeight, setCustomHeight] = React.useState(resolutionHeight);
    const [isCustomMode, setIsCustomMode] = React.useState(false);

    const currentResolution = `${resolutionWidth}x${resolutionHeight}`;

    const handlePresetSelect = (width: string, height: string) => {
        setResolution(width, height);
        setCustomWidth(width);
        setCustomHeight(height);
        setIsCustomMode(false);
    };

    const handleCustomApply = () => {
        if (customWidth && customHeight) {
            const w = parseInt(customWidth);
            const h = parseInt(customHeight);
            if (w > 0 && h > 0) {
                setResolution(customWidth, customHeight);
                setIsCustomMode(false);
            }
        }
    };

    const handleCustomMode = () => {
        setIsCustomMode(true);
        setCustomWidth(resolutionWidth);
        setCustomHeight(resolutionHeight);
    };

    const isPresetSelected = PRESET_RESOLUTIONS.some(
        res => res.width === resolutionWidth && res.height === resolutionHeight
    );

    return (
        <SettingsPage
            title={t('settingsTitle')}
            icon={<SettingsIcon size={28} />}
        >
            <SettingsSection title={t('settingsAppearance')}>
                <div className={settingsStyles.grid}>
                    <SettingsCard>
                        <div className={settingsStyles.cardHeader}>
                            <div className={settingsStyles.cardIcon}>
                                <Globe size={20} />
                            </div>
                            <div>
                                <h3 className={settingsStyles.cardTitle}>{t('language')}</h3>
                                <p className={settingsStyles.cardDesc}>Select your preferred language</p>
                            </div>
                        </div>
                        <div className={settingsStyles.languageButtons}>
                            <button
                                onClick={() => setLanguage('en')}
                                className={`${styles.langButton} ${language === 'en' ? styles.langButtonActive : ''}`}
                            >
                                <img src={flagEn} alt="EN" className={styles.flagIcon} />
                                {t('english')}
                            </button>
                            <button
                                onClick={() => setLanguage('es')}
                                className={`${styles.langButton} ${language === 'es' ? styles.langButtonActive : ''}`}
                            >
                                <img src={flagEs} alt="ES" className={styles.flagIcon} />
                                {t('spanish')}
                            </button>
                        </div>
                    </SettingsCard>

                    <SettingsCard>
                        <div className={settingsStyles.cardHeader}>
                            <div className={settingsStyles.cardIcon}>
                                <Monitor size={20} />
                            </div>
                            <div>
                                <h3 className={settingsStyles.cardTitle}>{t('display')}</h3>
                                <p className={settingsStyles.cardDesc}>{t('displayDesc')}</p>
                            </div>
                        </div>

                        {!isCustomMode ? (
                            <>
                                <div className={styles.resolutionGrid}>
                                    {PRESET_RESOLUTIONS.map((res) => (
                                        <button
                                            key={res.label}
                                            onClick={() => handlePresetSelect(res.width, res.height)}
                                            className={`${styles.resolutionBtn} ${currentResolution === res.label ? styles.resolutionBtnActive : ''}`}
                                        >
                                            {res.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleCustomMode}
                                    className={styles.customResolutionBtn}
                                >
                                    {t('customResolution')}
                                </button>
                            </>
                        ) : (
                            <div className={styles.customResolutionContainer}>
                                <div className={styles.customInputs}>
                                    <div className={styles.customInputGroup}>
                                        <label className={styles.customInputLabel}>{t('width')}</label>
                                        <input
                                            type="number"
                                            value={customWidth}
                                            onChange={(e) => setCustomWidth(e.target.value)}
                                            className={styles.customInput}
                                            min="1"
                                            max="9999"
                                        />
                                    </div>
                                    <span className={styles.customInputSeparator}>x</span>
                                    <div className={styles.customInputGroup}>
                                        <label className={styles.customInputLabel}>{t('height')}</label>
                                        <input
                                            type="number"
                                            value={customHeight}
                                            onChange={(e) => setCustomHeight(e.target.value)}
                                            className={styles.customInput}
                                            min="1"
                                            max="9999"
                                        />
                                    </div>
                                </div>
                                <div className={styles.customButtons}>
                                    <button
                                        onClick={() => setIsCustomMode(false)}
                                        className={styles.customCancelBtn}
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={handleCustomApply}
                                        className={styles.customApplyBtn}
                                    >
                                        {t('apply')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isPresetSelected && !isCustomMode && (
                            <div className={styles.currentResolutionBadge}>
                                <span className={styles.currentResolutionLabel}>{t('currentResolution')}:</span>
                                <span className={styles.currentResolutionValue}>{currentResolution}</span>
                            </div>
                        )}
                    </SettingsCard>
                </div>
            </SettingsSection>

            <SettingsSection title={t('javaSettings')}>
                <div className={settingsStyles.grid}>
                    <SettingsCard className={settingsStyles.cardFull}>
                        <div className={settingsStyles.cardHeader}>
                            <div className={settingsStyles.cardIcon}>
                                <Cpu size={20} />
                            </div>
                            <div>
                                <h3 className={settingsStyles.cardTitle}>{t('memoryAllocation')}</h3>
                                <p className={settingsStyles.cardDesc}>Configure RAM allocation for Minecraft</p>
                            </div>
                        </div>

                        <div className={settingsStyles.sliderGroup}>
                            <div className={settingsStyles.sliderHeader}>
                                <span className={settingsStyles.sliderLabel}>{t('minMemory')}</span>
                                <span className={settingsStyles.sliderValue}>{memoryMin} GB</span>
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
                                className={settingsStyles.slider}
                            />
                        </div>

                        <div className={settingsStyles.sliderGroup}>
                            <div className={settingsStyles.sliderHeader}>
                                <span className={settingsStyles.sliderLabel}>{t('maxMemory')}</span>
                                <span className={settingsStyles.sliderValue}>{memoryMax} GB</span>
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
                                className={settingsStyles.slider}
                            />
                        </div>
                    </SettingsCard>
                </div>
            </SettingsSection>

            <SettingsSection title={t('about')}>
                <div className={settingsStyles.grid}>
                    <SettingsCard>
                        <div className={settingsStyles.cardHeader}>
                            <div className={settingsStyles.cardIcon}>
                                <Info size={20} />
                            </div>
                            <div>
                                <h3 className={settingsStyles.cardTitle}>Porcos Launcher</h3>
                                <p className={settingsStyles.cardDesc}>{t('version')} 0.1.7</p>
                            </div>
                        </div>
                    </SettingsCard>
                </div>
            </SettingsSection>
        </SettingsPage>
    );
};

export default Settings;