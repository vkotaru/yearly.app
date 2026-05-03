import { useEffect, useRef, useState } from 'react';
import { useSettings, FONT_OPTIONS } from '../../contexts/SettingsContext';
import { restoreBackup } from '../../api/backup';
import styles from './Settings.module.css';

interface Props
{
  onClose: () => void;
}

export default function Settings({ onClose }: Props)
{
  const { settings, updateSettings } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);

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
          <label className={styles.label} htmlFor="fontFamilySelect">Font Family</label>
          <select
            id="fontFamilySelect"
            className={styles.fontSelect}
            style={{ fontFamily: settings.fontFamily }}
            value={settings.fontFamily}
            onChange={(e) => updateSettings({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value} style={{ fontFamily: opt.value }}>
                {opt.label}
              </option>
            ))}
          </select>
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

        <div className={styles.section}>
          <label className={styles.label}>Data</label>
          <div className={styles.backupActions}>
            {!restoreConfirm ? (
              <button
                className={`${styles.backupBtn} ${styles.restoreBtn}`}
                onClick={() => setRestoreConfirm(true)}
              >
                Restore Backup
              </button>
            ) : (
              <div className={styles.restoreConfirm}>
                <span className={styles.restoreWarning}>This will replace all your data. Continue?</span>
                <div className={styles.restoreActions}>
                  <button
                    className={`${styles.backupBtn} ${styles.restoreBtnConfirm}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose File
                  </button>
                  <button
                    className={styles.backupBtn}
                    onClick={() => setRestoreConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setBackupStatus('Restoring...');
                const counts = await restoreBackup(file);
                setBackupStatus(`Restored ${counts.entries} entries, ${counts.comments} comments, ${counts.todos} todos`);
                setRestoreConfirm(false);
                setTimeout(() => window.location.reload(), 1500);
              } catch (err: any) {
                setBackupStatus(err.message || 'Restore failed');
              }
              e.target.value = '';
            }}
          />
          {backupStatus && <div className={styles.backupStatus}>{backupStatus}</div>}
        </div>

        <div className={styles.preview} style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize }}>
          The quick brown fox jumps over the lazy dog
        </div>
      </div>
    </div>
  );
}
