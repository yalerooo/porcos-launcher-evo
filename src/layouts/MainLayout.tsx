import React, { useEffect, useState, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Home, Box, Settings, Terminal, LogOut, Minus, X, AlertCircle, Square, Copy, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from '../pages/Home.module.css';
import { useLauncherStore } from '@/stores/launcherStore';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '@/i18n';
import PlayerSkinPopover from '@/components/PlayerSkinPopover';

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
  const [isSkinPopoverOpen, setIsSkinPopoverOpen] = useState(false);
  const [skinRefreshKey, setSkinRefreshKey] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string>(`https://api.mcheads.org/head/${userProfile.uuid}/40`);
  const [crashReport, setCrashReport] = useState<{ path: string; content: string } | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const navItems = [
    { id: 'home', label: t('home'), icon: Home },
    { id: 'instances', label: t('instances'), icon: Box },
    { id: 'mods', label: t('mods'), icon: Puzzle },
    { id: 'settings', label: t('settings'), icon: Settings },
    { id: 'console', label: t('console'), icon: Terminal },
  ];

  useEffect(() => {
    setSkinRefreshKey(Date.now());
  }, []);

  useEffect(() => {
    setAvatarUrl(`https://api.mcheads.org/head/${userProfile.uuid}/40?t=${skinRefreshKey}`);
  }, [userProfile.uuid, skinRefreshKey]);

  // Track window maximized state
  useEffect(() => {
    const updateMaximized = async () => {
      try {
        const tauriMax = await appWindow.isMaximized();
        const isScreenFilled = window.outerWidth >= window.screen.availWidth && window.outerHeight >= window.screen.availHeight;
        setIsMaximized(tauriMax || isScreenFilled);
      } catch {
        // fallback
        const isScreenFilled = window.outerWidth >= window.screen.availWidth && window.outerHeight >= window.screen.availHeight;
        setIsMaximized(isScreenFilled);
      }
    };

    updateMaximized();
    window.addEventListener('resize', updateMaximized);
    return () => window.removeEventListener('resize', updateMaximized);
  }, [appWindow]);

  return (
    <div className="launcher-container flex h-screen overflow-hidden bg-[var(--bg-secondary)]" data-maximized={isMaximized}>
      
      {/* Sidebar */}
      <aside className="flex-shrink-0 h-full w-[65px] hover:w-[240px] z-50 flex flex-col gap-3 bg-[var(--bg-secondary)] transition-all duration-300 ease-in-out group/sidebar pt-8">
        
        {/* User Profile */}
        <div className={`px-0 group-hover/sidebar:px-3 transition-all duration-300 w-full ${styles.userProfileContainer}`}>
             <div
               ref={avatarRef}
               className="flex items-center w-full py-1 px-0 rounded-[20px] hover:bg-white/5 transition-colors cursor-pointer group/profile relative overflow-hidden whitespace-nowrap justify-start"
               onClick={() => setIsSkinPopoverOpen(true)}
             >
                 <div className="min-w-[65px] h-[40px] relative flex items-center justify-center">
                    <div className="w-[40px] h-[40px] rounded-xl overflow-hidden transition-all ring-2 ring-transparent hover:ring-[#ffbfba] hover:ring-offset-2 hover:ring-offset-[#18181b]">
                        {avatarUrl ? (
                            <img
                                key={skinRefreshKey}
                                src={avatarUrl}
                                alt={userProfile.username}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-[#27272a]" />
                        )}
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
          <main
            className="content-area flex-1 overflow-hidden bg-[var(--bg-primary)] relative"
            style={{ borderTopLeftRadius: isMaximized ? 0 : 30 }}
          >
            <div className="w-full h-full overflow-hidden">
              {children}
            </div>
          </main>
      </div>

      {/* Global Crash Report Modal */}
      {crashReport && (
        <div 
            className="fixed top-[56px] right-0 bottom-0 left-[65px] z-[100] flex items-center justify-center p-8"
            style={{
                borderTopLeftRadius: isMaximized ? 0 : 30,
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

      {/* Skin Popover */}
      <PlayerSkinPopover
        isOpen={isSkinPopoverOpen}
        onClose={() => setIsSkinPopoverOpen(false)}
        onSkinChanged={() => setSkinRefreshKey(Date.now())}
        triggerRef={avatarRef}
      />
    </div>
  );
}
