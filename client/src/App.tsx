import { useState } from 'react';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HistoryProvider } from './contexts/HistoryContext';
import { EntriesProvider } from './contexts/EntriesContext';
import ViewContainer from './components/views/ViewContainer';
import Settings from './components/Settings/Settings';
import Login from './components/Login/Login';
import UndoRedoButtons from './components/UndoRedoButtons/UndoRedoButtons';
import UserMenu from './components/UserMenu/UserMenu';
import FeedbackToast from './components/FeedbackToast/FeedbackToast';
import SWUpdatePrompt from './components/SWUpdatePrompt/SWUpdatePrompt';
import { useUndoRedoKeyboard } from './hooks/useUndoRedoKeyboard';
import styles from './App.module.css';

const CURRENT_YEAR = new Date().getFullYear();

// Inner component that uses history hooks (must be inside HistoryProvider)
function MainApp({ user, logout }: { user: { name: string; picture?: string }; logout: () => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [year, setYear] = useState(CURRENT_YEAR);

  // Enable keyboard shortcuts for undo/redo
  useUndoRedoKeyboard();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft} />
        <div className={styles.headerCenter}>
          <h1>Yearly Planner</h1>
          <div className={styles.yearNav}>
            <button
              className={styles.yearNavBtn}
              onClick={() => setYear(y => y - 1)}
              title="Previous year"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className={styles.yearDisplay}>{year}</span>
            <button
              className={styles.yearNavBtn}
              onClick={() => setYear(y => y + 1)}
              title="Next year"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {year !== CURRENT_YEAR && (
              <button
                className={styles.todayBtn}
                onClick={() => setYear(CURRENT_YEAR)}
                title="Go to current year"
              >
                Today
              </button>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          <UndoRedoButtons />
          <UserMenu
            user={user}
            onSettings={() => setShowSettings(true)}
            onLogout={logout}
          />
        </div>
      </header>
      <main>
        <EntriesProvider year={year}>
          <ViewContainer year={year} />
        </EntriesProvider>
      </main>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      <FeedbackToast />
    </div>
  );
}

function AppContent() {
  const { user, loading, logout } = useAuth();

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
      <HistoryProvider>
        <MainApp user={user} logout={logout} />
      </HistoryProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <SWUpdatePrompt />
    </AuthProvider>
  );
}
