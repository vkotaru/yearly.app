import { useSettings } from '../../contexts/SettingsContext';
import { useEntries } from '../../contexts/EntriesContext';
import ViewSwitcher from '../shared/ViewSwitcher';
import CategoryFilter from '../CategoryFilter/CategoryFilter';
import YearGridView from './YearGridView/YearGridView';
import WeekYearView from './WeekYearView/WeekYearView';
import MonthView from './MonthView/MonthView';
import ListView from './ListView/ListView';
import styles from './ViewContainer.module.css';

interface Props {
  year: number;
}

export default function ViewContainer({ year }: Props) {
  const { settings } = useSettings();
  const { categories, activeCategory, setActiveCategory } = useEntries();

  function renderView() {
    switch (settings.viewMode) {
      case 'year-grid':
        return <YearGridView year={year} />;
      case 'week-year':
        return <WeekYearView year={year} />;
      case 'month':
        return <MonthView year={year} />;
      case 'list':
        return <ListView year={year} />;
      default:
        return <YearGridView year={year} />;
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <ViewSwitcher />
        <div className={styles.divider} />
        <CategoryFilter
          categories={categories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
        />
      </div>
      <div className={styles.viewArea}>
        {renderView()}
      </div>
    </div>
  );
}
