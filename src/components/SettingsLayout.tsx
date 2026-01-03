import React from 'react';
import { motion } from 'framer-motion';
import styles from './SettingsLayout.module.css';
import { cn } from '@/lib/utils';

interface SettingsPageProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ title, subtitle, icon, children, className }) => {
    return (
        <div className={cn(styles.container, className)}>
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={styles.content}
            >
                <div className={styles.header}>
                    {icon && (
                        <div className={styles.iconWrapper}>
                            {icon}
                        </div>
                    )}
                    <div>
                        <h1 className={styles.title}>{title}</h1>
                        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
                    </div>
                </div>
                {children}
            </motion.div>
        </div>
    );
};

interface SettingsSectionProps {
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, icon, children }) => {
    return (
        <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
                {icon && <span className={styles.sectionIcon}>{icon}</span>}
                {title}
            </h2>
            {children}
        </section>
    );
};

interface SettingsCardProps {
    children: React.ReactNode;
    className?: string;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({ children, className }) => {
    return (
        <div className={cn(styles.card, className)}>
            {children}
        </div>
    );
};

export { styles as settingsStyles };
