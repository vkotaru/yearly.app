import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../shared/types';
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../../api/entries';
import { getDaysInMonth } from '../../utils/calendar';
import MonthRow from '../MonthRow/MonthRow';
import type { DragState } from '../MonthRow/MonthRow';
import EntryEditor from '../EntryEditor/EntryEditor';
import EntryDetailPanel from '../EntryDetailPanel/EntryDetailPanel';
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
  currentRowIndex: number;
  span: number;
}

interface EditorState {
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  entry?: Entry;
  endMonth?: number; // For cross-month selection
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
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
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

  // Group entries by month (needed early for move calculations)
  const entriesByMonth = useMemo(() => {
    return entries.reduce<Record<number, Entry[]>>((acc, e) => {
      (acc[e.month] ??= []).push(e);
      return acc;
    }, {});
  }, [entries]);

  // Global mouseup to finish drag, resize, or move
  useEffect(() => {
    function handleMouseUp() {
      // Finish entry move
      if (isMoving.current && move) {
        isMoving.current = false;
        moveIntent.current = null;
        const newDayStart = move.currentDayStart;
        const newDayEnd = newDayStart + move.span;
        const newRowIndex = move.currentRowIndex;
        const movingEntry = move.entry;

        // Check if anything changed
        const positionChanged = newDayStart !== movingEntry.day_start || newRowIndex !== movingEntry.row_index;

        if (positionChanged) {
          // Check for conflicts with other entries on the target row_index
          const monthEntries = entriesByMonth[movingEntry.month] || [];
          const hasConflict = monthEntries.some(e => {
            if (e.id === movingEntry.id) return false; // Skip self
            if (e.row_index !== newRowIndex) return false; // Different row
            // Check day overlap
            return !(newDayEnd < e.day_start || newDayStart > e.day_end);
          });

          if (hasConflict) {
            // Find a free row_index
            const usedRows = new Set<number>();
            for (const e of monthEntries) {
              if (e.id === movingEntry.id) continue;
              if (!(newDayEnd < e.day_start || newDayStart > e.day_end)) {
                usedRows.add(e.row_index);
              }
            }
            let freeRow = 0;
            while (usedRows.has(freeRow)) freeRow++;

            updateEntry(movingEntry.id, {
              day_start: newDayStart,
              day_end: newDayEnd,
              row_index: freeRow,
            }).then(() => loadEntries());
          } else {
            updateEntry(movingEntry.id, {
              day_start: newDayStart,
              day_end: newDayEnd,
              row_index: newRowIndex,
            }).then(() => loadEntries());
          }
        }
        setMove(null);
        return;
      }
      // Entry click (mousedown on entry without enough movement to start move)
      if (moveIntent.current) {
        const entry = moveIntent.current.entry;
        moveIntent.current = null;
        // Show side panel instead of full editor
        setSelectedEntry(entry);
        return;
      }
      // Finish resize
      if (isResizing.current && resize) {
        isResizing.current = false;
        if (resize.currentDayEnd !== resize.originalDayEnd) {
          const resizingEntry = resize.entry;
          const newDayEnd = resize.currentDayEnd;

          // Check for conflicts with other entries on the same row_index
          const monthEntries = entriesByMonth[resizingEntry.month] || [];
          const hasConflict = monthEntries.some(e => {
            if (e.id === resizingEntry.id) return false;
            if (e.row_index !== resizingEntry.row_index) return false;
            return !(newDayEnd < e.day_start || resizingEntry.day_start > e.day_end);
          });

          if (hasConflict) {
            // Find a free row_index
            const usedRows = new Set<number>();
            for (const e of monthEntries) {
              if (e.id === resizingEntry.id) continue;
              if (!(newDayEnd < e.day_start || resizingEntry.day_start > e.day_end)) {
                usedRows.add(e.row_index);
              }
            }
            let freeRow = 0;
            while (usedRows.has(freeRow)) freeRow++;

            updateEntry(resizingEntry.id, { day_end: newDayEnd, row_index: freeRow })
              .then(() => loadEntries());
          } else {
            updateEntry(resizingEntry.id, { day_end: newDayEnd })
              .then(() => loadEntries());
          }
        }
        setResize(null);
        return;
      }
      // Finish drag-to-create
      if (isDragging.current && drag) {
        isDragging.current = false;

        // Normalize so start is before end chronologically
        let startMonth = drag.startMonth;
        let startDay = drag.startDay;
        let endMonth = drag.endMonth;
        let endDay = drag.endDay;

        if (startMonth > endMonth || (startMonth === endMonth && startDay > endDay)) {
          [startMonth, endMonth] = [endMonth, startMonth];
          [startDay, endDay] = [endDay, startDay];
        }

        setEditor({
          month: startMonth,
          dayStart: startDay,
          dayEnd: endDay,
          rowIndex: drag.startRowIndex,
          // Pass end month for cross-month support
          endMonth: endMonth !== startMonth ? endMonth : undefined,
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
        setMove({ entry, grabOffset, currentDayStart: entry.day_start, currentRowIndex: entry.row_index, span });
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [year]);

  // Global mousemove during move — compute new day_start and row from pixel position
  useEffect(() => {
    if (!move) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isMoving.current || !move || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();

      // Horizontal position (day)
      const xInGrid = e.clientX - gridRect.left - 72;
      const dayAtMouse = Math.floor(xInGrid / 40) + 1;
      const newDayStart = dayAtMouse - move.grabOffset;
      const maxDay = getDaysInMonth(year, move.entry.month);
      const clampedStart = Math.max(1, Math.min(newDayStart, maxDay - move.span));

      // Vertical position (row within the entry's month)
      const yInGrid = e.clientY - gridRect.top;
      const headerHeight = 32; // Header row height (with padding)
      let yOffset = headerHeight;

      // Find the y range for the entry's month
      for (let m = 1; m < move.entry.month; m++) {
        const mEntries = entriesByMonth[m] || [];
        const mRows = monthRows[m] || 3;
        const maxRow = mEntries.reduce((max, ent) => Math.max(max, ent.row_index), mRows - 1);
        yOffset += (maxRow + 1) * 24;
      }

      // Calculate row within the month
      const yInMonth = yInGrid - yOffset;
      const rowAtMouse = Math.max(0, Math.floor(yInMonth / 24));

      setMove(prev => prev ? { ...prev, currentDayStart: clampedStart, currentRowIndex: rowAtMouse } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [move, year, entriesByMonth, monthRows]);

  function handleEntryMouseDown(entry: Entry, clientX: number) {
    moveIntent.current = { entry, startX: clientX };
  }

  function handleCellMouseDown(month: number, day: number, rowIndex: number) {
    isDragging.current = true;
    setDrag({
      startMonth: month,
      startDay: day,
      startRowIndex: rowIndex,
      endMonth: month,
      endDay: day,
      endRowIndex: rowIndex,
    });
  }

  function handleCellMouseEnter(month: number, day: number, rowIndex: number) {
    if (!isDragging.current || !drag) return;
    // Allow cross-month drag but keep the same row
    setDrag((prev) => prev ? { ...prev, endMonth: month, endDay: day, endRowIndex: rowIndex } : null);
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

  async function handleSave(dtoOrArray: CreateEntryDto | ({ id: number } & UpdateEntryDto) | (CreateEntryDto | ({ id: number } & UpdateEntryDto))[]) {
    const dtos = Array.isArray(dtoOrArray) ? dtoOrArray : [dtoOrArray];

    for (const dto of dtos) {
      if ('id' in dto) {
        const { id, ...updates } = dto;
        await updateEntry(id, updates);
      } else {
        await createEntry(dto as CreateEntryDto);
      }
    }
    await loadEntries();
    setEditor(null);
  }

  async function handleDelete(id: number) {
    await deleteEntry(id);
    await loadEntries();
    setEditor(null);
    setSelectedEntry(null);
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

  const categories = useMemo(() => {
    const cats = new Set(entries.map(e => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [entries]);

  const filteredEntryIds = useMemo(() => {
    if (!activeCategory) return null;
    return new Set(entries.filter(e => e.category === activeCategory).map(e => e.id));
  }, [entries, activeCategory]);

  // Today's date for header highlighting
  const today = new Date();
  const todayDay = today.getDate();

  return (
    <div className={styles.wrapper}>
      <div className={styles.mainContent}>
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
            const isTodayHeader = day === todayDay;
            return (
              <div
                key={i}
                className={[
                  styles.headerDay,
                  highlightedCol === day ? styles.headerDayActive : '',
                  isTodayHeader ? styles.headerToday : '',
                ].filter(Boolean).join(' ')}
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

          {/* Moving entry overlay - floats above grid to not push other entries */}
          {move && (() => {
            const entry = move.entry;
            const span = move.span + 1;
            const currentDayStart = move.currentDayStart;
            const currentRowIndex = move.currentRowIndex;

            // Calculate top position: header + sum of rows for previous months + currentRowIndex
            let topOffset = 32; // header row (with padding)
            for (let m = 1; m < entry.month; m++) {
              const rows = monthRows[m] || 3;
              const mEntries = entriesByMonth[m] || [];
              const maxRow = mEntries.reduce((max, e) => Math.max(max, e.row_index), rows - 1);
              topOffset += (maxRow + 1) * 24;
            }
            topOffset += currentRowIndex * 24;

            // Calculate left position: month label + day offset
            const leftOffset = 72 + (currentDayStart - 1) * 40;

            return (
              <div
                className={styles.movingOverlay}
                style={{
                  position: 'absolute',
                  top: `${topOffset}px`,
                  left: `${leftOffset}px`,
                  width: `${span * 40 - 2}px`,
                  height: '22px',
                  backgroundColor: entry.color,
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 6px',
                  cursor: 'grabbing',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  zIndex: 100,
                  pointerEvents: 'none',
                  opacity: 0.9,
                }}
              >
                {entry.emoji && <span style={{ marginRight: '4px' }}>{entry.emoji}</span>}
                <span style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: '#fff',
                }}>
                  {entry.title}
                </span>
              </div>
            );
          })()}
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
          endMonth={editor.endMonth}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
