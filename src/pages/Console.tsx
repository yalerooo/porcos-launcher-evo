import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, Trash2 } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { Button } from '@/components/ui/button';

const Console: React.FC = () => {
    const { consoleOutput, clearLogs } = useLauncherStore();
    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [consoleOutput]);

    return (
        <div className="p-6 w-full h-full flex flex-col">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="flex-1 flex flex-col glass-panel rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Terminal className="w-4 h-4" />
                        <span className="font-mono text-sm font-bold">Launcher Output</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearLogs}
                        className="text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>

                {/* Logs */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 bg-[var(--bg-primary)]/50"
                >
                    {consoleOutput.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[var(--text-secondary)] italic">
                            Esperando logs...
                        </div>
                    ) : (
                        consoleOutput.map((line, idx) => (
                            <div key={idx} className="break-all hover:bg-white/5 px-1 rounded transition-colors">
                                <span className="text-gray-500 mr-2">{line.split(']')[0]}]</span>
                                <span className={
                                    line.toLowerCase().includes('error') ? 'text-[var(--danger)]' :
                                        line.toLowerCase().includes('warn') ? 'text-yellow-400' :
                                            'text-[var(--success)]'
                                }>
                                    {line.split(']').slice(1).join(']')}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default Console;
