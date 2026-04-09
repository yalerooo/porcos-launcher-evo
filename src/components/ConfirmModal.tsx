import React from 'react';
import { motion } from 'framer-motion';
import styles from './ConfirmModal.module.css';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false,
    onConfirm,
    onCancel,
}) => {
    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onCancel}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={styles.modal}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className={styles.title}>{title}</h3>
                <p className={styles.message}>{message}</p>
                <div className={styles.buttons}>
                    <button className={styles.cancelButton} onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        className={cn(styles.confirmButton, danger && styles.dangerButton)}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default ConfirmModal;
