import { useState, useMemo } from 'react';
import type { Entry } from '../../../../../shared/types';
import { useEntries } from '../../../contexts/EntriesContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { getMonthName } from '../../../utils/weekCalculations';
import EntryEditor from '../../EntryEditor/EntryEditor';
import EntryDetailPanel from '../../EntryDetailPanel/EntryDetailPanel';
import styles from './ListView.module.css';

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

export default function ListView({ year }: Props) {
  const { entries, activeCategory, saveEntries, deleteExistingEntry } = useEntries();
  const { settings } = useSettings();
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<number>>(new Set());

  const backgroundCategories = settings.backgroundCategories || [];
  const hideBackgrounds = settings.hideBackgroundsInList;

  // Filter entries by category and optionally hide backgrounds
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Filter by active category
    if (activeCategory) {
      result = result.filter(e => e.category === activeCategory);
    }

    // Hide background entries if setting is enabled
    if (hideBackgrounds && backgroundCategories.length > 0) {
      result = result.filter(e => !e.category || !backgroundCategories.includes(e.category));
    }

    return result;
  }, [entries, activeCategory, hideBackgrounds, backgroundCategories]);

  // Group and sort entries by month, then by date
  const entriesByMonth = useMemo(() => {
    const grouped: Record<number, Entry[]> = {};

    for (const entry of filteredEntries) {
      if (!grouped[entry.month]) {
        grouped[entry.month] = [];
      }
      grouped[entry.month].push(entry);
    }

    // Sort entries within each month by day_start
    for (const month in grouped) {
      grouped[month].sort((a, b) => a.day_start - b.day_start);
    }

    return grouped;
  }, [filteredEntries]);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();

  function toggleMonth(month: number) {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  }

  function handleEntryClick(entry: Entry) {
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

  function formatDateRange(entry: Entry): string {
    const endMonth = entry.end_month ?? entry.month;
    if (entry.month === endMonth && entry.day_start === entry.day_end) {
      return `${getMonthName(entry.month)} ${entry.day_start}`;
    }
    if (entry.month === endMonth) {
      return `${getMonthName(entry.month)} ${entry.day_start}-${entry.day_end}`;
    }
    return `${getMonthName(entry.month)} ${entry.day_start} - ${getMonthName(endMonth)} ${entry.day_end}`;
  }

  function isPastEntry(entry: Entry): boolean {
    if (year < currentYear) return true;
    if (year > currentYear) return false;
    const endMonth = entry.end_month ?? entry.month;
    if (endMonth < currentMonth) return true;
    if (endMonth === currentMonth && entry.day_end < currentDay) return true;
    return false;
  }

  function isCurrentEntry(entry: Entry): boolean {
    if (year !== currentYear) return false;
    const endMonth = entry.end_month ?? entry.month;
    if (entry.month <= currentMonth && endMonth >= currentMonth) {
      if (entry.month === currentMonth && entry.day_start > currentDay) return false;
      if (endMonth === currentMonth && entry.day_end < currentDay) return false;
      return true;
    }
    return false;
  }

  const monthsWithEntries = Object.keys(entriesByMonth)
    .map(Number)
    .sort((a, b) => a - b);

  const totalEntries = filteredEntries.length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        {/* Summary header */}
        <div className={styles.summary}>
          <span className={styles.summaryText}>
            {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} in {year}
          </span>
        </div>

        {/* Empty state */}
        {totalEntries === 0 && (
          <div className={styles.emptyState}>
            <p>No entries for {year}</p>
            <p className={styles.emptySubtext}>
              Switch to the Year Grid view to create entries
            </p>
          </div>
        )}

        {/* Entries grouped by month */}
        <div className={styles.monthsList}>
          {monthsWithEntries.map(month => {
            const monthEntries = entriesByMonth[month];
            const isCollapsed = collapsedMonths.has(month);
            const isCurrentMonth = year === currentYear && month === currentMonth;

            return (
              <div key={month} className={styles.monthSection}>
                <button
                  className={`${styles.monthHeader} ${isCurrentMonth ? styles.currentMonth : ''}`}
                  onClick={() => toggleMonth(month)}
                >
                  <span className={styles.monthName}>{MONTH_NAMES_FULL[month - 1]}</span>
                  <span className={styles.entryCount}>{monthEntries.length}</span>
                  <svg
                    className={`${styles.chevron} ${isCollapsed ? styles.collapsed : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <div className={styles.entriesList}>
                    {monthEntries.map(entry => {
                      const isPast = isPastEntry(entry);
                      const isCurrent = isCurrentEntry(entry);

                      return (
                        <div
                          key={entry.id}
                          className={[
                            styles.entryItem,
                            isPast ? styles.past : '',
                            isCurrent ? styles.current : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleEntryClick(entry)}
                        >
                          <div
                            className={styles.colorBar}
                            style={{ backgroundColor: entry.color }}
                          />
                          <div className={styles.entryContent}>
                            <div className={styles.entryMain}>
                              {entry.emoji && <span className={styles.emoji}>{entry.emoji}</span>}
                              <span className={styles.title}>{entry.title}</span>
                              {entry.is_tentative && <span className={styles.tentativeBadge}>?</span>}
                            </div>
                            <div className={styles.entryMeta}>
                              <span className={styles.dateRange}>{formatDateRange(entry)}</span>
                              {entry.category && (
                                <span className={styles.category}>{entry.category}</span>
                              )}
                            </div>
                          </div>
                          {entry.url && (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.linkIcon}
                              onClick={e => e.stopPropagation()}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
