import { useState, useMemo, useRef, useEffect } from 'react';
import type { Entry } from '../../../../../shared/types';
import { useEntries } from '../../../contexts/EntriesContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { getWeeksInYear, getWeekMonthLabel, getEntriesForDate, getMonthName, getCurrentWeekNumber } from '../../../utils/weekCalculations';
import EntryEditor from '../../EntryEditor/EntryEditor';
import EntryDetailPanel from '../../EntryDetailPanel/EntryDetailPanel';
import styles from './WeekYearView.module.css';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

export default function WeekYearView({ year }: Props) {
  const { entries, activeCategory, saveEntries, deleteExistingEntry } = useEntries();
  const { settings } = useSettings();
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const currentWeekRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const backgroundCategories = settings.backgroundCategories || [];
  const weeks = useMemo(() => getWeeksInYear(year), [year]);
  const currentWeekNumber = useMemo(() => getCurrentWeekNumber(year), [year]);

  // Auto-scroll to current week on mount
  useEffect(() => {
    if (currentWeekRef.current && scrollContainerRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        currentWeekRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [year]);

  const filteredEntryIds = useMemo(() => {
    if (!activeCategory) return null;
    return new Set(entries.filter(e => e.category === activeCategory).map(e => e.id));
  }, [entries, activeCategory]);

  const today = new Date();
  const isToday = (date: Date) =>
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  function handleDayClick(date: Date) {
    setEditor({
      month: date.getMonth() + 1,
      dayStart: date.getDate(),
      dayEnd: date.getDate(),
      rowIndex: 0,
    });
  }

  function handleEntryClick(entry: Entry, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedEntry(entry);
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

  // Track which months have shown their labels
  let lastShownMonth = 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.content} ref={scrollContainerRef}>
        {/* Sticky header row with day names */}
        <div className={styles.header}>
          <div className={styles.monthLabelHeader}></div>
          {DAY_NAMES.map((day, i) => (
            <div
              key={day}
              className={`${styles.dayHeader} ${i >= 5 ? styles.weekend : ''}`}
            >
              {day}
            </div>
          ))}
        </div>

        <div className={styles.gridCenter}>
          {/* Week rows */}
          <div className={styles.weeksContainer}>
            {weeks.map((week) => {
              const { month, showLabel } = getWeekMonthLabel(week);
              const shouldShowLabel = showLabel || month !== lastShownMonth;
              if (shouldShowLabel) {
                lastShownMonth = month;
              }

              const isCurrentWeek = week.weekNumber === currentWeekNumber;
              return (
                <div
                  key={week.weekNumber}
                  className={`${styles.weekRow} ${isCurrentWeek ? styles.currentWeek : ''}`}
                  ref={isCurrentWeek ? currentWeekRef : undefined}
                >
                  {/* Month label */}
                  <div className={`${styles.monthLabel} ${shouldShowLabel ? styles.showLabel : ''}`}>
                    {shouldShowLabel && getMonthName(month)}
                  </div>

                  {/* Day cells */}
                  {week.days.map((day, dayIndex) => {
                    const dayEntries = getEntriesForDate(entries, day.date, year);
                    const isOutsideYear = day.date.getFullYear() !== year;
                    const isWeekend = dayIndex >= 5;
                    const isTodayCell = isToday(day.date);
                    const isPast = day.date < today && !isTodayCell;

                    // Filter entries by category
                    const visibleEntries = dayEntries.filter(
                      e => !filteredEntryIds || filteredEntryIds.has(e.id)
                    );

                    return (
                      <div
                        key={dayIndex}
                        className={[
                          styles.dayCell,
                          isOutsideYear ? styles.outsideYear : '',
                          isWeekend ? styles.weekend : '',
                          isTodayCell ? styles.today : '',
                          isPast ? styles.past : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => !isOutsideYear && handleDayClick(day.date)}
                      >
                        <span className={styles.dayNumber}>{day.dayOfMonth}</span>
                        <div className={styles.entriesList}>
                          {visibleEntries.slice(0, 3).map((entry) => {
                            const isBackground = !!entry.category && backgroundCategories.includes(entry.category);
                            return (
                              <div
                                key={entry.id}
                                className={`${styles.entryBar} ${isBackground ? styles.backgroundEntry : ''} ${isPast ? styles.pastEntry : ''}`}
                                style={{ backgroundColor: entry.color }}
                                onClick={(e) => handleEntryClick(entry, e)}
                                title={entry.title}
                              >
                                {entry.emoji && <span className={styles.entryEmoji}>{entry.emoji}</span>}
                                <span className={styles.entryTitle}>{entry.title}</span>
                              </div>
                            );
                          })}
                          {visibleEntries.length > 3 && (
                            <div className={styles.moreCount}>+{visibleEntries.length - 3} more</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
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
