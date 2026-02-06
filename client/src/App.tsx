import { useState } from 'react';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import YearGrid from './components/YearGrid/YearGrid';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import styles from './App.module.css';

const YEAR = 2026;

function AppContent() {
  const { user, loading, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <SettingsProvider>
      <div className={styles.app}>
        <header className={styles.header}>
          <h1>{YEAR} Yearly Planner</h1>
          <div className={styles.headerRight}>
            <div className={styles.userInfo}>
              {user.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className={styles.avatar}
                />
              )}
              <span className={styles.userName}>{user.name}</span>
            </div>
            <button
              className={styles.settingsBtn}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              className={styles.logoutBtn}
              onClick={logout}
              title="Logout"
            >
              Logout
            </button>
          </div>
        </header>
        <main>
          <YearGrid year={YEAR} />
        </main>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </div>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
