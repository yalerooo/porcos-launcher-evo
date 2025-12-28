import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLauncherStore } from '@/stores/launcherStore';
import { useAuthStore } from '@/stores/authStore';

const Dashboard: React.FC = () => {
    const {
        selectedVersion,
        versions,
        setVersions,
        setSelectedVersion,
        isLaunching,
        setIsLaunching,
        addLog,
        memoryMin,
        memoryMax
    } = useLauncherStore();

    const { user } = useAuthStore();

    // Fetch available versions on mount if empty
    React.useEffect(() => {
        if (versions.length === 0) {
            loadVersions();
        }
    }, []);

    const loadVersions = async () => {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const versionList = await invoke("get_available_versions");
            setVersions(versionList as any[]);
            if (versionList && (versionList as any[]).length > 0 && !selectedVersion) {
                setSelectedVersion((versionList as any[])[0].id);
            }
        } catch (error) {
            console.error("Failed to load versions:", error);
            addLog(`Error loading versions: ${error}`);
        }
    };

    const handleLaunch = async () => {
        if (!selectedVersion || !user) return;

        setIsLaunching(true);
        addLog(`Launching Minecraft ${selectedVersion}...`);

        try {
            const { invoke } = await import("@tauri-apps/api/core");

            // Generate offline UUID if needed
            let uuid = user.uuid;
            if (user.mode === 'offline' && !uuid) {
                uuid = await invoke("generate_offline_uuid", { username: user.username });
                addLog(`Generated offline UUID: ${uuid}`);
            }

            const options = {
                version: selectedVersion,
                auth: user.mode === 'microsoft' ? {
                    Microsoft: {
                        access_token: user.accessToken || '',
                        uuid: uuid,
                        username: user.username,
                        xuid: user.xuid || '0'
                    }
                } : {
                    Offline: {
                        uuid: uuid,
                        username: user.username,
                        xuid: '0'
                    }
                },
                memory_min: `${memoryMin}G`,
                memory_max: `${memoryMax}G`,
                java_path: null,
                minecraft_dir: null
            };

            addLog("Launch options: " + JSON.stringify(options, null, 2));
            const result = await invoke("launch_minecraft", { options });
            addLog("Launch result: " + JSON.stringify(result));

        } catch (error) {
            console.error("Launch failed:", error);
            addLog(`Launch failed: ${error}`);
        } finally {
            setIsLaunching(false);
        }
    };

    return (
        <div className="relative w-full h-full flex flex-col overflow-hidden">
            {/* Background Image/Effect */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1607677686474-ad91fc94f5ae?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/80 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)] via-transparent to-transparent" />
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-end p-12 pb-20">
                <motion.div
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="max-w-2xl space-y-8"
                >
                    {/* Title */}
                    <div>
                        <h1 className="text-7xl font-black text-white mb-4 tracking-tighter drop-shadow-2xl">
                            MINECRAFT
                        </h1>
                        <div className="flex items-center gap-4 text-[var(--text-secondary)]">
                            <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium backdrop-blur-md">
                                {selectedVersion || "Selecciona una versión"}
                            </span>
                            <span className="text-sm font-medium flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                {user?.username}
                            </span>
                        </div>
                    </div>

                    {/* Description */}
                    <p className="text-[var(--text-secondary)] text-lg max-w-lg leading-relaxed">
                        Explora mundos infinitos y construye todo lo que puedas imaginar.
                        La aventura comienza aquí.
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-6 pt-6">
                        <button
                            onClick={handleLaunch}
                            disabled={isLaunching || !selectedVersion}
                            className={cn(
                                "h-16 px-10 text-xl font-bold rounded-2xl transition-all duration-300 shadow-xl flex items-center gap-3",
                                isLaunching
                                    ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-not-allowed"
                                    : "bg-[var(--accent)] text-[var(--accent-foreground)] hover:scale-105 hover:shadow-[var(--accent)]/30 hover:brightness-110 active:scale-95"
                            )}
                        >
                            {isLaunching ? (
                                <>
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                    Iniciando...
                                </>
                            ) : (
                                <>
                                    <Play className="h-6 w-6 fill-current" />
                                    JUGAR
                                </>
                            )}
                        </button>

                        <div className="h-16 px-6 bg-[var(--bg-secondary)]/50 backdrop-blur-xl border border-white/5 rounded-2xl flex flex-col justify-center min-w-[160px] hover:bg-[var(--bg-secondary)] transition-colors group">
                            <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-1 group-hover:text-[var(--accent)] transition-colors">Versión</span>
                            <select
                                value={selectedVersion}
                                onChange={(e) => setSelectedVersion(e.target.value)}
                                className="bg-transparent text-white font-bold text-lg focus:outline-none cursor-pointer w-full appearance-none"
                            >
                                {versions.map(v => (
                                    <option key={v.id} value={v.id} className="bg-[var(--bg-secondary)] text-white">
                                        {v.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Dashboard;
