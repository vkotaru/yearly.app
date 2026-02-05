import styles from './CategoryFilter.module.css';

interface Props {
  categories: string[];
  activeCategory: string | null;
  onSelect: (category: string | null) => void;
}

export default function CategoryFilter({ categories, activeCategory, onSelect }: Props) {
  if (categories.length === 0) return null;

  return (
    <div className={styles.filterBar}>
      <span className={styles.label}>Filter:</span>
      <button
        className={`${styles.chip} ${activeCategory === null ? styles.active : ''}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat}
          className={`${styles.chip} ${activeCategory === cat ? styles.active : ''}`}
          onClick={() => onSelect(activeCategory === cat ? null : cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
