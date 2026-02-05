import { useState, useEffect, useCallback, useRef } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../shared/types';
import { isWeekend } from '../../utils/calendar';
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../../api/entries';
import MonthRow from '../MonthRow/MonthRow';
import type { DragState } from '../MonthRow/MonthRow';
import EntryEditor from '../EntryEditor/EntryEditor';
import styles from './YearGrid.module.css';

interface EditorState {
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  entry?: Entry;
}

interface Props {
  year: number;
}

export default function YearGrid({ year }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [monthRows, setMonthRows] = useState<Record<number, number>>(
    () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3]))
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isDragging = useRef(false);

  const loadEntries = useCallback(async () => {
    const data = await fetchEntries(year);
    setEntries(data);
  }, [year]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Global mouseup to finish drag
  useEffect(() => {
    function handleMouseUp() {
      if (isDragging.current && drag) {
        isDragging.current = false;
        const lo = Math.min(drag.dayStart, drag.dayEnd);
        const hi = Math.max(drag.dayStart, drag.dayEnd);
        setEditor({
          month: drag.month,
          dayStart: lo,
          dayEnd: hi,
          rowIndex: drag.rowIndex,
        });
        setDrag(null);
      }
    }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [drag]);

  function handleCellMouseDown(month: number, day: number, rowIndex: number) {
    isDragging.current = true;
    setDrag({ month, rowIndex, dayStart: day, dayEnd: day });
  }

  function handleCellMouseEnter(month: number, day: number, rowIndex: number) {
    if (!isDragging.current || !drag) return;
    // Only extend within same month + row
    if (month !== drag.month || rowIndex !== drag.rowIndex) return;
    setDrag((prev) => prev ? { ...prev, dayEnd: day } : null);
  }

  function handleEntryClick(entry: Entry) {
    setEditor({
      month: entry.month,
      dayStart: entry.day_start,
      dayEnd: entry.day_end,
      rowIndex: entry.row_index,
      entry,
    });
  }

  function handleAddRow(month: number) {
    setMonthRows((prev) => ({ ...prev, [month]: (prev[month] || 3) + 1 }));
  }

  async function handleSave(dto: CreateEntryDto | ({ id: number } & UpdateEntryDto)) {
    if ('id' in dto) {
      const { id, ...updates } = dto;
      await updateEntry(id, updates);
    } else {
      await createEntry(dto);
    }
    await loadEntries();
    setEditor(null);
  }

  async function handleDelete(id: number) {
    await deleteEntry(id);
    await loadEntries();
    setEditor(null);
  }

  const entriesByMonth = entries.reduce<Record<number, Entry[]>>((acc, e) => {
    (acc[e.month] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className={styles.wrapper}>
      <div className={styles.grid}>
        {/* Header row */}
        <div className={styles.headerLabel}>Month</div>
        {Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          const weekend = isWeekend(year, 1, day);
          return (
            <div
              key={i}
              className={`${styles.headerDay} ${weekend ? styles.headerWeekend : ''}`}
            >
              {day}
            </div>
          );
        })}

        {/* 12 month rows */}
        {Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          return (
            <MonthRow
              key={month}
              year={year}
              month={month}
              entries={entriesByMonth[month] || []}
              minRows={monthRows[month] || 3}
              drag={drag}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseEnter={handleCellMouseEnter}
              onEntryClick={handleEntryClick}
              onAddRow={handleAddRow}
            />
          );
        })}
      </div>

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
