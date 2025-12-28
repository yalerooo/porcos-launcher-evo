import React from 'react';
import { motion } from 'framer-motion';
import { Home, Settings, Terminal, LogOut, Box } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
    activePage: string;
    setActivePage: (page: string) => void;
    onLogout: () => void;
    userProfile: {
        username: string;
        skinUrl?: string;
    };
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, setActivePage, onLogout, userProfile }) => {
    const menuItems = [
        { id: 'home', icon: Home, label: 'Inicio' },
        { id: 'instances', icon: Box, label: 'Instancias' },
        { id: 'settings', icon: Settings, label: 'Ajustes' },
        { id: 'console', icon: Terminal, label: 'Consola' },
    ];

    return (
        <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="h-full w-[80px] flex flex-col items-center py-6 z-40"
        >
            {/* Floating Glass Dock Container */}
            <div className="flex-1 flex flex-col items-center w-full max-w-[60px] glass-panel rounded-2xl py-4 mb-4">
                
                {/* Logo */}
                <div className="mb-8 w-10 h-10 rounded-xl bg-cover bg-center shadow-lg transition-transform hover:scale-105 cursor-pointer"
                     style={{ backgroundImage: 'url(/pigimage.png)' }}
                >
                </div>

                {/* Navigation Items */}
                <div className="flex-1 flex flex-col gap-6 w-full items-center justify-center">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activePage === item.id;
                        
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActivePage(item.id)}
                                className="relative group flex items-center justify-center"
                            >
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                                    isActive 
                                        ? "bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                                        : "text-white/50 hover:text-white hover:bg-white/10"
                                )}>
                                    <Icon className="w-5 h-5" strokeWidth={2} />
                                </div>
                                
                                {/* Active Indicator Dot */}
                                {isActive && (
                                    <motion.div 
                                        layoutId="activeDot"
                                        className="absolute -left-2 w-1 h-1 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                                    />
                                )}

                                {/* Tooltip */}
                                <div className="absolute left-full ml-4 px-3 py-1.5 glass-panel text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-[100] translate-x-2 group-hover:translate-x-0 duration-200">
                                    {item.label}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* User Avatar */}
                <div className="mt-auto pt-4 border-t border-white/10 w-full flex flex-col items-center gap-4">
                    <button
                        onClick={onLogout}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 group relative"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                    
                    <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-white/10 shadow-lg">
                         <img
                            src={userProfile.skinUrl || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userProfile.username}`}
                            alt={userProfile.username}
                            className="w-full h-full object-cover"
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

