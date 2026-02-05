import { useState, useEffect, useRef } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../shared/types';
import { getDaysInMonth, getMonthName } from '../../utils/calendar';
import styles from './EntryEditor.module.css';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#14b8a6', '#6366f1', '#e11d48',
];

interface Props {
  year: number;
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  existingEntry?: Entry;
  onSave: (dto: CreateEntryDto | { id: number } & UpdateEntryDto) => void;
  onDelete?: (id: number) => void;
  onClose: () => void;
}

export default function EntryEditor({
  year, month, dayStart, dayEnd, rowIndex, existingEntry, onSave, onDelete, onClose,
}: Props) {
  const maxDay = getDaysInMonth(year, month);
  const [text, setText] = useState(existingEntry?.text ?? '');
  const [color, setColor] = useState(existingEntry?.color ?? '#3b82f6');
  const [dStart, setDStart] = useState(existingEntry?.day_start ?? dayStart);
  const [dEnd, setDEnd] = useState(existingEntry?.day_end ?? dayEnd);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid the mouseup from drag triggering close immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  function handleSave() {
    const start = Math.min(dStart, dEnd);
    const end = Math.max(dStart, dEnd);
    if (existingEntry) {
      onSave({
        id: existingEntry.id,
        text,
        color,
        day_start: start,
        day_end: end,
      });
    } else {
      onSave({
        year,
        month,
        day_start: start,
        day_end: end,
        row_index: rowIndex,
        text,
        color,
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  const spanLabel = dStart === dEnd
    ? `${getMonthName(month)} ${dStart}`
    : `${getMonthName(month)} ${dStart} – ${dEnd}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.editor} ref={dialogRef} onKeyDown={handleKeyDown}>
        <div className={styles.titleRow}>
          <h3>{existingEntry ? 'Edit Entry' : 'New Entry'}</h3>
          <span className={styles.spanLabel}>{spanLabel}</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          className={styles.textInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Entry text (optional)..."
        />

        <div className={styles.rangeRow}>
          <label className={styles.field}>
            <span>From</span>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={dStart}
              onChange={(e) => setDStart(Math.min(Number(e.target.value), maxDay))}
            />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={dEnd}
              onChange={(e) => setDEnd(Math.min(Number(e.target.value), maxDay))}
            />
          </label>
        </div>

        <div className={styles.colorSection}>
          <span className={styles.colorLabel}>Color</span>
          <div className={styles.colorGrid}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.colorSwatch} ${c === color ? styles.selected : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className={styles.customColor}
              title="Custom color"
            />
          </div>
        </div>

        <div className={styles.actions}>
          {existingEntry && onDelete && (
            <button className={styles.deleteBtn} onClick={() => onDelete(existingEntry.id)}>
              Delete
            </button>
          )}
          <div className={styles.rightActions}>
            <button onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
