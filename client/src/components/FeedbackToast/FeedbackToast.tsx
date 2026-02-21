import { useEffect } from 'react';
import { useHistory } from '../../contexts/HistoryContext';
import styles from './FeedbackToast.module.css';

export default function FeedbackToast() {
  const { lastToastMessage, clearToast } = useHistory();

  useEffect(() => {
    if (lastToastMessage) {
      const timer = setTimeout(() => {
        clearToast();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [lastToastMessage, clearToast]);

  if (!lastToastMessage) return null;

  return (
    <div className={styles.toast}>
      {lastToastMessage}
    </div>
  );
}
