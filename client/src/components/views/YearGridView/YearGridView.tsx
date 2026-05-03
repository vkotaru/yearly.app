import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../../../shared/types';
import { getDaysInMonth } from '../../../utils/calendar';
import { useSettings, computeDayWidth } from '../../../contexts/SettingsContext';
import { useEntries } from '../../../contexts/EntriesContext';
import {
  calculateMonthOffsets,
  calculateCrossMonthSegments,
  computeRowCountsByMonth,
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
  const { entries, activeCategory, saveEntries, deleteExistingEntry, updateExistingEntry } = useEntries();

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
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [bottomPadding, setBottomPadding] = useState(20);

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

  // Row counts per month — accounts for cross-month entries so a high
  // row_index in the start month also expands the continuation month(s).
  const monthRowCounts = useMemo(
    () => computeRowCountsByMonth(entries, monthRows),
    [entries, monthRows],
  );

  // Calculate month offsets for absolute positioning
  const monthOffsets = useMemo(
    () => calculateMonthOffsets(monthRowCounts, rowHeight),
    [monthRowCounts, rowHeight],
  );

  // Compute bottom padding so any month (incl. December) can scroll up to just
  // below the sticky day-header. Padding = container - sticky - lastMonth.
  useEffect(() => {
    const main = mainContentRef.current;
    const sticky = stickyHeaderRef.current;
    if (!main || !sticky) return;

    const compute = () => {
      const containerHeight = main.clientHeight;
      const stickyHeight = sticky.offsetHeight;
      const lastMonthRows = monthRowCounts[12] ?? 0;
      const lastMonthHeight = lastMonthRows * rowHeight;
      setBottomPadding(Math.max(20, containerHeight - stickyHeight - lastMonthHeight));
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(main);
    observer.observe(sticky);
    return () => observer.disconnect();
  }, [monthRowCounts, rowHeight]);

  // Convert (month, day) in the current year to a linear day-of-year index
  const dayOfYear = useCallback((month: number, day: number): number => {
    let d = 0;
    for (let m = 1; m < month; m++) d += getDaysInMonth(year, m);
    return d + day;
  }, [year]);

  // Total days in the current year
  const totalDaysInYear = useMemo(() => {
    let d = 0;
    for (let m = 1; m <= 12; m++) d += getDaysInMonth(year, m);
    return d;
  }, [year]);

  // Convert a day-of-year index back to (month, day)
  const doyToMonthDay = useCallback((doy: number): { month: number; day: number } => {
    const clamped = Math.max(1, Math.min(doy, totalDaysInYear));
    let remaining = clamped;
    for (let m = 1; m <= 12; m++) {
      const days = getDaysInMonth(year, m);
      if (remaining <= days) return { month: m, day: remaining };
      remaining -= days;
    }
    return { month: 12, day: getDaysInMonth(year, 12) };
  }, [year, totalDaysInYear]);

  // Clamp a move's starting position so the span (days-after-start) never
  // pushes the end past Dec 31.
  const clampStartToYear = useCallback((
    month: number, day: number, span: number,
  ): { month: number; day: number } => {
    const maxStartDoy = Math.max(1, totalDaysInYear - span);
    const startDoy = dayOfYear(month, day);
    if (startDoy <= maxStartDoy) return { month, day };
    return doyToMonthDay(maxStartDoy);
  }, [dayOfYear, doyToMonthDay, totalDaysInYear]);

  // True if ranges [aStart..aEnd] and [bStart..bEnd] (inclusive, day-of-year) overlap
  const rangesOverlap = useCallback((
    aStartM: number, aStartD: number, aEndM: number, aEndD: number,
    bStartM: number, bStartD: number, bEndM: number, bEndD: number,
  ): boolean => {
    const aStart = dayOfYear(aStartM, aStartD);
    const aEnd = dayOfYear(aEndM, aEndD);
    const bStart = dayOfYear(bStartM, bStartD);
    const bEnd = dayOfYear(bEndM, bEndD);
    return !(aEnd < bStart || aStart > bEnd);
  }, [dayOfYear]);

  // Is a row_index in conflict with any other entry that overlaps the given span?
  // Considers full cross-month spans of both the candidate and existing entries.
  const hasRowConflict = useCallback((
    span: { startMonth: number; startDay: number; endMonth: number; endDay: number; rowIndex: number },
    excludeId: number,
  ): boolean => {
    return entries.some(e => {
      if (e.id === excludeId) return false;
      if (e.row_index !== span.rowIndex) return false;
      const eEndM = e.end_month ?? e.month;
      return rangesOverlap(
        span.startMonth, span.startDay, span.endMonth, span.endDay,
        e.month, e.day_start, eEndM, e.day_end,
      );
    });
  }, [entries, rangesOverlap]);

  // Find the lowest row_index free across every month the span touches
  const findFreeRow = useCallback((
    span: { startMonth: number; startDay: number; endMonth: number; endDay: number },
    excludeId: number,
  ): number => {
    const used = new Set<number>();
    for (const e of entries) {
      if (e.id === excludeId) continue;
      const eEndM = e.end_month ?? e.month;
      if (rangesOverlap(
        span.startMonth, span.startDay, span.endMonth, span.endDay,
        e.month, e.day_start, eEndM, e.day_end,
      )) {
        used.add(e.row_index);
      }
    }
    let r = 0;
    while (used.has(r)) r++;
    return r;
  }, [entries, rangesOverlap]);

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
        const movingEntry = move.entry;

        // Re-clamp to year in case state slipped past; this also hardens
        // against any future caller that leaves currentDayStart past the
        // year boundary.
        const clampedStart = clampStartToYear(
          move.currentMonth, move.currentDayStart, move.span
        );
        const newMonth = clampedStart.month;
        const newDayStart = clampedStart.day;
        const newRowIndex = move.currentRowIndex;

        // Convert start + span back to (end_month, end_day) via day-of-year.
        const endPos = doyToMonthDay(dayOfYear(newMonth, newDayStart) + move.span);
        const newEndMonth = endPos.month;
        const newDayEnd = endPos.day;

        const positionChanged =
          newDayStart !== movingEntry.day_start ||
          newMonth !== movingEntry.month ||
          newEndMonth !== (movingEntry.end_month ?? movingEntry.month) ||
          newRowIndex !== movingEntry.row_index;

        if (positionChanged) {
          const span = {
            startMonth: newMonth,
            startDay: newDayStart,
            endMonth: newEndMonth,
            endDay: newDayEnd,
            rowIndex: newRowIndex,
          };
          const rowIndex = hasRowConflict(span, movingEntry.id)
            ? findFreeRow(span, movingEntry.id)
            : newRowIndex;

          await updateExistingEntry(movingEntry.id, {
            month: newMonth,
            end_month: newEndMonth,
            day_start: newDayStart,
            day_end: newDayEnd,
            row_index: rowIndex,
          });
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
          const span = {
            startMonth: resizingEntry.month,
            startDay: resizingEntry.day_start,
            endMonth: newEndMonth,
            endDay: newDayEnd,
            rowIndex: resizingEntry.row_index,
          };
          if (hasRowConflict(span, resizingEntry.id)) {
            const freeRow = findFreeRow(span, resizingEntry.id);
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
  }, [drag, resize, move, hasRowConflict, findFreeRow, clampStartToYear, dayOfYear, doyToMonthDay, updateExistingEntry, year]);

  // Global mousemove during resize
  useEffect(() => {
    if (!resize) return;
    function handleMouseMove(e: MouseEvent) {
      if (!isResizing.current || !resize || !gridRef.current) return;
      const gridRect = gridRef.current.getBoundingClientRect();
      const xInGrid = e.clientX - gridRect.left - GRID.MONTH_LABEL_WIDTH;
      if (xInGrid < 0) return;

      const dayCol = Math.floor(xInGrid / dayWidth) + 1;
      const startMonth = resize.entry.month;

      // Determine which month row the cursor is over (supports cross-month drag)
      const yInGrid = e.clientY - gridRect.top;
      let hoveredMonth = resize.currentEndMonth;
      for (let i = 0; i < monthOffsets.length; i++) {
        const current = monthOffsets[i];
        const nextYOffset = i < monthOffsets.length - 1
          ? monthOffsets[i + 1].yOffset
          : current.yOffset + current.rowCount * rowHeight;
        if (yInGrid >= current.yOffset && yInGrid < nextYOffset) {
          hoveredMonth = current.month;
          break;
        }
      }

      // End cannot be earlier than start
      if (hoveredMonth < startMonth) {
        hoveredMonth = startMonth;
      }

      const maxDay = getDaysInMonth(year, hoveredMonth);
      let newDay = Math.max(1, Math.min(dayCol, maxDay));
      if (hoveredMonth === startMonth) {
        newDay = Math.max(newDay, resize.entry.day_start);
      }

      setResize(prev => prev ? {
        ...prev,
        currentDayEnd: newDay,
        currentEndMonth: hoveredMonth,
      } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [resize, year, dayWidth, monthOffsets, rowHeight]);

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

      // Don't let the span overflow Dec 31
      const capped = clampStartToYear(targetMonth, clampedStart, move.span);

      setMove(prev => prev ? {
        ...prev,
        currentDayStart: capped.day,
        currentMonth: capped.month,
        currentRowIndex: targetRowIndex,
      } : null);
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [move, year, monthOffsets, dayWidth, rowHeight, clampStartToYear]);

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
      <div
        className={styles.mainContent}
        ref={mainContentRef}
        style={{ paddingBottom: `${bottomPadding}px` }}
      >
        <div className={styles.stickyHeader} ref={stickyHeaderRef}>
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

              // Compute the preview entry's end position by walking `span` days
              // forward from (currentMonth, currentDayStart), rolling into later
              // months as needed. Stops at Dec 31 so the preview never renders
              // outside the year.
              let endMonth = move.currentMonth;
              let endDay = move.currentDayStart + move.span;
              let monthMax = getDaysInMonth(year, endMonth);
              while (endDay > monthMax && endMonth < 12) {
                endDay -= monthMax;
                endMonth++;
                monthMax = getDaysInMonth(year, endMonth);
              }
              if (endDay > monthMax) endDay = monthMax;

              const previewEntry: Entry = {
                ...entry,
                month: move.currentMonth,
                end_month: endMonth,
                day_start: move.currentDayStart,
                day_end: endDay,
                row_index: move.currentRowIndex,
              };

              const segments = calculateCrossMonthSegments(
                previewEntry, year, monthOffsets, rowHeight, dayWidth
              );

              return (
                <>
                  {segments.map(segment => (
                    <div
                      key={`moving-${entry.id}-${segment.month}`}
                      style={{
                        position: 'absolute',
                        top: `${segment.top}px`,
                        left: `${segment.left}px`,
                        width: `${segment.width}px`,
                        height: `${segment.height}px`,
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
                      {segment.isStart && (
                        <>
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
                        </>
                      )}
                    </div>
                  ))}
                </>
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
