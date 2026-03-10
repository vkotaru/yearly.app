import { useState } from 'react';
import { useHistory } from '../../contexts/HistoryContext';
import styles from './UserMenu.module.css';

interface Props {
  user: { name: string; picture?: string };
  onSettings: () => void;
  onLogout: () => void;
}

export default function UserMenu({ user, onSettings, onLogout }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { canUndo, canRedo, undo, redo } = useHistory();

  function handleSettings() {
    setIsOpen(false);
    onSettings();
  }

  function handleLogout() {
    setIsOpen(false);
    onLogout();
  }

  return (
    <>
      <button
        className={styles.avatarButton}
        onClick={() => setIsOpen(true)}
        title="Open menu"
      >
        {user.picture ? (
          <img src={user.picture} alt={user.name} className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}>
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsOpen(false)} />
          <div className={styles.sidebar}>
            <div className={styles.header}>
              <h2>Menu</h2>
              <button
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className={styles.userSection}>
              {user.picture ? (
                <img src={user.picture} alt={user.name} className={styles.userAvatar} />
              ) : (
                <div className={styles.userAvatarPlaceholder}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className={styles.userName}>{user.name}</span>
            </div>

            <nav className={styles.nav}>
              {/* Undo/Redo section - visible on mobile */}
              <div className={styles.undoRedoSection}>
                <button
                  className={`${styles.undoRedoButton} ${!canUndo ? styles.disabled : ''}`}
                  onClick={undo}
                  disabled={!canUndo}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                  <span>Undo</span>
                </button>
                <button
                  className={`${styles.undoRedoButton} ${!canRedo ? styles.disabled : ''}`}
                  onClick={redo}
                  disabled={!canRedo}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                  </svg>
                  <span>Redo</span>
                </button>
              </div>

              <div className={styles.divider} />

              <button className={styles.menuItem} onClick={handleSettings}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Settings</span>
              </button>

              <button className={styles.menuItem} onClick={handleLogout}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Logout</span>
              </button>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
