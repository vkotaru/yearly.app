import YearGrid from './components/YearGrid/YearGrid';
import styles from './App.module.css';

const YEAR = 2026;

export default function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>{YEAR} Yearly Planner</h1>
      </header>
      <main>
        <YearGrid year={YEAR} />
      </main>
    </div>
  );
}
