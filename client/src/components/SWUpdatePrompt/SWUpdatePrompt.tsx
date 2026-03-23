import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './SWUpdatePrompt.module.css';

/**
 * Shows a non-intrusive banner when a new service worker is waiting.
 * On "Update": calls skipWaiting() + reloads the page.
 * On dismiss: SW stays waiting — user can update later.
 *
 * After reload, new JS opens Dexie which auto-migrates if the
 * schema version changed in the new build.
 */
export default function SWUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={styles.banner}>
      <span>New version available</span>
      <button
        className={styles.updateBtn}
        onClick={() => updateServiceWorker(true)}
      >
        Update
      </button>
      <button
        className={styles.dismissBtn}
        onClick={() => setNeedRefresh(false)}
        title="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
