import { useState, useMemo } from 'react';
import type { Entry } from '../../../../../shared/types';
import { useEntries } from '../../../contexts/EntriesContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { getDaysInMonth } from '../../../utils/calendar';
import { getEntriesForDate, getMonthName } from '../../../utils/weekCalculations';
import EntryEditor from '../../EntryEditor/EntryEditor';
import EntryDetailPanel from '../../EntryDetailPanel/EntryDetailPanel';
import styles from './MonthView.module.css';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Props {
  year: number;
}

interface EditorState {
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  entry?: Entry;
}

interface CalendarDay {
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  date: Date;
}

export default function MonthView({ year }: Props) {
  const { entries, activeCategory, saveEntries, deleteExistingEntry } = useEntries();
  const { settings, updateSettings } = useSettings();
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const currentMonth = settings.selectedMonth;
  const backgroundCategories = settings.backgroundCategories || [];

  const filteredEntryIds = useMemo(() => {
    if (!activeCategory) return null;
    return new Set(entries.filter(e => e.category === activeCategory).map(e => e.id));
  }, [entries, activeCategory]);

  // Generate calendar days for the current month view
  const calendarDays = useMemo(() => {
    const days: CalendarDay[] = [];
    const daysInMonth = getDaysInMonth(year, currentMonth);

    // Get the first day of the month (0 = Sunday, 1 = Monday, etc.)
    const firstDayDate = new Date(year, currentMonth - 1, 1);
    let firstDayOfWeek = firstDayDate.getDay();
    // Convert to Monday-based (0 = Monday)
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // Add days from previous month
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonth);

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      days.push({
        day,
        month: prevMonth,
        year: prevMonthYear,
        isCurrentMonth: false,
        date: new Date(prevMonthYear, prevMonth - 1, day),
      });
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        day,
        month: currentMonth,
        year,
        isCurrentMonth: true,
        date: new Date(year, currentMonth - 1, day),
      });
    }

    // Add days from next month to fill the grid (6 rows = 42 cells)
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthYear = currentMonth === 12 ? year + 1 : year;
    const remainingDays = 42 - days.length;

    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        month: nextMonth,
        year: nextMonthYear,
        isCurrentMonth: false,
        date: new Date(nextMonthYear, nextMonth - 1, day),
      });
    }

    return days;
  }, [year, currentMonth]);

  const today = new Date();
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  function goToPrevMonth() {
    if (currentMonth === 1) {
      updateSettings({ selectedMonth: 12 });
    } else {
      updateSettings({ selectedMonth: currentMonth - 1 });
    }
  }

  function goToNextMonth() {
    if (currentMonth === 12) {
      updateSettings({ selectedMonth: 1 });
    } else {
      updateSettings({ selectedMonth: currentMonth + 1 });
    }
  }

  function goToToday() {
    updateSettings({ selectedMonth: today.getMonth() + 1 });
  }

  function handleDayClick(calDay: CalendarDay) {
    const dayEntries = getEntriesForDate(entries, calDay.date, calDay.year);
    if (dayEntries.length > 0) {
      setSelectedEntry(dayEntries[0]);
    } else {
      setEditor({
        month: calDay.month,
        dayStart: calDay.day,
        dayEnd: calDay.day,
        rowIndex: 0,
      });
    }
  }

  function handleEditFromPanel() {
    if (!selectedEntry) return;
    setEditor({
      month: selectedEntry.month,
      dayStart: selectedEntry.day_start,
      dayEnd: selectedEntry.day_end,
      rowIndex: selectedEntry.row_index,
      entry: selectedEntry,
    });
    setSelectedEntry(null);
  }

  async function handleSave(dto: any) {
    await saveEntries(Array.isArray(dto) ? dto : [dto]);
    setEditor(null);
  }

  async function handleDelete(id: number) {
    await deleteExistingEntry(id);
    setEditor(null);
    setSelectedEntry(null);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <div className={styles.gridCenter}>
        {/* Month navigation */}
        <div className={styles.navigation}>
          <button className={styles.navButton} onClick={goToPrevMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className={styles.monthTitle}>
            <span className={styles.monthName}>{MONTH_NAMES_FULL[currentMonth - 1]}</span>
            <span className={styles.yearText}>{year}</span>
          </div>
          <button className={styles.navButton} onClick={goToNextMonth}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          {(currentMonth !== today.getMonth() + 1 || year !== today.getFullYear()) && (
            <button className={styles.todayButton} onClick={goToToday}>
              Today
            </button>
          )}
        </div>

        {/* Calendar grid */}
        <div className={styles.calendar}>
          {/* Day headers */}
          <div className={styles.dayHeaders}>
            {DAY_NAMES.map((day, i) => (
              <div
                key={day}
                className={`${styles.dayHeader} ${i >= 5 ? styles.weekend : ''}`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className={styles.daysGrid}>
            {calendarDays.map((calDay, index) => {
              const dayEntries = getEntriesForDate(entries, calDay.date, calDay.year);
              const isWeekend = index % 7 >= 5;
              const isTodayCell = isToday(calDay.date);
              const isPast = calDay.date < today && !isTodayCell;

              const visibleEntries = dayEntries.filter(
                e => !filteredEntryIds || filteredEntryIds.has(e.id)
              );

              return (
                <div
                  key={index}
                  className={[
                    styles.dayCell,
                    !calDay.isCurrentMonth ? styles.otherMonth : '',
                    isWeekend ? styles.weekend : '',
                    isTodayCell ? styles.today : '',
                    isPast && calDay.isCurrentMonth ? styles.past : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleDayClick(calDay)}
                >
                  <span className={styles.dayNumber}>{calDay.day}</span>
                  <div className={styles.entriesList}>
                    {visibleEntries.slice(0, 3).map(entry => {
                      const isBackground = !!entry.category && backgroundCategories.includes(entry.category);
                      return (
                        <div
                          key={entry.id}
                          className={`${styles.entryItem} ${isBackground ? styles.backgroundEntry : ''}`}
                          style={{ backgroundColor: entry.color, opacity: isBackground ? 0.4 : 1 }}
                          title={entry.title}
                        >
                          {entry.emoji && <span className={styles.entryEmoji}>{entry.emoji}</span>}
                          <span className={styles.entryTitle}>{entry.title}</span>
                        </div>
                      );
                    })}
                    {visibleEntries.length > 3 && (
                      <div className={styles.moreEntries}>
                        +{visibleEntries.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>

      {selectedEntry && (
        <EntryDetailPanel
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onEdit={handleEditFromPanel}
        />
      )}

      {editor && (
        <EntryEditor
          year={year}
          month={editor.month}
          dayStart={editor.dayStart}
          dayEnd={editor.dayEnd}
          rowIndex={editor.rowIndex}
          existingEntry={editor.entry}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
