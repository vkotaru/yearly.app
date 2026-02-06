import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../shared/types';
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../../api/entries';
import { getDaysInMonth } from '../../utils/calendar';
import MonthRow from '../MonthRow/MonthRow';
import type { DragState } from '../MonthRow/MonthRow';
import EntryEditor from '../EntryEditor/EntryEditor';
import CategoryFilter from '../CategoryFilter/CategoryFilter';
import styles from './YearGrid.module.css';

export interface ResizeState {
  entry: Entry;
  originalDayEnd: number;
  currentDayEnd: number;
}

export interface MoveState {
  entry: Entry;
  grabOffset: number;
  currentDayStart: number;
  span: number;
}

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
  const [highlightedCol, setHighlightedCol] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const isMoving = useRef(false);
  const moveIntent = useRef<{ entry: Entry; startX: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const loadEntries = useCallback(async () => {
    const data = await fetchEntries(year);
    setEntries(data);
  }, [year]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Global mouseup to finish drag, resize, or move
  useEffect(() => {
    function handleMouseUp() {
      // Finish entry move
      if (isMoving.current && move) {
        isMoving.current = false;
        moveIntent.current = null;
        if (move.currentDayStart !== move.entry.day_start) {
          const newDayEnd = move.currentDayStart + move.span;
          updateEntry(move.entry.id, {
            day_start: move.currentDayStart,
            day_end: newDayEnd,
          }).then(() => loadEntries());
        }
        setMove(null);
        return;
      }
      // Entry click (mousedown on entry without enough movement to start move)
      if (moveIntent.current) {
        const entry = moveIntent.current.entry;
        moveIntent.current = null;
        setEditor({
          month: entry.month,
          dayStart: entry.day_start,
          dayEnd: entry.day_end,
          rowIndex: entry.row_index,
          entry,
        });
        return;
      }
      // Finish resize
      if (isResizing.current && resize) {
        isResizing.current = false;
        if (resize.currentDayEnd !== resize.originalDayEnd) {
          updateEntry(resize.entry.id, { day_end: resize.currentDayEnd })
            .then(() => loadEntries());
        }
        setResize(null);
        return;
      }
      // Finish drag-to-create
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
  }, [drag, resize, move, loadEntries]);

  // Global mousemove during resize — compute day from pixel position
  useEffect(() => {
    if (!resize) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing.current || !resize || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();
      const xInGrid = e.clientX - gridRect.left - 72; // 72px month label
      if (xInGrid < 0) return;
      const day = Math.floor(xInGrid / 40) + 1;
      const maxDay = getDaysInMonth(year, resize.entry.month);
      const clampedDay = Math.max(resize.entry.day_start, Math.min(day, maxDay));
      setResize(prev => prev ? { ...prev, currentDayEnd: clampedDay } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [resize, year]);

  // Detect move threshold (mousedown on entry → moved > 5px)
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!moveIntent.current || isMoving.current || isResizing.current || !gridRef.current) return;
      const dx = Math.abs(e.clientX - moveIntent.current.startX);
      if (dx > 5) {
        isMoving.current = true;
        const entry = moveIntent.current.entry;
        const gridRect = gridRef.current.getBoundingClientRect();
        const xInGrid = moveIntent.current.startX - gridRect.left - 72;
        const grabDay = Math.max(1, Math.floor(xInGrid / 40) + 1);
        const grabOffset = grabDay - entry.day_start;
        const span = entry.day_end - entry.day_start;
        setMove({ entry, grabOffset, currentDayStart: entry.day_start, span });
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [year]);

  // Global mousemove during move — compute new day_start from pixel position
  useEffect(() => {
    if (!move) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isMoving.current || !move || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();
      const xInGrid = e.clientX - gridRect.left - 72;
      const dayAtMouse = Math.floor(xInGrid / 40) + 1;
      const newDayStart = dayAtMouse - move.grabOffset;
      const maxDay = getDaysInMonth(year, move.entry.month);
      const clampedStart = Math.max(1, Math.min(newDayStart, maxDay - move.span));
      setMove(prev => prev ? { ...prev, currentDayStart: clampedStart } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [move, year]);

  function handleEntryMouseDown(entry: Entry, clientX: number) {
    moveIntent.current = { entry, startX: clientX };
  }

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

  function handleResizeStart(entry: Entry) {
    isResizing.current = true;
    setResize({
      entry,
      originalDayEnd: entry.day_end,
      currentDayEnd: entry.day_end,
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

  const categories = useMemo(() => {
    const cats = new Set(entries.map(e => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [entries]);

  const filteredEntryIds = useMemo(() => {
    if (!activeCategory) return null;
    return new Set(entries.filter(e => e.category === activeCategory).map(e => e.id));
  }, [entries, activeCategory]);

  const entriesByMonth = entries.reduce<Record<number, Entry[]>>((acc, e) => {
    (acc[e.month] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className={styles.wrapper}>
      <CategoryFilter
        categories={categories}
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
      />
      <div className={styles.grid} ref={gridRef}>
        {/* Header row */}
        <div className={styles.headerLabel}>Month</div>
        {Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          return (
            <div
              key={i}
              className={`${styles.headerDay} ${highlightedCol === day ? styles.headerDayActive : ''}`}
              onClick={() => setHighlightedCol(highlightedCol === day ? null : day)}
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
              highlightedCol={highlightedCol}
              filteredEntryIds={filteredEntryIds}
              resize={resize}
              move={move}
              onCellMouseDown={handleCellMouseDown}
              onCellMouseEnter={handleCellMouseEnter}
              onEntryMouseDown={handleEntryMouseDown}
              onAddRow={handleAddRow}
              onResizeStart={handleResizeStart}
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
