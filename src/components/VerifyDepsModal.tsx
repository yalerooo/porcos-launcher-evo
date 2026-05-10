import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, Check, AlertTriangle, X, Play, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSourceConfig } from '@/types/modTypes';
import { useI18n } from '@/i18n';
import styles from './VerifyDepsModal.module.css';

interface DependencyItem {
  id: string;
  source: 'modrinth' | 'curseforge';
  name: string;
  icon?: string;
  type: 'required' | 'optional';
}

interface VerifyDepsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVerifying: boolean;
  status: string;
  deps: DependencyItem[];
  isInstalling: boolean;
  installStatus: string;
  onStartVerify: () => void;
  onInstallDeps: (selectedIds: string[]) => void;
}

const VerifyDepsModal: React.FC<VerifyDepsModalProps> = memo(({
  isOpen,
  onClose,
  isVerifying,
  status,
  deps,
  isInstalling,
  installStatus,
  onStartVerify,
  onInstallDeps,
}) => {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    deps.forEach(dep => {
      if (dep.type === 'required') initial.add(dep.id);
    });
    return initial;
  });

  if (!isOpen) return null;

  const requiredDeps = deps.filter(d => d.type === 'required');
  const optionalDeps = deps.filter(d => d.type === 'optional');

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(deps.map(d => d.id)));
  };

  const deselectOptional = () => {
    setSelectedIds(new Set(requiredDeps.map(d => d.id)));
  };

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
            <ShieldCheck size={20} className={styles.headerIcon} />
            <h2>{t('verifyDependencies')}</h2>
          </div>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {isVerifying || isInstalling ? (
            <div className={styles.verifyingState}>
              <Loader2 size={48} className={cn(styles.spinner, "animate-spin")} />
              <p className={styles.statusText}>{isInstalling ? installStatus : (status || t('verifying'))}</p>
            </div>
          ) : deps.length > 0 ? (
            <div className={styles.depsState}>
              <div className={styles.depsHeader}>
                <AlertTriangle size={20} className={styles.warningIcon} />
                <span>{t('missingDependencies', { count: deps.length })}</span>
              </div>

              <div className={styles.depsActions}>
                <button onClick={selectAll} className={styles.smallButton}>{t('all')}</button>
                {optionalDeps.length > 0 && (
                  <button onClick={deselectOptional} className={styles.smallButton}>{t('requiredOnly')}</button>
                )}
              </div>

              <div className={styles.depsList}>
                {requiredDeps.length > 0 && (
                  <div className={styles.depSection}>
                    <div className={styles.depSectionHeader}>
                      <AlertTriangle size={12} />
                      <span>{t('required')} ({requiredDeps.length})</span>
                    </div>
                    {requiredDeps.map(dep => {
                      const sourceConfig = getSourceConfig(dep.source);
                      return (
                        <label key={dep.id} className={styles.depItem}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(dep.id)}
                            onChange={() => toggle(dep.id)}
                            className={styles.checkbox}
                          />
                          <div className={styles.depIcon}>
                            {dep.icon ? (
                              <img src={dep.icon} alt={dep.name} />
                            ) : (
                              <Package size={20} />
                            )}
                          </div>
                          <div className={styles.depInfo}>
                            <span className={styles.depName}>{dep.name}</span>
                            <span className={styles.depSource} style={{ color: sourceConfig.color }}>
                              {sourceConfig.label}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {optionalDeps.length > 0 && (
                  <div className={styles.depSection}>
                    <div className={styles.depSectionHeader}>
                      <span>{t('optional')} ({optionalDeps.length})</span>
                    </div>
                    {optionalDeps.map(dep => {
                      const sourceConfig = getSourceConfig(dep.source);
                      return (
                        <label key={dep.id} className={styles.depItem}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(dep.id)}
                            onChange={() => toggle(dep.id)}
                            className={styles.checkbox}
                          />
                          <div className={styles.depIcon}>
                            {dep.icon ? (
                              <img src={dep.icon} alt={dep.name} />
                            ) : (
                              <Package size={20} />
                            )}
                          </div>
                          <div className={styles.depInfo}>
                            <span className={styles.depName}>{dep.name}</span>
                            <span className={styles.depSource} style={{ color: sourceConfig.color }}>
                              {sourceConfig.label}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.successState}>
              <Check size={48} className={styles.successIcon} />
              <p className={styles.successTitle}>{t('verificationComplete')}</p>
              <p className={styles.successText}>{t('allDependenciesInstalled')}</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button onClick={onClose} className={styles.cancelButton}>
            {deps.length > 0 ? t('cancel') : t('close')}
          </button>
          {deps.length > 0 && !isVerifying && !isInstalling && (
            <button
              onClick={() => onInstallDeps(Array.from(selectedIds))}
              disabled={selectedIds.size === 0}
              className={styles.installButton}
            >
              {t('install')} ({selectedIds.size})
            </button>
          )}
          {deps.length === 0 && !isVerifying && !isInstalling && (
            <button onClick={onStartVerify} className={styles.startButton}>
              <Play size={16} />
              {t('verifyAgain')}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
});

VerifyDepsModal.displayName = 'VerifyDepsModal';

export default VerifyDepsModal;