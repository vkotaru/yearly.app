import { useEffect, useRef } from 'react';
import { useSettings, FONT_OPTIONS } from '../../contexts/SettingsContext';
import styles from './Settings.module.css';

interface Props
{
  onClose: () => void;
}

export default function Settings({ onClose }: Props)
{
  const { settings, updateSettings } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    function handleClickOutside(e: MouseEvent)
    {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
      {
        onClose();
      }
    }
    const timer = setTimeout(() =>
    {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () =>
    {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.header}>
          <h3>Settings</h3>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Font Family</label>
          <div className={styles.fontOptions}>
            {FONT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`${styles.fontOption} ${settings.fontFamily === opt.value ? styles.active : ''}`}
                style={{ fontFamily: opt.value }}
                onClick={() => updateSettings({ fontFamily: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>
            Font Size <span className={styles.value}>{settings.fontSize}px</span>
          </label>
          <input
            type="range"
            min={10}
            max={18}
            step={1}
            value={settings.fontSize}
            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
            className={styles.slider}
          />
          <div className={styles.sliderLabels}>
            <span>Small</span>
            <span>Large</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>
            Row Height <span className={styles.value}>{settings.gridCellSize}px</span>
          </label>
          <input
            type="range"
            min={18}
            max={36}
            step={2}
            value={settings.gridCellSize}
            onChange={(e) => updateSettings({ gridCellSize: Number(e.target.value) })}
            className={styles.slider}
          />
          <div className={styles.sliderLabels}>
            <span>Compact</span>
            <span>Spacious</span>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>
            Calendar Width{' '}
            <span className={styles.value}>
              {settings.calendarWidth === -1 ? 'Fill Container' : `${settings.calendarWidth}px`}
            </span>
          </label>
          <input
            type="range"
            min={800}
            max={2000}
            step={50}
            value={settings.calendarWidth === -1 ? 2000 : settings.calendarWidth}
            onChange={(e) => {
              const val = Number(e.target.value);
              updateSettings({ calendarWidth: val >= 2000 ? -1 : val });
            }}
            className={styles.slider}
          />
          <div className={styles.sliderLabels}>
            <span>800px</span>
            <span>Fill</span>
          </div>
          <div className={styles.widthHint}>
            Slide right to fill available width, or set a fixed constraint.
          </div>
        </div>

        <div className={styles.preview} style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }}>
          The quick brown fox jumps over the lazy dog
        </div>
      </div>
    </div>
  );
}
