import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Check, Loader2, Download, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import styles from './UpdatesModal.module.css';

interface UpdateItem {
  id: string;
  name: string;
  icon?: string;
  source: 'modrinth' | 'curseforge' | 'local' | 'porcos';
  currentVersion: string;
  newVersion: string;
}

interface UpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  updates: Map<string, UpdateItem>;
  onUpdate: (id: string) => void;
  onUpdateAll: () => void;
  onDismiss: (id: string) => void;
  isUpdatingAll: boolean;
}

const UpdatesModal: React.FC<UpdatesModalProps> = memo(({
  isOpen,
  onClose,
  updates,
  onUpdate,
  onUpdateAll,
  onDismiss,
  isUpdatingAll,
}) => {
  const { t } = useI18n();
  const updatesList = useMemo(() => Array.from(updates.values()), [updates]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <RefreshCw size={20} className={styles.headerIcon} />
            <h2>{t('availableUpdates')}</h2>
            {updates.size > 0 && (
              <span className={styles.countBadge}>{updates.size}</span>
            )}
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {updatesList.length > 0 ? (
            <div className={styles.updatesList}>
              {updatesList.map((update) => (
                <div key={update.id} className={styles.updateItem}>
                  <div className={styles.updateIcon}>
                    {update.icon ? (
                      <img src={update.icon} alt={update.name} />
                    ) : (
                      <span>{update.name.charAt(0)}</span>
                    )}
                  </div>

                  <div className={styles.updateInfo}>
                    <div className={styles.updateName}>{update.name}</div>
                    <div className={styles.updateMeta}>
                      <span className={styles.updateSource}>
                        {update.source === 'modrinth' ? t('modrinth') : update.source === 'curseforge' ? t('curseforge') : update.source}
                      </span>
                      <span className={styles.updateVersions}>
                        v{update.currentVersion} → <span className={styles.newVersion}>v{update.newVersion}</span>
                      </span>
                    </div>
                  </div>

                  <div className={styles.updateActions}>
                    <button
                      onClick={() => onUpdate(update.id)}
                      disabled={isUpdatingAll}
                      className={styles.updateButton}
                      title={t('update')}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={() => onDismiss(update.id)}
                      className={styles.dismissButton}
                      title={t('dismiss')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Check size={48} className={styles.emptyIcon} />
              <p>{t('allUpToDate')}</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelButton}>
            {t('close')}
          </button>
          {updatesList.length > 0 && (
            <button
              onClick={onUpdateAll}
              disabled={isUpdatingAll}
              className={styles.updateAllButton}
            >
              {isUpdatingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('updating')}
                </>
              ) : (
                <>
                  <Download size={16} />
                  {t('updateAll')}
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
});

UpdatesModal.displayName = 'UpdatesModal';

export default UpdatesModal;