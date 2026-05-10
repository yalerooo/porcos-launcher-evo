import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Trash2, Power, Check, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import styles from './ModCard.module.css';

interface ModCardProps {
  id: string;
  name: string;
  description: string;
  author: string;
  icon?: string;
  downloads?: string;
  source: 'modrinth' | 'curseforge' | 'local' | 'porcos';
  version?: string;
  hasUpdate?: boolean;
  updateInfo?: {
    currentVersion: string;
    newVersion: string;
  };
  isInstalled: boolean;
  isEnabled: boolean;
  isInstalling?: boolean;
  onSelect: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: () => void;
}

const ModCard: React.FC<ModCardProps> = memo(({
  name,
  description,
  author,
  icon,
  downloads,
  version,
  hasUpdate,
  updateInfo,
  isInstalled,
  isEnabled,
  isInstalling,
  onSelect,
  onInstall,
  onUninstall,
  onToggle,
}) => {
  const { t } = useI18n();
  const [imageError, setImageError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        styles.card,
        !isEnabled && styles.cardDisabled,
        isInstalled && styles.cardInstalled
      )}
      onClick={onSelect}
    >
      <div className={styles.iconContainer}>
        {icon && !imageError ? (
          <img
            src={icon}
            alt={name}
            className={styles.icon}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={styles.iconPlaceholder}>
            <span className={styles.iconText}>{name.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{name}</h3>
          </div>
          <span className={styles.author}>by {author}</span>
        </div>

        <p className={styles.description}>{description}</p>

        <div className={styles.footer}>
          <div className={styles.meta}>
            {downloads && (
              <span className={styles.stat}>
                <Download size={12} />
                {downloads}
              </span>
            )}
            {version && (
              <span className={styles.version}>
                v{version}
              </span>
            )}
            {hasUpdate && updateInfo && (
              <span className={styles.updateInfo}>
                → v{updateInfo.newVersion}
              </span>
            )}
          </div>

          <div className={styles.actions}>
            {isInstalled && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  className={cn(
                    styles.actionButton,
                    styles.actionButtonLarge,
                    !isEnabled ? styles.actionEnabled : styles.actionDisabled
                  )}
                  title={isEnabled ? t('disable') : t('enable')}
                >
                  <Power size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUninstall();
                  }}
                  className={cn(styles.actionButton, styles.actionButtonLarge, styles.actionDanger)}
                  title={t('uninstall')}
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onInstall();
              }}
              disabled={isInstalling || (isInstalled && !hasUpdate)}
              className={cn(
                styles.installButton,
                styles.installButtonLarge,
                isInstalled && !hasUpdate && styles.installButtonInstalled,
                hasUpdate && styles.installButtonUpdate,
                !isEnabled && styles.installButtonDisabled
              )}
            >
              {isInstalling ? (
                <Loader2 size={16} className="animate-spin" />
              ) : hasUpdate ? (
                <>
                  <RefreshCw size={16} />
                  {t('update')}
                </>
              ) : isInstalled ? (
                <>
                  <Check size={16} />
                  {isEnabled ? t('installed') : t('disabled')}
                </>
              ) : (
                <>
                  <Download size={16} />
                  {t('install')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

ModCard.displayName = 'ModCard';

export default ModCard;