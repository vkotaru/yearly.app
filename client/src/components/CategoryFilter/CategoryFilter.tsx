import { useSettings } from '../../contexts/SettingsContext';
import styles from './CategoryFilter.module.css';

interface Props {
  categories: string[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryFilter({ categories, activeCategory, onSelect }: Props) {
  const { settings, updateSettings } = useSettings();
  const backgroundCategories = settings.backgroundCategories || [];

  if (categories.length === 0) return null;

  function toggleBackground(cat: string, e: React.MouseEvent) {
    e.stopPropagation();
    const isBackground = backgroundCategories.includes(cat);
    if (isBackground) {
      updateSettings({
        backgroundCategories: backgroundCategories.filter(c => c !== cat)
      });
    } else {
      updateSettings({
        backgroundCategories: [...backgroundCategories, cat]
      });
    }
  }

  return (
    <div className={styles.filterBar}>
      <span className={styles.label}>Filter:</span>
      <button
        className={`${styles.chip} ${activeCategory === null ? styles.active : ''}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map(cat => {
        const isBackground = backgroundCategories.includes(cat);
        return (
          <button
            key={cat}
            className={`${styles.chip} ${activeCategory === cat ? styles.active : ''} ${isBackground ? styles.background : ''}`}
            onClick={() => onSelect(activeCategory === cat ? null : cat)}
          >
            {cat}
            <span
              className={`${styles.bgToggle} ${isBackground ? styles.bgActive : ''}`}
              onClick={(e) => toggleBackground(cat, e)}
              title={isBackground ? 'Show as regular entry' : 'Mark as background (subtle)'}
            >
              B
            </span>
          </button>
        );
      })}
    </div>
  );
}
