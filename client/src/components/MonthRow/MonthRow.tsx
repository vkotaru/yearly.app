import { useMemo } from 'react';
import type { Entry } from '../../../../shared/types';
import type { ResizeState } from '../YearGrid/YearGrid';
import { getDaysInMonth, isWeekend, getMonthName } from '../../utils/calendar';
import { computeRowSlots } from '../../utils/entryLayout';
import styles from './MonthRow.module.css';

export interface DragState {
  month: number;
  rowIndex: number;
  dayStart: number;
  dayEnd: number;
}

interface Props {
  year: number;
  month: number;
  entries: Entry[];
  minRows: number;
  drag: DragState | null;
  highlightedCol: number | null;
  filteredEntryIds: Set<number> | null;
  resize: ResizeState | null;
  onCellMouseDown: (month: number, day: number, rowIndex: number) => void;
  onCellMouseEnter: (month: number, day: number, rowIndex: number) => void;
  onEntryClick: (entry: Entry) => void;
  onAddRow: (month: number) => void;
  onResizeStart: (entry: Entry) => void;
}

export default function MonthRow({
  year, month, entries, minRows, drag, highlightedCol,
  filteredEntryIds, resize,
  onCellMouseDown, onCellMouseEnter, onEntryClick, onAddRow, onResizeStart,
}: Props) {
  const daysInMonth = getDaysInMonth(year, month);

  // Adjust entries if one is being resized in this month
  const adjustedEntries = useMemo(() => {
    if (!resize || resize.entry.month !== month) return entries;
    return entries.map(e =>
      e.id === resize.entry.id
        ? { ...e, day_end: resize.currentDayEnd }
        : e
    );
  }, [entries, resize, month]);

  const rows = useMemo(
    () => computeRowSlots(adjustedEntries, daysInMonth, minRows),
    [adjustedEntries, daysInMonth, minRows]
  );

  function isDayInDrag(day: number, ri: number): boolean {
    if (!drag || drag.month !== month || drag.rowIndex !== ri) return false;
    const lo = Math.min(drag.dayStart, drag.dayEnd);
    const hi = Math.max(drag.dayStart, drag.dayEnd);
    return day >= lo && day <= hi;
  }

  /** Determine text color contrast for a background hex */
  function textColor(bg: string): string {
    const hex = bg.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
  }

  return (
    <div className={styles.monthRow}>
      {/* Month label - spans all entry rows */}
      <div
        className={styles.monthLabel}
        style={{ gridRow: `span ${rows.length}` }}
      >
        <span>{getMonthName(month)}</span>
        <button
          className={styles.addRowBtn}
          onClick={() => onAddRow(month)}
          title="Add row"
        >+</button>
      </div>

      {/* Entry rows */}
      {rows.map((row, ri) => {
        const isLast = ri === rows.length - 1;
        return (
          <div key={ri} className={styles.entryRow}>
            {Array.from({ length: 31 }, (_, di) => {
              const day = di + 1;
              const isValid = day <= daysInMonth;
              const weekend = isValid && isWeekend(year, month, day);
              const slot = isValid && di < row.length ? row[di] : null;

              const isHighlighted = highlightedCol === day;

              if (!isValid) {
                return (
                  <div
                    key={di}
                    className={`${styles.cell} ${styles.invalid} ${isLast ? styles.lastRow : ''}`}
                  />
                );
              }

              if (slot?.type === 'continuation') {
                return null; // covered by the spanning entry
              }

              if (slot?.type === 'start' && slot.entry) {
                const entry = slot.entry;
                const span = Math.min(entry.day_end, daysInMonth) - entry.day_start + 1;
                const isDimmed = filteredEntryIds !== null && !filteredEntryIds.has(entry.id);
                const tooltip = [
                  entry.title,
                  entry.description,
                  entry.url,
                  entry.category && `[${entry.category}]`,
                ].filter(Boolean).join('\n');
                return (
                  <div
                    key={di}
                    className={`${styles.cell} ${styles.entryCell} ${isLast ? styles.lastRow : ''}`}
                    style={{
                      gridColumn: `span ${span}`,
                      backgroundColor: entry.color,
                      color: textColor(entry.color),
                      opacity: isDimmed ? 0.2 : 1,
                    }}
                    onClick={() => onEntryClick(entry)}
                    title={tooltip}
                  >
                    <span className={styles.entryText}>{entry.title}</span>
                    {entry.url && (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.linkIcon}
                        onClick={(e) => e.stopPropagation()}
                        title={entry.url}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                    <div
                      className={styles.resizeHandle}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onResizeStart(entry);
                      }}
                    />
                  </div>
                );
              }

              // Empty cell
              const inDrag = isDayInDrag(day, ri);
              return (
                <div
                  key={di}
                  className={[
                    styles.cell,
                    styles.emptyCell,
                    weekend ? styles.weekend : '',
                    inDrag ? styles.selecting : '',
                    isHighlighted ? styles.colHighlight : '',
                    isLast ? styles.lastRow : '',
                  ].filter(Boolean).join(' ')}
                  onMouseDown={() => onCellMouseDown(month, day, ri)}
                  onMouseEnter={() => onCellMouseEnter(month, day, ri)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
