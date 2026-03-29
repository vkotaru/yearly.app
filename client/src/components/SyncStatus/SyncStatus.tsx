import { useState, useEffect, useRef } from 'react';
import {
  isOnline,
  onConnectivityChange,
  getPendingSyncCount,
  getSyncError,
  onSyncErrorChange,
  getFailedSyncCount,
  retryFailedSync,
  getAllPendingSyncRecords,
  type SyncErrorState,
} from '../../lib/sync';
import type { PendingSyncRecord } from '../../lib/db';
import styles from './SyncStatus.module.css';

export default function SyncStatus() {
  const [online, setOnline] = useState(isOnline);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [syncError, setSyncError] = useState<SyncErrorState>(getSyncError);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingRecords, setPendingRecords] = useState<PendingSyncRecord[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  useEffect(() => {
    return onSyncErrorChange(setSyncError);
  }, []);

  // Poll pending + failed sync counts
  useEffect(() => {
    const update = () => {
      getPendingSyncCount().then(setPendingCount).catch(() => {});
      getFailedSyncCount().then(setFailedCount).catch(() => {});
    };
    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load full records when detail panel opens
  useEffect(() => {
    if (!detailOpen) return;
    getAllPendingSyncRecords().then(setPendingRecords).catch(() => {});
    const interval = setInterval(() => {
      getAllPendingSyncRecords().then(setPendingRecords).catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [detailOpen]);

  // Close panel on outside click
  useEffect(() => {
    if (!detailOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDetailOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [detailOpen]);

  // Conflict events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setConflictMessage(detail?.message || 'Server updated — your changes were overwritten');
      setTimeout(() => setConflictMessage(null), 5000);
    };
    window.addEventListener('sync-conflict', handler);
    return () => window.removeEventListener('sync-conflict', handler);
  }, []);

  const hasError = syncError !== null || failedCount > 0;

  const dotClass = !online
    ? styles.offline
    : hasError
      ? styles.error
      : pendingCount > 0
        ? styles.syncing
        : styles.online;

  const title = !online
    ? 'Offline — changes saved locally'
    : hasError
      ? syncError?.message || `${failedCount} change${failedCount > 1 ? 's' : ''} failed to sync`
      : pendingCount > 0
        ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync`
        : 'Connected';

  const showBadge = failedCount > 0 || pendingCount > 0 || hasError;

  return (
    <>
      <div className={styles.wrapper} ref={panelRef}>
        <button
          className={styles.container}
          title={title}
          onClick={() => showBadge && setDetailOpen(prev => !prev)}
          style={{ cursor: showBadge ? 'pointer' : 'default' }}
        >
          <span className={`${styles.dot} ${dotClass}`} />
          {failedCount > 0 && (
            <span className={styles.failedCount}>{failedCount} failed</span>
          )}
          {failedCount === 0 && pendingCount > 0 && (
            <span className={styles.pendingCount}>{pendingCount}</span>
          )}
          {!online && <span className={styles.label}>Offline</span>}
        </button>

        {detailOpen && (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <span>Sync Queue</span>
              <button className={styles.detailClose} onClick={() => setDetailOpen(false)}>
                &times;
              </button>
            </div>

            {syncError && (
              <div className={styles.detailError}>
                {syncError.message}
              </div>
            )}

            {pendingRecords.length === 0 ? (
              <div className={styles.detailEmpty}>No pending changes</div>
            ) : (
              <div className={styles.detailList}>
                {pendingRecords.map(r => (
                  <div
                    key={r.id}
                    className={`${styles.detailRow} ${r.retries >= 10 ? styles.detailRowFailed : ''}`}
                  >
                    <div className={styles.detailRowTop}>
                      <span className={styles.detailOp}>
                        {r.operation}
                      </span>
                      <span className={styles.detailTable}>{r.table}</span>
                      {r.retries > 0 && (
                        <span className={styles.detailRetries}>
                          {r.retries >= 10 ? 'FAILED' : `retry ${r.retries}/10`}
                        </span>
                      )}
                    </div>
                    <div className={styles.detailRowMeta}>
                      {typeof r.payload?.title === 'string' && r.payload.title && (
                        <span className={styles.detailTitle}>
                          {r.payload.title.slice(0, 40)}
                        </span>
                      )}
                      <span className={styles.detailTime}>
                        {formatTime(r.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {failedCount > 0 && (
              <button className={styles.retryButton} onClick={retryFailedSync}>
                Retry {failedCount} failed
              </button>
            )}
          </div>
        )}
      </div>

      {conflictMessage && (
        <div className={styles.conflictToast}>{conflictMessage}</div>
      )}
    </>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
