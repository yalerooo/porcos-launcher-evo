import React, { useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { motion } from 'framer-motion';
import { Terminal, Trash2 } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

const LINE_HEIGHT = 20;
const OVERSCAN_COUNT = 5;

interface LogRow {
    timestamp: string;
    message: string;
    className: string;
}

interface RowData {
    logs: LogRow[];
}

interface RowProps {
    index: number;
    style: React.CSSProperties;
    data: RowData;
}

const LogRow: React.FC<RowProps> = React.memo(({ index, style, data }) => {
    const log = data.logs[index];
    return (
        <div style={style} className="break-all hover:bg-white/5 px-1 rounded transition-colors flex font-mono text-xs">
            <span className="text-gray-500 mr-2 flex-shrink-0">{log.timestamp}</span>
            <span className={log.className}>{log.message}</span>
        </div>
    );
});

LogRow.displayName = 'LogRow';

const Console: React.FC = () => {
    const { t } = useI18n();
    const consoleOutput = useLauncherStore(state => state.consoleOutput);
    const logCount = useLauncherStore(state => state.logCount);
    const clearLogs = useLauncherStore(state => state.clearLogs);

    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<List>(null);
    const prevLogCountRef = useRef(0);
    const autoScrollRef = useRef(true);

    // Parse logs into structured data
    const parsedLogs: LogRow[] = consoleOutput.map(line => {
        const timestamp = line.split(']')[0] + ']';
        const message = line.split(']').slice(1).join(']');
        let className = 'text-[var(--success)]';
        if (line.toLowerCase().includes('error')) {
            className = 'text-[var(--danger)]';
        } else if (line.toLowerCase().includes('warn')) {
            className = 'text-yellow-400';
        }
        return { timestamp, message, className };
    });

    // Auto-scroll when new logs are added
    useEffect(() => {
        if (logCount > prevLogCountRef.current) {
            prevLogCountRef.current = logCount;
            if (autoScrollRef.current && listRef.current) {
                listRef.current.scrollToItem(parsedLogs.length - 1, 'end');
            }
        }
    }, [logCount, parsedLogs.length]);

    const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
        if (scrollUpdateWasRequested || !containerRef.current) return;

        const maxScroll = containerRef.current.scrollHeight - containerRef.current.clientHeight;
        autoScrollRef.current = maxScroll - scrollOffset < 50;
    }, []);

    const rowData: RowData = { logs: parsedLogs };

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
                        <span className="font-mono text-sm font-bold">{t('consoleTitle')}</span>
                        <span className="text-xs opacity-50">({consoleOutput.length} lines)</span>
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

                {/* Logs - Virtualized */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden bg-[var(--bg-primary)]/50"
                >
                    {parsedLogs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[var(--text-secondary)] italic">
                            {t('waitingLogs')}
                        </div>
                    ) : (
                        <List
                            ref={listRef}
                            height={containerRef.current?.clientHeight || 400}
                            width="100%"
                            itemCount={parsedLogs.length}
                            itemSize={LINE_HEIGHT}
                            itemData={rowData}
                            overscanCount={OVERSCAN_COUNT}
                            onScroll={handleScroll}
                        >
                            {LogRow}
                        </List>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default Console;