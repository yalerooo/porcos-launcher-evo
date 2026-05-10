import React, { useCallback, useRef, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import { motion } from 'framer-motion';
import { Terminal, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useLauncherStore } from '@/stores/launcherStore';
import { useI18n } from '@/i18n';

const LINE_HEIGHT = 24;
const OVERSCAN_COUNT = 5;

interface LogRow {
    timestamp: string;
    message: string;
    level: 'info' | 'warn' | 'error';
    isContinuation: boolean;
}

interface RowData {
    logs: LogRow[];
}

interface RowProps {
    index: number;
    style: React.CSSProperties;
    data: RowData;
}

const LEVEL_CONFIG = {
    info: {
        badgeBg: 'transparent',
        badgeText: 'var(--ink-subtle)',
        messageText: 'var(--ink)',
        hoverBg: 'var(--surface-2)',
    },
    warn: {
        badgeBg: 'rgba(251, 191, 36, 0.08)',
        badgeText: '#fbbf24',
        messageText: 'rgba(251, 191, 36, 0.9)',
        hoverBg: 'rgba(251, 191, 36, 0.03)',
    },
    error: {
        badgeBg: 'rgba(239, 68, 68, 0.08)',
        badgeText: '#f87171',
        messageText: 'rgba(248, 113, 113, 0.9)',
        hoverBg: 'rgba(239, 68, 68, 0.03)',
    },
};

const LogRow: React.FC<RowProps> = React.memo(({ index, style, data }) => {
    const log = data.logs[index];
    const config = LEVEL_CONFIG[log.level];

    return (
        <div
            style={{
                ...style,
                display: 'flex',
                alignItems: 'flex-start',
                paddingLeft: '16px',
                paddingRight: '16px',
                paddingTop: '3px',
                paddingBottom: '3px',
                minHeight: LINE_HEIGHT,
            }}
            className="group font-mono transition-colors duration-150"
            onMouseEnter={(e) => {
                e.currentTarget.style.background = config.hoverBg;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
            }}
        >
            {/* Timestamp */}
            <span
                className="shrink-0 select-none text-[11px] leading-5 pt-[1px]"
                style={{
                    width: '72px',
                    color: 'var(--ink-tertiary)',
                    visibility: log.isContinuation ? 'hidden' : 'visible',
                }}
            >
                {log.timestamp}
            </span>

            {/* Level Badge */}
            <span
                className="shrink-0 select-none px-1.5 py-0.5 rounded text-[10px] font-medium leading-4 mt-[1px]"
                style={{
                    width: '52px',
                    textAlign: 'center',
                    background: config.badgeBg,
                    color: config.badgeText,
                    visibility: log.isContinuation ? 'hidden' : 'visible',
                }}
            >
                {log.level === 'info' ? '[INFO]' : log.level === 'warn' ? '[WARN]' : '[ERROR]'}
            </span>

            {/* Message */}
            <span
                className="flex-1 select-text leading-5 text-[13px] pl-3 break-all whitespace-pre-wrap"
                style={{ color: config.messageText }}
            >
                {log.message}
            </span>
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
    const [autoScroll, setAutoScroll] = React.useState(true);
    const [copied, setCopied] = React.useState(false);
    const [containerHeight, setContainerHeight] = React.useState(400);

    // Parse logs: fix duplicate timestamp + split multi-line
    const parsedLogs: LogRow[] = React.useMemo(() => {
        const rows: LogRow[] = [];

        consoleOutput.forEach(line => {
            // Extract timestamp: [HH:MM:SS] or HH:MM:SS at start
            const timestampMatch = line.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*/);
            const hasBracketTimestamp = !!timestampMatch;
            const timestamp = timestampMatch ? timestampMatch[1] : '';

            // Remove the extracted timestamp from message
            let rawMessage = hasBracketTimestamp
                ? line.substring(timestampMatch[0].length)
                : line;

            // Also handle case where timestamp appears without brackets at start
            const plainTimestampMatch = rawMessage.match(/^(\d{2}:\d{2}:\d{2})\]\s*/);
            if (plainTimestampMatch) {
                rawMessage = rawMessage.substring(plainTimestampMatch[0].length);
            }

            // Detect level from the full line (before removing timestamp)
            const lowerLine = line.toLowerCase();
            let level: 'info' | 'warn' | 'error' = 'info';
            if (/\berror\b/.test(lowerLine) || /\[error\]/.test(lowerLine) || /exception|fatal|crash/.test(lowerLine)) {
                level = 'error';
            } else if (/\bwarn(?:ing)?\b/.test(lowerLine) || /\[warn\]/.test(lowerLine)) {
                level = 'warn';
            }

            // Split by actual newlines → each physical line is a row
            const lines = rawMessage.split('\n');
            lines.forEach((msg, idx) => {
                if (!msg.trim() && idx > 0) return; // skip empty continuation lines
                rows.push({
                    timestamp: idx === 0 ? timestamp : '',
                    message: msg,
                    level,
                    isContinuation: idx > 0,
                });
            });
        });

        return rows;
    }, [consoleOutput]);

    const copyToClipboard = useCallback(() => {
        const text = parsedLogs
            .map(log => {
                const ts = log.timestamp ? log.timestamp + ' ' : '';
                const badge = log.isContinuation ? '' : `[${log.level.toUpperCase()}] `;
                return ts + badge + log.message;
            })
            .join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [parsedLogs]);

    // Measure container height with ResizeObserver
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateHeight = () => {
            if (el.clientHeight > 0) {
                setContainerHeight(el.clientHeight);
            }
        };

        updateHeight();

        const ro = new ResizeObserver(updateHeight);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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
        setAutoScroll(maxScroll - scrollOffset < 50);
    }, []);

    const rowData: RowData = { logs: parsedLogs };

    return (
        <div className="p-6 w-full h-full flex flex-col">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex flex-col rounded-xl overflow-hidden min-h-0"
                style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--hairline)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-3 shrink-0"
                    style={{
                        background: 'var(--surface-2)',
                        borderBottom: '1px solid var(--hairline)',
                    }}
                >
                    <div className="flex items-center gap-3">
                        {/* Icon */}
                        <div
                            className="flex items-center justify-center w-7 h-7 rounded-md"
                            style={{ background: 'var(--surface-3)' }}
                        >
                            <Terminal className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                        </div>

                        {/* Title */}
                        <span
                            className="font-mono text-sm font-medium tracking-tight"
                            style={{ color: 'var(--ink)' }}
                        >
                            {t('consoleTitle')}
                        </span>

                        {/* Line count badge */}
                        <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                            style={{
                                background: 'var(--surface-3)',
                                color: 'var(--ink-muted)',
                            }}
                        >
                            {parsedLogs.length} lines
                        </span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1.5">
                        {/* Auto-scroll toggle */}
                        <button
                            onClick={() => {
                                const next = !autoScroll;
                                setAutoScroll(next);
                                autoScrollRef.current = next;
                                if (next && listRef.current) {
                                    listRef.current.scrollToItem(parsedLogs.length - 1, 'end');
                                }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                            style={{
                                background: autoScroll ? 'var(--surface-3)' : 'transparent',
                                color: autoScroll ? 'var(--ink)' : 'var(--ink-subtle)',
                                border: '1px solid var(--hairline)',
                            }}
                        >
                            {autoScroll ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Auto-scroll</span>
                        </button>

                        {/* Copy */}
                        <button
                            onClick={copyToClipboard}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150"
                            style={{
                                background: 'transparent',
                                color: copied ? '#27a644' : 'var(--ink-subtle)',
                                border: '1px solid var(--hairline)',
                            }}
                            onMouseEnter={(e) => {
                                if (!copied) {
                                    e.currentTarget.style.background = 'var(--surface-3)';
                                    e.currentTarget.style.color = 'var(--ink)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!copied) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--ink-subtle)';
                                }
                            }}
                            title="Copy all logs"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>

                        {/* Clear */}
                        <button
                            onClick={clearLogs}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150"
                            style={{
                                background: 'transparent',
                                color: 'var(--ink-subtle)',
                                border: '1px solid var(--hairline)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                                e.currentTarget.style.color = '#ef4444';
                                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--ink-subtle)';
                                e.currentTarget.style.borderColor = 'var(--hairline)';
                            }}
                            title="Clear logs"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Logs Area */}
                <div
                    ref={containerRef}
                    className="flex-1 overflow-hidden relative"
                    style={{ background: 'var(--canvas)' }}
                >
                    {parsedLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <Terminal
                                className="w-10 h-10"
                                style={{ color: 'var(--ink-tertiary)', opacity: 0.2 }}
                            />
                            <span
                                className="text-sm italic"
                                style={{ color: 'var(--ink-subtle)', opacity: 0.5 }}
                            >
                                {t('waitingLogs')}
                            </span>
                        </div>
                    ) : (
                        <List
                            ref={listRef}
                            height={containerHeight}
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
