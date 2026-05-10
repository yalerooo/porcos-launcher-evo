import React, { memo, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Check, ChevronDown, ChevronUp, Loader2, Download, X } from 'lucide-react';
import { getSourceConfig, type ModSource } from '@/types/modTypes';
import styles from './UpdatesPanel.module.css';

interface UpdateItem {
  id: string;
  name: string;
  icon?: string;
  source: ModSource;
  currentVersion: string;
  newVersion: string;
  changelog?: string;
  isUpdating?: boolean;
  isUpdated?: boolean;
}

interface UpdatesPanelProps {
  updates: Map<string, UpdateItem>;
  onUpdate: (id: string) => void;
  onUpdateAll: () => void;
  onDismiss: (id: string) => void;
  isUpdatingAll: boolean;
  totalUpdates: number;
}

const UpdatesPanel: React.FC<UpdatesPanelProps> = memo(({
  updates,
  onUpdate,
  onUpdateAll,
  onDismiss,
  isUpdatingAll,
  totalUpdates,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const updatesList = useMemo(() => Array.from(updates.values()), [updates]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  if (totalUpdates === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <RefreshCw size={18} className={styles.headerIcon} />
            <h3 className={styles.headerTitle}>Updates</h3>
          </div>
          <span className={styles.emptyBadge}>Todo actualizado</span>
        </div>
        <div className={styles.emptyState}>
          <Check size={32} className={styles.emptyIcon} />
          <p>No hay actualizaciones disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <div className={styles.headerLeft}>
          <RefreshCw size={18} className={styles.headerIcon} />
          <h3 className={styles.headerTitle}>Updates</h3>
          <span className={styles.updateCountBadge}>{totalUpdates}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateAll();
            }}
            disabled={isUpdatingAll}
            className={styles.updateAllButton}
          >
            {isUpdatingAll ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <Download size={14} />
                Actualizar todos
              </>
            )}
          </button>
          <button className={styles.expandButton}>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={styles.content}
          >
            <div className={styles.updatesList}>
              {updatesList.map((update) => {
                const isExpanded = expandedItems.has(update.id);
                const sourceConfig = getSourceConfig(update.source);

                return (
                  <div key={update.id} className={styles.updateItem}>
                    <div className={styles.updateMain} onClick={() => toggleExpand(update.id)}>
                      <div className={styles.updateIcon}>
                        {update.icon ? (
                          <img src={update.icon} alt={update.name} />
                        ) : (
                          <span>{update.name.charAt(0)}</span>
                        )}
                      </div>

                      <div className={styles.updateInfo}>
                        <div className={styles.updateHeader}>
                          <span className={styles.updateName}>{update.name}</span>
                          <span
                            className={styles.updateSource}
                            style={{ color: sourceConfig.color }}
                          >
                            {sourceConfig.label}
                          </span>
                        </div>
                        <div className={styles.updateVersions}>
                          <span className={styles.currentVersion}>v{update.currentVersion}</span>
                          <span className={styles.arrow}>→</span>
                          <span className={styles.newVersion}>v{update.newVersion}</span>
                        </div>
                      </div>

                      <div className={styles.updateActions}>
                        {update.isUpdated ? (
                          <span className={styles.updatedBadge}>
                            <Check size={14} />
                            Actualizado
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdate(update.id);
                              }}
                              disabled={update.isUpdating}
                              className={styles.updateButton}
                            >
                              {update.isUpdating ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDismiss(update.id);
                              }}
                              className={styles.dismissButton}
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>

                      {update.changelog && (
                        <button className={styles.expandToggle}>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </div>

                    {isExpanded && update.changelog && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className={styles.changelogSection}
                      >
                        <div className={styles.changelogHeader}>Changelog</div>
                        <div
                          className={styles.changelogContent}
                          dangerouslySetInnerHTML={{ __html: update.changelog }}
                        />
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

UpdatesPanel.displayName = 'UpdatesPanel';

export default UpdatesPanel;