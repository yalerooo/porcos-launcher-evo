import React, { memo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ModSource } from '@/types/modTypes';
import { useI18n } from '@/i18n';
import styles from './ModsFilterBar.module.css';

export type InstalledFilterStatus = 'all' | 'enabled' | 'disabled';
export type InstalledFilterUpdate = 'all' | 'updated' | 'has_update';
export type InstalledFilterSource = 'all' | ModSource;

export interface FilterState {
  search: string;
  source: InstalledFilterSource;
  status: InstalledFilterStatus;
  update: InstalledFilterUpdate;
}

interface ModsFilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  counts?: {
    total: number;
    enabled: number;
    disabled: number;
    updates: number;
  };
}

const ModsFilterBar: React.FC<ModsFilterBarProps> = memo(({
  filters,
  onFiltersChange,
  counts,
}) => {
  const { t } = useI18n();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const SOURCE_OPTIONS: { value: InstalledFilterSource; label: string; icon: string }[] = [
    { value: 'all', label: t('all'), icon: '✦' },
    { value: 'modrinth', label: t('modrinth'), icon: 'MR' },
    { value: 'curseforge', label: t('curseforge'), icon: 'CF' },
    { value: 'local', label: t('local'), icon: '✦' },
  ];

  const STATUS_OPTIONS: { value: InstalledFilterStatus; label: string }[] = [
    { value: 'all', label: t('all') },
    { value: 'enabled', label: t('enabled') },
    { value: 'disabled', label: t('disabled') },
  ];

  const UPDATE_OPTIONS: { value: InstalledFilterUpdate; label: string }[] = [
    { value: 'all', label: t('all') },
    { value: 'updated', label: t('updated') },
    { value: 'has_update', label: t('hasUpdate') },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({ search: '', source: 'all', status: 'all', update: 'all' });
  };

  const hasActiveFilters = filters.search || filters.source !== 'all' || filters.status !== 'all' || filters.update !== 'all';

  return (
    <div className={styles.container} ref={dropdownRef}>
      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          placeholder={t('searchInstalledMods')}
          className={styles.searchInput}
        />
        {filters.search && (
          <button
            onClick={() => handleFilterChange('search', '')}
            className={styles.clearSearchButton}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.filtersRow}>
        <FilterDropdown
          label={t('source')}
          value={filters.source}
          options={SOURCE_OPTIONS}
          icon={SOURCE_OPTIONS.find(o => o.value === filters.source)?.icon || '✦'}
          isOpen={openDropdown === 'source'}
          onToggle={() => setOpenDropdown(openDropdown === 'source' ? null : 'source')}
          onChange={(value) => {
            handleFilterChange('source', value as InstalledFilterSource);
            setOpenDropdown(null);
          }}
        />

        <FilterDropdown
          label={t('status')}
          value={filters.status}
          options={STATUS_OPTIONS}
          isOpen={openDropdown === 'status'}
          onToggle={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
          onChange={(value) => {
            handleFilterChange('status', value as InstalledFilterStatus);
            setOpenDropdown(null);
          }}
          badge={counts ? `${counts.enabled}/${counts.total}` : undefined}
        />

        <FilterDropdown
          label={t('updates')}
          value={filters.update}
          options={UPDATE_OPTIONS}
          isOpen={openDropdown === 'update'}
          onToggle={() => setOpenDropdown(openDropdown === 'update' ? null : 'update')}
          onChange={(value) => {
            handleFilterChange('update', value as InstalledFilterUpdate);
            setOpenDropdown(null);
          }}
          badge={counts?.updates ? `${counts.updates}` : undefined}
          badgeColor="#ef4444"
        />

        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearAllButton}>
            <X size={14} />
            {t('clear')}
          </button>
        )}
      </div>
    </div>
  );
});

ModsFilterBar.displayName = 'ModsFilterBar';

interface FilterDropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string; icon?: string }[];
  icon?: string;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  badge?: string;
  badgeColor?: string;
}

const FilterDropdown: React.FC<FilterDropdownProps> = memo(({
  label,
  value,
  options,
  icon,
  isOpen,
  onToggle,
  onChange,
  badge,
  badgeColor,
}) => {
  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={styles.filterDropdownContainer}>
      <button
        className={cn(styles.filterButton, isOpen && styles.filterButtonActive)}
        onClick={onToggle}
      >
        {icon && <span className={styles.filterIcon}>{icon}</span>}
        <span className={styles.filterLabel}>{selectedOption?.label || label}</span>
        {badge && (
          <span
            className={styles.filterBadge}
            style={badgeColor ? { backgroundColor: badgeColor } : undefined}
          >
            {badge}
          </span>
        )}
        <ChevronDown size={14} className={cn(styles.filterChevron, isOpen && styles.filterChevronOpen)} />
      </button>

      {isOpen && (
        <div className={styles.dropdownMenu}>
          {options.map((option) => (
            <button
              key={option.value}
              className={cn(
                styles.dropdownItem,
                value === option.value && styles.dropdownItemActive
              )}
              onClick={() => onChange(option.value)}
            >
              {option.icon && <span className={styles.dropdownIcon}>{option.icon}</span>}
              <span>{option.label}</span>
              {value === option.value && <Check size={14} className={styles.dropdownCheck} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

FilterDropdown.displayName = 'FilterDropdown';

export default ModsFilterBar;