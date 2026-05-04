import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Copy, Check, User, ArrowLeft, Play } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import TitleBar from '@/components/TitleBar';
import { useI18n } from '@/i18n';

interface LoginProps {
    onLoginSuccess: (profile: { username: string; uuid: string; mode: 'microsoft' | 'offline' }) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const { t } = useI18n();
    const { setUser } = useAuthStore();
    const [isLoading, setIsLoading] = React.useState(false);
    const [view, setView] = React.useState<'main' | 'offline'>('main');
    const [username, setUsername] = React.useState('');
    const [deviceCode, setDeviceCode] = React.useState<{ user_code: string, verification_uri: string } | null>(null);
    const [copied, setCopied] = React.useState(false);
    const processedCodesRef = React.useRef<Set<string>>(new Set());

    React.useEffect(() => {
        let unlisten: () => void;

        const setupListener = async () => {
            const { listen } = await import("@tauri-apps/api/event");

            unlisten = await listen('auth-device-code', async (event: any) => {
                const userCode = event.payload.user_code;
                if (processedCodesRef.current.has(userCode)) return;

                processedCodesRef.current.add(userCode);
                setDeviceCode(event.payload);

                const url = event.payload.verification_uri;
                try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("open_url", { url });
                } catch (e) {
                    console.error("Failed to open browser:", e);
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
            processedCodesRef.current.clear();
        };
    }, []);

    const handleMicrosoftLogin = async () => {
        setIsLoading(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const result: any = await invoke('login_microsoft');

            const profile = {
                username: result.username || 'Player',
                uuid: result.uuid || '',
                xuid: result.xuid || '',
                mode: 'microsoft' as const,
                accessToken: result.access_token,
                refreshToken: result.refresh_token,
                expiresAt: Date.now() + (result.expires_in * 1000)
            };

            setUser(profile);
            onLoginSuccess(profile);
        } catch (error) {
            console.error("Login failed:", error);
            setIsLoading(false);
        }
    };

    const handleOfflineLogin = async () => {
        if (!username.trim()) return;
        setIsLoading(true);
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke('login_offline', { username });

            const profile = {
                username: username,
                uuid: (await invoke("generate_offline_uuid", { username })) as string,
                xuid: '0',
                mode: 'offline' as const,
            };

            setUser(profile);
            onLoginSuccess(profile);
        } catch (error) {
            console.error("Login failed:", error);
            setIsLoading(false);
        }
    };

    const cancelLogin = () => {
        setDeviceCode(null);
        setIsLoading(false);
    };

    const copyCode = () => {
        if (deviceCode) {
            navigator.clipboard.writeText(deviceCode.user_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="relative w-full h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden rounded-xl border border-[var(--border)]">

            {/* TitleBar */}
            <div className="relative z-50 bg-[var(--bg-secondary)]/80 backdrop-blur-sm border-b border-[var(--border)]">
                <TitleBar />
            </div>

            {/* Device Code Modal */}
            <AnimatePresence>
                {deviceCode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
                    >
                        <div className="ms-modal">
                            <div className="ms-header">
                                <div className="ms-logo">
                                    <div className="square red"></div>
                                    <div className="square green"></div>
                                    <div className="square blue"></div>
                                    <div className="square yellow"></div>
                                </div>
                                <span className="ms-title">Microsoft</span>
                            </div>

                            <h2>{t('signInWithMicrosoft')}</h2>

                            <p className="ms-desc">
                                {t('browserOpened')}
                            </p>

                            <p className="ms-desc-light">
                                {t('enterCodeWhenPrompted')}
                            </p>

                            <div className="code-box">
                                <span className="code">{deviceCode.user_code}</span>
                                <button className="copy-btn" onClick={copyCode}>
                                    {copied ? <Check size={20} /> : <Copy size={20} />}
                                </button>
                            </div>

                            <div className="buttons">
                                <button className="primary" onClick={copyCode}>
                                    {copied ? t('copied') : t('copyCode')}
                                </button>
                                <button className="secondary" onClick={cancelLogin}>{t('cancel')}</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className="flex-1 relative z-10 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm flex flex-col items-center gap-8"
                >
                    {/* Header */}
                    <div className="flex flex-col items-center text-center space-y-2 w-full">
                        <div className="w-32 h-32 mb-8 flex items-center justify-center">
                            <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain drop-shadow-2xl rounded-3xl" />
                        </div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Porcos Launcher</h1>
                        <p className="text-[#a1a1aa] text-sm">{t('welcomeBack')}</p>
                    </div>

                    {/* Login Options */}
                    <div className="w-full min-h-[140px]">
                        <AnimatePresence mode="wait">
                            {view === 'main' ? (
                                <motion.div 
                                    key="main"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col gap-4"
                                >
                                    <button
                                        onClick={handleMicrosoftLogin}
                                        disabled={isLoading}
                                        className="w-full h-14 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl font-medium text-base transition-colors flex items-center justify-center gap-3"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="animate-spin w-5 h-5" />
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
                                                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                                                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                                                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                                                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                                                </svg>
                                                {t('microsoftLogin')}
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setView('offline')}
                                        className="w-full h-14 bg-transparent hover:bg-[var(--bg-secondary)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-xl font-medium text-base transition-colors flex items-center justify-center gap-3"
                                    >
                                        <User size={20} />
                                        {t('offlineMode')}
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="offline"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col gap-12"
                                >
                                    <div className="space-y-3">
                                        <label className="block text-sm font-medium text-[var(--text-secondary)] ml-1">{t('offlineUsername')}</label>
                                        <input
                                            type="text"
                                            placeholder={t('usernamePlaceholder')}
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleOfflineLogin()}
                                            className="w-full h-14 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all text-lg"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <button
                                            onClick={() => setView('main')}
                                            className="h-14 w-14 flex items-center justify-center bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl transition-colors"
                                        >
                                            <ArrowLeft size={24} />
                                        </button>
                                        <button
                                            onClick={handleOfflineLogin}
                                            disabled={!username.trim() || isLoading}
                                            className="flex-1 h-14 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-foreground)] rounded-xl font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,191,186,0.2)]"
                                        >
                                            {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : (
                                                <>
                                                    {t('enter')}
                                                    <Play size={20} fill="currentColor" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Login;
