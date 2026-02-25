import { getDaysInMonth, isWeekend, getMonthName } from '../../utils/calendar';
import styles from './MonthRow.module.css';

export interface DragState {
  startMonth: number;
  startDay: number;
  startRowIndex: number;
  endMonth: number;
  endDay: number;
  endRowIndex: number;
}

interface Props {
  year: number;
  month: number;
  rowCount: number;  // Pre-calculated row count for this month
  drag: DragState | null;
  highlightedCol: number | null;
  onCellMouseDown: (month: number, day: number, rowIndex: number) => void;
  onCellMouseEnter: (month: number, day: number, rowIndex: number) => void;
  onAddRow: (month: number) => void;
}

export default function MonthRow({
  year, month, rowCount, drag, highlightedCol,
  onCellMouseDown, onCellMouseEnter, onAddRow,
}: Props) {
  const daysInMonth = getDaysInMonth(year, month);

  // Get today's date info
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  function isToday(day: number): boolean {
    return year === todayYear && month === todayMonth && day === todayDay;
  }

  function isPast(day: number): boolean {
    const cellDate = new Date(year, month - 1, day);
    const todayStart = new Date(todayYear, todayMonth - 1, todayDay);
    return cellDate < todayStart;
  }

  function isDayInDrag(day: number, ri: number): boolean {
    if (!drag) return false;

    // Normalize start and end
    const startMonth = Math.min(drag.startMonth, drag.endMonth);
    const endMonth = Math.max(drag.startMonth, drag.endMonth);

    // If this month is outside the drag range
    if (month < startMonth || month > endMonth) return false;

    // For cross-month drag, use row from start position
    if (ri !== drag.startRowIndex) return false;

    // Determine the day range for this specific month
    let lo: number, hi: number;

    if (startMonth === endMonth) {
      lo = Math.min(drag.startDay, drag.endDay);
      hi = Math.max(drag.startDay, drag.endDay);
    } else if (drag.startMonth <= drag.endMonth) {
      // Dragging forward in time
      if (month === drag.startMonth) {
        lo = drag.startDay;
        hi = daysInMonth;
      } else if (month === drag.endMonth) {
        lo = 1;
        hi = drag.endDay;
      } else {
        lo = 1;
        hi = daysInMonth;
      }
    } else {
      // Dragging backward in time
      if (month === drag.endMonth) {
        lo = drag.endDay;
        hi = daysInMonth;
      } else if (month === drag.startMonth) {
        lo = 1;
        hi = drag.startDay;
      } else {
        lo = 1;
        hi = daysInMonth;
      }
    }

    return day >= lo && day <= hi;
  }

  return (
    <div className={styles.monthRow}>
      {/* Month label - spans all entry rows */}
      <div
        className={styles.monthLabel}
        style={{ gridRow: `span ${rowCount}` }}
      >
        <span>{getMonthName(month)}</span>
        <button
          className={styles.addRowBtn}
          onClick={() => onAddRow(month)}
          title="Add row"
        >+</button>
      </div>

      {/* Background rows - ALWAYS render all 31 cells (no entry rendering here) */}
      {Array.from({ length: rowCount }, (_, ri) => {
        const isLast = ri === rowCount - 1;
        return (
          <div key={ri} className={styles.entryRow}>
            {Array.from({ length: 31 }, (_, di) => {
              const day = di + 1;
              const isValid = day <= daysInMonth;
              const weekend = isValid && isWeekend(year, month, day);
              const inDrag = isDayInDrag(day, ri);
              const isTodayCell = isToday(day);
              const isPastCell = isPast(day);
              const isHighlighted = highlightedCol === day;

              if (!isValid) {
                return (
                  <div
                    key={di}
                    className={`${styles.cell} ${styles.invalid} ${isLast ? styles.lastRow : ''}`}
                  />
                );
              }

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
                    isTodayCell ? styles.today : '',
                    isPastCell ? styles.past : '',
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
