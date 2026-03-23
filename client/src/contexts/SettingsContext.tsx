import { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { fetchSettings, patchSettings } from '../api/settings';
import { db } from '../lib/db';
import { addToPendingSync, isOnline } from '../lib/sync';

export type ViewMode = 'year-grid' | 'week-year' | 'month' | 'list';

export interface Settings {
  // Local-only settings (device-specific, stored in localStorage)
  fontFamily: string;
  fontSize: number;
  gridCellSize: number;
  calendarWidth: number;
  viewMode: ViewMode;
  selectedMonth: number;

  // Synced settings (stored in database, shared across devices)
  backgroundCategories: string[];
  hideBackgroundsInList: boolean;
}

// Settings that sync to the database
const SYNCED_KEYS: (keyof Settings)[] = ['backgroundCategories', 'hideBackgroundsInList'];

// Grid constants
const MONTH_LABEL_WIDTH = 72;
const DEFAULT_DAY_WIDTH = 40;
const MIN_DAY_WIDTH = 28;

export function computeDayWidth(calendarWidth: number): number {
  if (calendarWidth < 0) return DEFAULT_DAY_WIDTH;
  const available = calendarWidth - MONTH_LABEL_WIDTH;
  const computed = Math.floor(available / 31);
  return Math.max(MIN_DAY_WIDTH, computed);
}

const FONT_OPTIONS = [
  { label: 'Geist Sans', value: "'Geist', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'DM Sans', value: "'DM Sans', sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk', sans-serif" },
  { label: 'Outfit', value: "'Outfit', sans-serif" },
  { label: 'Manrope', value: "'Manrope', sans-serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Plus Jakarta Sans', value: "'Plus Jakarta Sans', sans-serif" },
  { label: 'Geist Mono', value: "'Geist Mono', monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'System Default', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
] as const;

export { FONT_OPTIONS };

const DEFAULT_SETTINGS: Settings = {
  fontFamily: "'Geist', sans-serif",
  fontSize: 13,
  gridCellSize: 24,
  calendarWidth: -1,
  viewMode: 'year-grid',
  selectedMonth: new Date().getMonth() + 1,
  backgroundCategories: [],
  hideBackgroundsInList: true,
};

const STORAGE_KEY = 'yearly-planner-settings';

function loadLocalSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      if (parsed.calendarWidth === 0) parsed.calendarWidth = -1;
      if (parsed.calendarWidth > 0 && parsed.calendarWidth < 800) parsed.calendarWidth = 800;
      return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

interface SettingsContextValue {
  settings: Settings;
  dayWidth: number;
  updateSettings: (patch: Partial<Settings>) => void;
  syncedLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  dayWidth: DEFAULT_DAY_WIDTH,
  updateSettings: () => {},
  syncedLoaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadLocalSettings);
  const [syncedLoaded, setSyncedLoaded] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<Partial<Settings> | null>(null);

  const dayWidth = useMemo(
    () => computeDayWidth(settings.calendarWidth),
    [settings.calendarWidth]
  );

  // Load synced settings: Dexie first (instant/offline), then API (background refresh)
  useEffect(() => {
    // 1. Read from Dexie
    db.settings.toArray().then((records) => {
      if (records.length > 0) {
        const fromDexie: Partial<Settings> = {};
        for (const r of records) {
          (fromDexie as any)[r.key] = r.value;
        }
        setSettings((prev) => ({ ...prev, ...fromDexie }));
      }
    }).catch(() => { /* Dexie not available yet */ });

    // 2. Fetch from API (background refresh, updates Dexie)
    fetchSettings()
      .then(async (remote) => {
        if (remote && Object.keys(remote).length > 0) {
          setSettings((prev) => ({ ...prev, ...remote }));
          // Persist to Dexie for offline access
          for (const [key, value] of Object.entries(remote)) {
            await db.settings.put({ key, value, updated_at: new Date().toISOString() });
          }
        }
        setSyncedLoaded(true);
      })
      .catch(() => {
        setSyncedLoaded(true); // Continue with local/Dexie settings on error
      });
  }, []);

  // Save to localStorage and apply CSS variables
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    const root = document.documentElement;
    root.style.setProperty('--font-family', settings.fontFamily);
    root.style.setProperty('--font-size', `${settings.fontSize}px`);
    root.style.setProperty('--grid-cell-height', `${settings.gridCellSize}px`);
    root.style.setProperty(
      '--calendar-max-width',
      settings.calendarWidth >= 0 ? `${settings.calendarWidth}px` : 'none'
    );
  }, [settings]);

  // Debounced sync to API + Dexie persistence
  const syncToApi = useCallback((patch: Partial<Settings>) => {
    // Filter to only synced keys
    const syncedPatch: Partial<Settings> = {};
    for (const key of SYNCED_KEYS) {
      if (key in patch) {
        (syncedPatch as any)[key] = (patch as any)[key];
      }
    }

    if (Object.keys(syncedPatch).length === 0) return;

    // Always persist synced settings to Dexie (immediate, for offline access)
    for (const [key, value] of Object.entries(syncedPatch)) {
      db.settings.put({ key, value, updated_at: new Date().toISOString() }).catch(() => {});
    }

    // Merge with pending sync
    pendingSyncRef.current = { ...pendingSyncRef.current, ...syncedPatch };

    // Debounce: wait 500ms before syncing
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      if (pendingSyncRef.current) {
        const toSync = pendingSyncRef.current;
        pendingSyncRef.current = null;

        if (isOnline()) {
          patchSettings(toSync).catch(() => {
            // Server unavailable — queue for later
            addToPendingSync('settings', 'update', toSync as Record<string, unknown>);
          });
        } else {
          addToPendingSync('settings', 'update', toSync as Record<string, unknown>);
        }
      }
    }, 500);
  }, []);

  function updateSettings(patch: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
    syncToApi(patch);
  }

  return (
    <SettingsContext.Provider value={{ settings, dayWidth, updateSettings, syncedLoaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
