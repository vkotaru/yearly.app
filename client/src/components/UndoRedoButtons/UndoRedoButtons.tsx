import { useHistory } from '../../contexts/HistoryContext';
import styles from './UndoRedoButtons.module.css';

export default function UndoRedoButtons() {
  const { canUndo, canRedo, undo, redo } = useHistory();

  return (
    <div className={styles.container}>
      <button
        className={styles.button}
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>
      <button
        className={styles.button}
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
        </svg>
      </button>
    </div>
  );
}
