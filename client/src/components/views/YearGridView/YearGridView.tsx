import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../../shared/types';
import { getDaysInMonth } from '../../../utils/calendar';
import { useSettings, computeDayWidth } from '../../../contexts/SettingsContext';
import { useEntries } from '../../../contexts/EntriesContext';
import {
  calculateMonthOffsets,
  GRID,
} from '../../../utils/entryPosition';
import MonthRow from '../../MonthRow/MonthRow';
import type { DragState } from '../../MonthRow/MonthRow';
import EntryOverlay from '../../EntryOverlay/EntryOverlay';
import EntryEditor from '../../EntryEditor/EntryEditor';
import EntryDetailPanel from '../../EntryDetailPanel/EntryDetailPanel';
import styles from './YearGridView.module.css';

export interface ResizeState {
  entry: Entry;
  originalDayEnd: number;
  currentDayEnd: number;
  originalEndMonth: number;
  currentEndMonth: number;
}

export interface MoveState {
  entry: Entry;
  grabOffset: number;
  currentDayStart: number;
  currentMonth: number;
  currentRowIndex: number;
  span: number;
}

interface EditorState {
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  entry?: Entry;
  endMonth?: number;
}

interface Props {
  year: number;
}

export default function YearGridView({ year }: Props) {
  const { entries, entriesByMonth, activeCategory, saveEntries, deleteExistingEntry, updateExistingEntry } = useEntries();

  const [monthRows, setMonthRows] = useState<Record<number, number>>(
    () => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3]))
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [highlightedCol, setHighlightedCol] = useState<number | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [move, setMove] = useState<MoveState | null>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const isMoving = useRef(false);
  const moveIntent = useRef<{ entry: Entry; startX: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const { settings, dayWidth: settingsDayWidth } = useSettings();
  const rowHeight = settings.gridCellSize;
  const backgroundCategories = settings.backgroundCategories || [];

  // Compute effective dayWidth
  const dayWidth = useMemo(() => {
    if (settings.calendarWidth === -1 && containerWidth > 0) {
      const availableWidth = containerWidth - 40;
      return computeDayWidth(availableWidth);
    }
    return settingsDayWidth;
  }, [settings.calendarWidth, containerWidth, settingsDayWidth]);

  // Measure container width with ResizeObserver
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate month offsets for absolute positioning
  const monthOffsets = useMemo(() => {
    return calculateMonthOffsets(monthRows, entriesByMonth, rowHeight);
  }, [monthRows, entriesByMonth, rowHeight]);

  // Calculate row counts per month
  const monthRowCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      const minRows = monthRows[m] || 3;
      const mEntries = entriesByMonth[m] || [];
      const maxRowIndex = mEntries.reduce((max, e) => Math.max(max, e.row_index), minRows - 1);
      counts[m] = maxRowIndex + 1;
    }
    return counts;
  }, [monthRows, entriesByMonth]);

  // Filter entries by active category
  const filteredEntryIds = useMemo(() => {
    if (!activeCategory) return null;
    return new Set(entries.filter(e => e.category === activeCategory).map(e => e.id));
  }, [entries, activeCategory]);

  // Global mouseup to finish drag, resize, or move
  useEffect(() => {
    async function handleMouseUp() {
      // Finish entry move
      if (isMoving.current && move) {
        isMoving.current = false;
        moveIntent.current = null;
        const newDayStart = move.currentDayStart;
        let newMonth = move.currentMonth;
        let newDayEnd = newDayStart + move.span;
        const newRowIndex = move.currentRowIndex;
        const movingEntry = move.entry;

        // Calculate end_month if entry spans past month boundary
        let newEndMonth = newMonth;
        let maxDay = getDaysInMonth(year, newMonth);
        while (newDayEnd > maxDay && newEndMonth < 12) {
          newDayEnd = newDayEnd - maxDay;
          newEndMonth++;
          maxDay = getDaysInMonth(year, newEndMonth);
        }
        newDayEnd = Math.min(newDayEnd, maxDay);

        const positionChanged =
          newDayStart !== movingEntry.day_start ||
          newMonth !== movingEntry.month ||
          newEndMonth !== (movingEntry.end_month ?? movingEntry.month) ||
          newRowIndex !== movingEntry.row_index;

        if (positionChanged) {
          const monthEntries = entriesByMonth[newMonth] || [];
          const effectiveDayEnd = newEndMonth === newMonth ? newDayEnd : maxDay;
          const hasConflict = monthEntries.some(e => {
            if (e.id === movingEntry.id) return false;
            if (e.row_index !== newRowIndex) return false;
            return !(effectiveDayEnd < e.day_start || newDayStart > e.day_end);
          });

          if (hasConflict) {
            const usedRows = new Set<number>();
            for (const e of monthEntries) {
              if (e.id === movingEntry.id) continue;
              if (!(effectiveDayEnd < e.day_start || newDayStart > e.day_end)) {
                usedRows.add(e.row_index);
              }
            }
            let freeRow = 0;
            while (usedRows.has(freeRow)) freeRow++;

            await updateExistingEntry(movingEntry.id, {
              month: newMonth,
              end_month: newEndMonth,
              day_start: newDayStart,
              day_end: newDayEnd,
              row_index: freeRow,
            });
          } else {
            await updateExistingEntry(movingEntry.id, {
              month: newMonth,
              end_month: newEndMonth,
              day_start: newDayStart,
              day_end: newDayEnd,
              row_index: newRowIndex,
            });
          }
        }
        setMove(null);
        return;
      }

      // Entry click (mousedown without enough movement)
      if (moveIntent.current) {
        const entry = moveIntent.current.entry;
        moveIntent.current = null;
        setSelectedEntry(entry);
        return;
      }

      // Finish resize
      if (isResizing.current && resize) {
        isResizing.current = false;
        const resizingEntry = resize.entry;
        const newDayEnd = resize.currentDayEnd;
        const newEndMonth = resize.currentEndMonth;

        const changed =
          newDayEnd !== resize.originalDayEnd ||
          newEndMonth !== resize.originalEndMonth;

        if (changed) {
          const monthEntries = entriesByMonth[resizingEntry.month] || [];
          const hasConflict = monthEntries.some(e => {
            if (e.id === resizingEntry.id) return false;
            if (e.row_index !== resizingEntry.row_index) return false;
            return !(newDayEnd < e.day_start || resizingEntry.day_start > e.day_end);
          });

          if (hasConflict) {
            const usedRows = new Set<number>();
            for (const e of monthEntries) {
              if (e.id === resizingEntry.id) continue;
              if (!(newDayEnd < e.day_start || resizingEntry.day_start > e.day_end)) {
                usedRows.add(e.row_index);
              }
            }
            let freeRow = 0;
            while (usedRows.has(freeRow)) freeRow++;

            await updateExistingEntry(resizingEntry.id, {
              day_end: newDayEnd,
              end_month: newEndMonth,
              row_index: freeRow,
            });
          } else {
            await updateExistingEntry(resizingEntry.id, {
              day_end: newDayEnd,
              end_month: newEndMonth,
            });
          }
        }
        setResize(null);
        return;
      }

      // Finish drag-to-create
      if (isDragging.current && drag) {
        isDragging.current = false;

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
          endMonth: endMonth !== startMonth ? endMonth : undefined,
        });
        setDrag(null);
      }
    }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [drag, resize, move, entriesByMonth, updateExistingEntry, year]);

  // Global mousemove during resize
  useEffect(() => {
    if (!resize) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing.current || !resize || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();
      const xInGrid = e.clientX - gridRect.left - GRID.MONTH_LABEL_WIDTH;
      if (xInGrid < 0) return;

      const day = Math.floor(xInGrid / dayWidth) + 1;
      const currentMonth = resize.entry.month;
      const maxDay = getDaysInMonth(year, currentMonth);

      if (day > maxDay && currentMonth < 12) {
        const nextMonth = currentMonth + 1;
        const dayInNextMonth = Math.min(day - maxDay, getDaysInMonth(year, nextMonth));
        setResize(prev => prev ? {
          ...prev,
          currentDayEnd: dayInNextMonth,
          currentEndMonth: nextMonth,
        } : null);
      } else {
        const clampedDay = Math.max(resize.entry.day_start, Math.min(day, maxDay));
        setResize(prev => prev ? {
          ...prev,
          currentDayEnd: clampedDay,
          currentEndMonth: currentMonth,
        } : null);
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [resize, year, dayWidth]);

  // Detect move threshold
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!moveIntent.current || isMoving.current || isResizing.current || !gridRef.current) return;
      const dx = Math.abs(e.clientX - moveIntent.current.startX);
      if (dx > 5) {
        isMoving.current = true;
        const entry = moveIntent.current.entry;
        const gridRect = gridRef.current.getBoundingClientRect();
        const xInGrid = moveIntent.current.startX - gridRect.left - GRID.MONTH_LABEL_WIDTH;
        const grabDay = Math.max(1, Math.floor(xInGrid / dayWidth) + 1);
        const grabOffset = grabDay - entry.day_start;

        const startMonth = entry.month;
        const endMonth = entry.end_month ?? entry.month;
        let totalSpan = 0;
        if (startMonth === endMonth) {
          totalSpan = entry.day_end - entry.day_start;
        } else {
          totalSpan += getDaysInMonth(year, startMonth) - entry.day_start + 1;
          for (let m = startMonth + 1; m < endMonth; m++) {
            totalSpan += getDaysInMonth(year, m);
          }
          totalSpan += entry.day_end;
          totalSpan -= 1;
        }

        setMove({
          entry,
          grabOffset,
          currentDayStart: entry.day_start,
          currentMonth: entry.month,
          currentRowIndex: entry.row_index,
          span: totalSpan,
        });
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [year, dayWidth]);

  // Global mousemove during move
  useEffect(() => {
    if (!move) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isMoving.current || !move || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();

      const xInGrid = e.clientX - gridRect.left - GRID.MONTH_LABEL_WIDTH;
      const dayAtMouse = Math.floor(xInGrid / dayWidth) + 1;
      let newDayStart = dayAtMouse - move.grabOffset;

      const yInGrid = e.clientY - gridRect.top;

      let targetMonth = move.currentMonth;
      let targetRowIndex = move.currentRowIndex;

      for (let i = 0; i < monthOffsets.length; i++) {
        const current = monthOffsets[i];
        const nextYOffset = i < monthOffsets.length - 1
          ? monthOffsets[i + 1].yOffset
          : current.yOffset + current.rowCount * rowHeight;

        if (yInGrid >= current.yOffset && yInGrid < nextYOffset) {
          targetMonth = current.month;
          const yInMonth = yInGrid - current.yOffset;
          targetRowIndex = Math.max(0, Math.floor(yInMonth / rowHeight));
          break;
        }
      }

      let maxDay = getDaysInMonth(year, targetMonth);

      while (newDayStart > maxDay && targetMonth < 12) {
        newDayStart = newDayStart - maxDay;
        targetMonth++;
        maxDay = getDaysInMonth(year, targetMonth);
      }

      while (newDayStart < 1 && targetMonth > 1) {
        targetMonth--;
        maxDay = getDaysInMonth(year, targetMonth);
        newDayStart = newDayStart + maxDay;
      }

      const clampedStart = Math.max(1, Math.min(newDayStart, maxDay));

      setMove(prev => prev ? {
        ...prev,
        currentDayStart: clampedStart,
        currentMonth: targetMonth,
        currentRowIndex: targetRowIndex,
      } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [move, year, monthOffsets, dayWidth, rowHeight]);

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
    setDrag(prev => prev ? { ...prev, endMonth: month, endDay: day, endRowIndex: rowIndex } : null);
  }

  function handleResizeStart(entry: Entry) {
    isResizing.current = true;
    setResize({
      entry,
      originalDayEnd: entry.day_end,
      currentDayEnd: entry.day_end,
      originalEndMonth: entry.end_month ?? entry.month,
      currentEndMonth: entry.end_month ?? entry.month,
    });
  }

  function handleAddRow(month: number) {
    setMonthRows(prev => ({ ...prev, [month]: (prev[month] || 3) + 1 }));
  }

  async function handleSave(dtoOrArray: CreateEntryDto | ({ id: number } & UpdateEntryDto) | (CreateEntryDto | ({ id: number } & UpdateEntryDto))[]) {
    const dtos = Array.isArray(dtoOrArray) ? dtoOrArray : [dtoOrArray];
    await saveEntries(dtos);
    setEditor(null);
  }

  async function handleDelete(id: number) {
    await deleteExistingEntry(id);
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
      endMonth: selectedEntry.end_month !== selectedEntry.month ? selectedEntry.end_month : undefined,
    });
    setSelectedEntry(null);
  }

  const today = new Date();
  const todayDay = today.getDate();

  useEffect(() => {
    document.documentElement.style.setProperty('--grid-day-width', `${dayWidth}px`);
  }, [dayWidth]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.mainContent} ref={mainContentRef}>
        <div className={styles.stickyHeader}>
          <div className={styles.dayHeaderRow}>
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
          </div>
        </div>

        <div className={styles.gridCenter}>
          <div className={styles.grid} ref={gridRef}>
            {Array.from({ length: 12 }, (_, i) => {
              const month = i + 1;
              return (
                <MonthRow
                  key={month}
                  year={year}
                  month={month}
                  rowCount={monthRowCounts[month]}
                  drag={drag}
                  highlightedCol={highlightedCol}
                  onCellMouseDown={handleCellMouseDown}
                  onCellMouseEnter={handleCellMouseEnter}
                  onAddRow={handleAddRow}
                />
              );
            })}

            <div className={styles.entryLayer}>
              {entries.map(entry => (
                <EntryOverlay
                  key={entry.id}
                  entry={entry}
                  year={year}
                  monthOffsets={monthOffsets}
                  rowHeight={rowHeight}
                  dayWidth={dayWidth}
                  isDimmed={filteredEntryIds !== null && !filteredEntryIds.has(entry.id)}
                  isBeingMoved={entry.id === move?.entry.id}
                  isResizing={entry.id === resize?.entry.id}
                  isBackground={!!entry.category && backgroundCategories.includes(entry.category)}
                  resizeDayEnd={entry.id === resize?.entry.id ? resize.currentDayEnd : undefined}
                  resizeEndMonth={entry.id === resize?.entry.id ? resize.currentEndMonth : undefined}
                  onMouseDown={handleEntryMouseDown}
                  onResizeStart={handleResizeStart}
                />
              ))}
            </div>

            {move && (() => {
              const entry = move.entry;
              const span = move.span + 1;
              const currentDayStart = move.currentDayStart;
              const currentMonth = move.currentMonth;
              const currentRowIndex = move.currentRowIndex;

              const monthInfo = monthOffsets.find(m => m.month === currentMonth);
              if (!monthInfo) return null;

              const topOffset = monthInfo.yOffset + currentRowIndex * rowHeight;
              const leftOffset = GRID.MONTH_LABEL_WIDTH + (currentDayStart - 1) * dayWidth;

              return (
                <div
                  className={styles.movingOverlay}
                  style={{
                    position: 'absolute',
                    top: `${topOffset}px`,
                    left: `${leftOffset}px`,
                    width: `${span * dayWidth - 2}px`,
                    height: `${rowHeight - 2}px`,
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
