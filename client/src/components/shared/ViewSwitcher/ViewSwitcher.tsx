import { useSettings, type ViewMode } from '../../../contexts/SettingsContext';
import styles from './ViewSwitcher.module.css';

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: string }[] = [
  { mode: 'year-grid', label: 'Year Grid', icon: '▦' },
  { mode: 'week-year', label: 'Week View', icon: '▤' },
  { mode: 'month', label: 'Month', icon: '▣' },
  { mode: 'list', label: 'List', icon: '☰' },
];

export default function ViewSwitcher() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className={styles.switcher}>
      {VIEW_OPTIONS.map(({ mode, label, icon }) => (
        <button
          key={mode}
          className={`${styles.button} ${settings.viewMode === mode ? styles.active : ''}`}
          onClick={() => updateSettings({ viewMode: mode })}
          title={label}
          aria-label={label}
          aria-pressed={settings.viewMode === mode}
        >
          <span className={styles.icon}>{icon}</span>
          <span className={styles.label}>{label}</span>
        </button>
      ))}
    </div>
  );
}
