import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';

export interface Settings
{
  fontFamily: string;
  fontSize: number;      // base size in px (grid text scales from this)
  gridCellSize: number;  // cell height in px
  calendarWidth: number; // max content width in px (0 = fluid)
}

// Grid constants
const MONTH_LABEL_WIDTH = 72;
const DEFAULT_DAY_WIDTH = 40;
const MIN_DAY_WIDTH = 28;

/**
 * Calculate day column width based on calendar width setting.
 * If calendarWidth is 0 (fluid), use default width.
 * Otherwise, compute to fit exactly within the specified width.
 */
export function computeDayWidth(calendarWidth: number): number {
  if (calendarWidth <= 0) return DEFAULT_DAY_WIDTH;
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
  calendarWidth: 0, // 0 = fluid
};

const STORAGE_KEY = 'yearly-planner-settings';

function loadSettings(): Settings
{
  try
  {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

interface SettingsContextValue
{
  settings: Settings;
  dayWidth: number;  // computed from calendarWidth
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  dayWidth: DEFAULT_DAY_WIDTH,
  updateSettings: () => { },
});

export function SettingsProvider({ children }: { children: ReactNode })
{
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Compute day width from calendar width setting
  const dayWidth = useMemo(
    () => computeDayWidth(settings.calendarWidth),
    [settings.calendarWidth]
  );

  useEffect(() =>
  {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Apply as CSS variables on :root
    const root = document.documentElement;
    root.style.setProperty('--font-family', settings.fontFamily);
    root.style.setProperty('--font-size', `${settings.fontSize}px`);
    root.style.setProperty('--grid-cell-height', `${settings.gridCellSize}px`);
    root.style.setProperty('--grid-day-width', `${dayWidth}px`);
    root.style.setProperty(
      '--calendar-max-width',
      settings.calendarWidth > 0 ? `${settings.calendarWidth}px` : 'none'
    );
  }, [settings, dayWidth]);

  function updateSettings(patch: Partial<Settings>)
  {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return (
    <SettingsContext.Provider value={{ settings, dayWidth, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings()
{
  return useContext(SettingsContext);
}
