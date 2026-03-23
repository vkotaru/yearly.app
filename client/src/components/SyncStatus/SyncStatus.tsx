import { useState, useEffect, useCallback } from 'react';
import { isOnline, onConnectivityChange, getPendingSyncCount } from '../../lib/sync';
import styles from './SyncStatus.module.css';

export default function SyncStatus() {
  const [online, setOnline] = useState(isOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Track online/offline
  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  // Poll pending sync count (lightweight — just a Dexie count query)
  useEffect(() => {
    const update = () => getPendingSyncCount().then(setPendingCount).catch(() => {});
    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listen for conflict events (dispatched by sync engine)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setConflictMessage(detail?.message || 'Server updated — your changes were overwritten');
      setTimeout(() => setConflictMessage(null), 5000);
    };
    window.addEventListener('sync-conflict', handler);
    return () => window.removeEventListener('sync-conflict', handler);
  }, []);

  const dotClass = !online
    ? styles.offline
    : pendingCount > 0
      ? styles.syncing
      : styles.online;

  const title = !online
    ? 'Offline — changes saved locally'
    : pendingCount > 0
      ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`
      : 'Connected';

  return (
    <>
      <div className={styles.container} title={title}>
        <span className={`${styles.dot} ${dotClass}`} />
        {pendingCount > 0 && (
          <span className={styles.pendingCount}>{pendingCount}</span>
        )}
        {!online && <span className={styles.label}>Offline</span>}
      </div>

      {conflictMessage && (
        <div className={styles.conflictToast}>{conflictMessage}</div>
      )}
    </>
  );
}
