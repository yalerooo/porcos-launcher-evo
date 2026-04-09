import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, AlertTriangle, Sparkles } from 'lucide-react';
import styles from './DependencySelectModal.module.css';

export interface DependencyItem {
    id: string;
    source: 'modrinth' | 'curseforge';
    name: string;
    icon?: string;
    type: 'required' | 'optional';
}

interface DependencySelectModalProps {
    isOpen: boolean;
    dependencies: DependencyItem[];
    onConfirm: (selectedIds: string[]) => void;
    onCancel: () => void;
}

const DependencySelectModal: React.FC<DependencySelectModalProps> = ({
    isOpen,
    dependencies,
    onConfirm,
    onCancel,
}) => {
    const [selected, setSelected] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        dependencies.forEach(dep => {
            if (dep.type === 'required') initial.add(dep.id);
        });
        return initial;
    });

    // Reset selection when dependencies change
    React.useEffect(() => {
        const initial = new Set<string>();
        dependencies.forEach(dep => {
            if (dep.type === 'required') initial.add(dep.id);
        });
        setSelected(initial);
    }, [dependencies]);

    if (!isOpen || dependencies.length === 0) return null;

    const requiredDeps = dependencies.filter(d => d.type === 'required');
    const optionalDeps = dependencies.filter(d => d.type === 'optional');
    const selectedCount = selected.size;

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        setSelected(new Set(dependencies.map(d => d.id)));
    };

    const deselectOptional = () => {
        setSelected(new Set(requiredDeps.map(d => d.id)));
    };

    return (
        <div className={styles.overlay} onClick={onCancel}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <h3 className={styles.title}>Dependencias encontradas</h3>
                    <p className={styles.subtitle}>
                        Se encontraron {dependencies.length} dependencia{dependencies.length !== 1 ? 's' : ''} faltante{dependencies.length !== 1 ? 's' : ''}. Selecciona las que quieres instalar.
                    </p>
                </div>

                <div className={styles.actions}>
                    <button className={styles.actionButton} onClick={selectAll}>Seleccionar todas</button>
                    {optionalDeps.length > 0 && (
                        <button className={styles.actionButton} onClick={deselectOptional}>Solo requeridas</button>
                    )}
                </div>

                <div className={styles.list}>
                    {requiredDeps.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <AlertTriangle size={14} />
                                <span>Requeridas ({requiredDeps.length})</span>
                            </div>
                            {requiredDeps.map(dep => (
                                <label key={dep.id} className={styles.depItem}>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(dep.id)}
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
                                        <div className={styles.depMeta}>
                                            <span className={`${styles.badge} ${styles.badgeRequired}`}>Requerida</span>
                                            <span className={`${styles.badge} ${styles.badgeSource}`}>{dep.source}</span>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}

                    {optionalDeps.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Sparkles size={14} />
                                <span>Opcionales ({optionalDeps.length})</span>
                            </div>
                            {optionalDeps.map(dep => (
                                <label key={dep.id} className={styles.depItem}>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(dep.id)}
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
                                        <div className={styles.depMeta}>
                                            <span className={`${styles.badge} ${styles.badgeOptional}`}>Opcional</span>
                                            <span className={`${styles.badge} ${styles.badgeSource}`}>{dep.source}</span>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelButton} onClick={onCancel}>
                        Cancelar
                    </button>
                    <button
                        className={styles.confirmButton}
                        onClick={() => onConfirm(Array.from(selected))}
                        disabled={selectedCount === 0}
                    >
                        Instalar seleccionadas ({selectedCount})
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default DependencySelectModal;
