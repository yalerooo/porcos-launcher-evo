import React, { useEffect, useState, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Home, Box, Settings, Terminal, LogOut, Minus, X, Puzzle, AlertCircle, Square, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from '../pages/Home.module.css';
import { useLauncherStore } from '@/stores/launcherStore';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@/i18n';

interface MainLayoutProps {
  children: React.ReactNode;
  activePage: string;
  setActivePage: (page: string) => void;
  onLogout: () => void;
  userProfile: {
    username: string;
    uuid: string;
    skinUrl?: string;
  };
}

export default function MainLayout({
  children,
  activePage,
  setActivePage,
  onLogout,
  userProfile
}: MainLayoutProps) {
  const appWindow = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
      const updateState = async () => {
          try {
              const tauriMax = await appWindow.isMaximized();
              // Fallback check for Windows where isMaximized might report false incorrectly
              const isScreenFilled = window.outerWidth >= window.screen.availWidth && window.outerHeight >= window.screen.availHeight;
              setIsMaximized(tauriMax || isScreenFilled);
          } catch (e) {
              console.error("Failed to check window state:", e);
          }
      };

      updateState();
      const unlisten = appWindow.listen('tauri://resize', updateState);
      window.addEventListener('resize', updateState);
      
      return () => {
          unlisten.then(f => f());
          window.removeEventListener('resize', updateState);
      };
  }, []);

  const { 
      isLaunching, 
      selectedInstance, 
      launchStartTime, 
      setCrashReport, 
      setIsLaunching, 
      setLaunchStartTime, 
      addLog,
      crashReport 
  } = useLauncherStore();

  // Polling for crash reports (Global) - reduced frequency as backup to event-based detection
  useEffect(() => {
      if (!isLaunching || !selectedInstance || !launchStartTime) return;

      // Poll every 30 seconds instead of 2 - events handle most cases
      const POLL_INTERVAL = 30000;
      const bufferMs = 5000;

      const interval = setInterval(async () => {
          try {
              const { invoke } = await import("@tauri-apps/api/core");
              const { join } = await import("@tauri-apps/api/path");

              const instancePath = await invoke("get_instance_path", { id: selectedInstance.id }) as string;
              const crashReportsDir = await join(instancePath, "crash-reports");

              const exists = await invoke("file_exists", { path: crashReportsDir }) as boolean;
              if (!exists) return;

              const files = await invoke("list_files", { path: crashReportsDir }) as {name: string, is_dir: boolean}[];

              // Filter for txt files
              const reports = files.filter(f => f.name.endsWith(".txt") && f.name.startsWith("crash-"));

              for (const report of reports) {
                  // Parse timestamp from filename: crash-YYYY-MM-DD_HH.MM.SS-client.txt
                  const match = report.name.match(/crash-(\d{4})-(\d{2})-(\d{2})_(\d{2})\.(\d{2})\.(\d{2})-client\.txt/);
                  if (match) {
                      const [_, year, month, day, hour, minute, second] = match;
                      const reportDate = new Date(
                          parseInt(year),
                          parseInt(month) - 1,
                          parseInt(day),
                          parseInt(hour),
                          parseInt(minute),
                          parseInt(second)
                      );

                      // Check if report is newer than launch start time (with buffer)
                      if (reportDate.getTime() > launchStartTime - bufferMs) {
                          console.log("Found new crash report via polling:", report.name);

                          const fullPath = await join(crashReportsDir, report.name);
                          const content = await invoke("read_text_file", { path: fullPath }) as string;

                          setCrashReport({ path: fullPath, content });
                          setIsLaunching(false);
                          setLaunchStartTime(null);
                          clearInterval(interval);
                          return;
                      }
                  }
              }
          } catch (e) {
              console.error("Polling error:", e);
          }
      }, POLL_INTERVAL);

      return () => clearInterval(interval);
  }, [isLaunching, selectedInstance, launchStartTime]);

  // Global Event Listeners
  useEffect(() => {
      console.log("Setting up global event listeners in MainLayout...");
      
      const setupListeners = async () => {
          const unlistenExited = await listen('game-exited', () => {
              console.log("Game exited event received");
              setIsLaunching(false);
              setLaunchStartTime(null);
          });
          
          const unlistenCrashed = await listen('game-crashed', (event) => {
              console.log("Global crash handler received event", event);
              addLog("Frontend: Received game-crashed event!");
              const payload = event.payload as { path: string, content: string };
              setCrashReport(payload);
              setIsLaunching(false);
              setLaunchStartTime(null);
          });

          const unlistenOutput = await listen('game-output', async (event) => {
              const line = event.payload as string;
              addLog(line);
              if (line.includes("#@!@# Game crashed! Crash report saved to: #@!@#")) {
                  const match = line.match(/#@!@# Game crashed! Crash report saved to: #@!@# (.*)/);
                  if (match && match[1]) {
                      const reportPath = match[1].trim();
                      console.log("Detected crash from console output:", reportPath);
                      addLog("Frontend: Detected crash via log parsing!");
                      try {
                          const { invoke } = await import("@tauri-apps/api/core");
                          const content = await invoke("read_text_file", { path: reportPath }) as string;
                          setCrashReport({ path: reportPath, content });
                          setIsLaunching(false);
                          setLaunchStartTime(null);
                      } catch (e) {
                          console.error("Failed to read crash report from console detection:", e);
                      }
                  }
              }
          });

          return () => {
              console.log("Cleaning up global event listeners...");
              unlistenExited();
              unlistenCrashed();
              unlistenOutput();
          };
      };

      const cleanupPromise = setupListeners();

      return () => {
          cleanupPromise.then(cleanup => cleanup());
      };
  }, []);

  const { t, language } = useI18n();

  const navItems = useMemo(() => [
    { id: 'home', label: t('home'), icon: Home },
    { id: 'instances', label: t('instances'), icon: Box },
    { id: 'mods', label: t('mods'), icon: Puzzle },
    { id: 'settings', label: t('settings'), icon: Settings },
    { id: 'console', label: t('console'), icon: Terminal },
  ], [language, t]);

  // Avatar URL logic
  // Use mc-heads to ensure we get a rendered head/avatar, not a raw skin texture
  const avatarUrl = `https://mc-heads.net/avatar/${userProfile.uuid}/100`;

  return (
    <div className="launcher-container flex h-screen overflow-hidden bg-[var(--bg-secondary)]">
      
      {/* Sidebar */}
      <aside className="flex-shrink-0 h-full w-[65px] hover:w-[240px] z-50 flex flex-col gap-3 bg-[var(--bg-secondary)] transition-all duration-300 ease-in-out group/sidebar pt-8">
        
        {/* User Profile */}
        <div className={`px-0 group-hover/sidebar:px-3 transition-all duration-300 w-full ${styles.userProfileContainer}`}>
             <div className="flex items-center w-full py-1 px-0 rounded-[20px] hover:bg-white/5 transition-colors cursor-pointer group/profile relative overflow-hidden whitespace-nowrap justify-start">
                <div className="min-w-[65px] h-[40px] relative flex items-center justify-center">
                    <div className="w-[40px] h-[40px] rounded-xl overflow-hidden transition-all">
                        <img 
                            src={avatarUrl} 
                            alt={userProfile.username}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://mc-heads.net/avatar/MHF_Steve/100`;
                            }}
                        />
                    </div>
                    <div className="absolute bottom-0 right-1 w-4 h-4 bg-[#22c55e] border-[3px] border-[#18181b] rounded-full z-10"></div>
                </div>
                
                <div className="ml-0 max-w-0 overflow-hidden opacity-0 group-hover/sidebar:max-w-[200px] group-hover/sidebar:opacity-100 group-hover/sidebar:ml-3 transition-all duration-300 flex flex-col justify-center">
                    <span className="font-bold text-white text-lg truncate max-w-[120px] leading-tight">{userProfile.username}</span>
                    <span className="text-xs text-green-400 font-medium">{t('online')}</span>
                </div>
             </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-6 flex-1 w-full px-0 group-hover/sidebar:px-3 transition-all duration-300">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={cn(
                  "flex items-center w-full h-14 px-0 rounded-2xl transition-all duration-300 ease-in-out relative overflow-hidden whitespace-nowrap group/btn justify-start pl-0 cursor-pointer",
                  isActive
                    ? "bg-[#ffbfba] text-[#1a1a1a] shadow-[0_0_20px_rgba(255,191,186,0.3)]"
                    : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
                )}
              >
                <div className="min-w-[65px] flex items-center justify-center">
                    <Icon size={26} strokeWidth={isActive ? 2.5 : 2} className="transition-transform duration-300 group-hover/btn:scale-110" />
                </div>
                
                <span className={cn(
                    "font-bold text-base transition-all duration-300 overflow-hidden whitespace-nowrap",
                    "ml-0 max-w-0 opacity-0 group-hover/sidebar:max-w-[200px] group-hover/sidebar:opacity-100 group-hover/sidebar:ml-3",
                    isActive ? "text-[#1a1a1a]" : "text-white"
                )}>
                    {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="mt-auto pb-6 w-full px-0 group-hover/sidebar:px-3 transition-all duration-300">
             <button 
                className="flex items-center w-full h-14 px-0 rounded-2xl text-gray-500 hover:text-white transition-colors hover:bg-white/5 whitespace-nowrap group/btn justify-start pl-0 transition-all duration-300 ease-in-out cursor-pointer" 
                onClick={onLogout}
             >
                <div className="min-w-[65px] flex items-center justify-center">
                    <LogOut size={26} className="transition-transform duration-300 group-hover/btn:scale-110" />
                </div>
                <span className="font-bold text-base transition-all duration-300 overflow-hidden whitespace-nowrap ml-0 max-w-0 opacity-0 group-hover/sidebar:max-w-[200px] group-hover/sidebar:opacity-100 group-hover/sidebar:ml-3">
                    {t('logout')}
                </span>
             </button>
        </div>
      </aside>

      {/* Right Column (TitleBar + Content) */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-[var(--bg-secondary)]">
          {/* Top Bar (Matches Sidebar Color) */}
          <div className="h-14 w-full flex items-center select-none bg-[var(--bg-secondary)] relative z-[70]">
            {/* Drag Region */}
            <div className="flex-1 h-full" data-tauri-drag-region />
            
            {/* Window Controls */}
            <div className="flex items-center h-full">
                <button 
                    onClick={() => appWindow.minimize()} 
                    className="h-full w-[56px] flex items-center justify-center hover:bg-white/10 transition-colors group/min"
                    title={t('minimize')}
                >
                    <Minus size={20} className="text-white" strokeWidth={1.5} />
                </button>
                <button 
                    onClick={async () => {
                        try {
                            // Use the same logic as the state update
                            const tauriMax = await appWindow.isMaximized();
                            const isScreenFilled = window.outerWidth >= window.screen.availWidth && window.outerHeight >= window.screen.availHeight;
                            const currentMax = tauriMax || isScreenFilled;

                            if (currentMax) {
                                await appWindow.unmaximize();
                            } else {
                                await appWindow.maximize();
                            }
                        } catch (e) {
                            console.error("Maximize/Restore failed:", e);
                        }
                    }}
                    className="h-full w-[56px] flex items-center justify-center hover:bg-white/10 transition-colors group/max"
                    title={isMaximized ? t('restore') : t('maximize')}
                >
                    {isMaximized ? (
                        <Copy size={16} className="text-white" strokeWidth={2} style={{ transform: 'rotate(90deg)' }} />
                    ) : (
                        <Square size={16} className="text-white" strokeWidth={2} />
                    )}
                </button>
                <button 
                    onClick={() => appWindow.close()} 
                    className="h-full w-[56px] flex items-center justify-center hover:bg-[#e81123] transition-colors group/close"
                    title={t('close')}
                >
                    <X size={20} className="text-white" strokeWidth={1.5} />
                </button>
            </div>
          </div>
          
          {/* Main Content */}
          <main className="content-area flex-1 overflow-hidden bg-[var(--bg-primary)] relative rounded-tl-[30px]">
            <div className="w-full h-full overflow-hidden">
              {children}
            </div>
          </main>
      </div>

      {/* Global Crash Report Modal */}
      {crashReport && (
        <div 
            className="fixed top-[56px] right-0 bottom-0 left-[65px] z-[100] flex items-center justify-center p-8 rounded-tl-[30px]" 
            style={{
                background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)'
            }}
            onClick={() => setCrashReport(null)} 
            data-modal-overlay="true"
        >
            <div 
                className="w-full max-w-5xl h-[80vh] rounded-3xl flex flex-col overflow-hidden relative"
                style={{
                    background: 'linear-gradient(145deg, rgba(30, 30, 35, 0.9) 0%, rgba(20, 20, 25, 0.95) 100%)',
                    backdropFilter: 'blur(40px)',
                    WebkitBackdropFilter: 'blur(40px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.05), 0 20px 50px -10px rgba(0, 0, 0, 0.5), 0 0 100px -20px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-400/50 to-transparent"></div>
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                    <div className="flex items-center gap-2 text-red-400">
                        <AlertCircle className="w-5 h-5" />
                        <h3 className="text-lg font-semibold text-white">{t('gameCrashed')}</h3>
                    </div>
                    <button className="p-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white transition-colors" onClick={() => setCrashReport(null)}>
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-2 text-sm text-zinc-400 border-b border-white/5">
                    {t('reportSavedTo')}: <span className="text-zinc-300 select-all">{crashReport.path}</span>
                </div>
                <style>{`
                    .crash-report-content::selection {
                        background-color: rgba(255, 191, 186, 0.3);
                        color: #ffbfba;
                    }
                `}</style>
                <pre className="flex-1 overflow-auto p-6 m-0 font-mono text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap break-all select-text crash-report-content">
                    {crashReport.content}
                </pre>
            </div>
        </div>
      )}
    </div>
  );
}
