import type { Entry } from '../../../shared/types';
import { getDaysInMonth } from './calendar';

// Grid dimension constants (centralized for consistency)
// Note: ROW_HEIGHT and DAY_WIDTH are defaults; actual values come from settings
export const GRID = {
  DEFAULT_DAY_WIDTH: 40,
  DEFAULT_ROW_HEIGHT: 24,
  MONTH_LABEL_WIDTH: 72,
  HEADER_HEIGHT: 0,  // Day header is now in sticky header, outside the grid
  ENTRY_MARGIN: 1,
} as const;

export interface MonthRowInfo {
  month: number;
  rowCount: number;
  yOffset: number;  // Cumulative Y position from top of grid (after header)
}

/**
 * Calculate the cumulative Y offset for each month based on row counts.
 * This is needed for positioning entries as absolute overlays.
 */
export function calculateMonthOffsets(
  monthRows: Record<number, number>,
  entriesByMonth: Record<number, Entry[]>,
  rowHeight: number = GRID.DEFAULT_ROW_HEIGHT
): MonthRowInfo[] {
  const result: MonthRowInfo[] = [];
  let yOffset = GRID.HEADER_HEIGHT;

  for (let m = 1; m <= 12; m++) {
    const minRows = monthRows[m] || 3;
    const mEntries = entriesByMonth[m] || [];
    const maxRowIndex = mEntries.reduce((max, e) => Math.max(max, e.row_index), minRows - 1);
    const rowCount = maxRowIndex + 1;

    result.push({ month: m, rowCount, yOffset });
    yOffset += rowCount * rowHeight;
  }

  return result;
}

export interface EntryPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Calculate pixel position for a single-month entry.
 */
export function calculateEntryPosition(
  entry: Entry,
  monthOffsets: MonthRowInfo[],
  year: number,
  rowHeight: number = GRID.DEFAULT_ROW_HEIGHT,
  dayWidth: number = GRID.DEFAULT_DAY_WIDTH
): EntryPosition {
  const monthInfo = monthOffsets.find(m => m.month === entry.month);
  if (!monthInfo) throw new Error(`Month ${entry.month} not found`);

  const daysInMonth = getDaysInMonth(year, entry.month);
  const clampedDayEnd = Math.min(entry.day_end, daysInMonth);
  const span = clampedDayEnd - entry.day_start + 1;

  const top = monthInfo.yOffset + (entry.row_index * rowHeight) + GRID.ENTRY_MARGIN;
  const left = GRID.MONTH_LABEL_WIDTH + ((entry.day_start - 1) * dayWidth) + GRID.ENTRY_MARGIN;
  const width = (span * dayWidth) - (2 * GRID.ENTRY_MARGIN);
  const height = rowHeight - (2 * GRID.ENTRY_MARGIN);

  return { top, left, width, height };
}

/**
 * Segment of a cross-month entry in a specific month.
 */
export interface CrossMonthSegment extends EntryPosition {
  month: number;
  isStart: boolean;
  isEnd: boolean;
  dayStart: number;
  dayEnd: number;
}

/**
 * For cross-month entries, calculate position segments for each month.
 * Each segment represents the visible portion of the entry in that month.
 */
export function calculateCrossMonthSegments(
  entry: Entry,
  year: number,
  monthOffsets: MonthRowInfo[],
  rowHeight: number = GRID.DEFAULT_ROW_HEIGHT,
  dayWidth: number = GRID.DEFAULT_DAY_WIDTH
): CrossMonthSegment[] {
  const startMonth = entry.month;
  const endMonth = entry.end_month ?? entry.month;

  const segments: CrossMonthSegment[] = [];

  for (let m = startMonth; m <= endMonth; m++) {
    const monthInfo = monthOffsets.find(mi => mi.month === m);
    if (!monthInfo) continue;

    const isStart = m === startMonth;
    const isEnd = m === endMonth;
    const daysInMonth = getDaysInMonth(year, m);

    // Day range for this segment (clamp to valid days)
    const dayStart = isStart ? Math.min(entry.day_start, daysInMonth) : 1;
    const dayEnd = isEnd ? Math.min(entry.day_end, daysInMonth) : daysInMonth;
    const span = Math.max(1, dayEnd - dayStart + 1);

    const top = monthInfo.yOffset + (entry.row_index * rowHeight) + GRID.ENTRY_MARGIN;
    const left = GRID.MONTH_LABEL_WIDTH + ((dayStart - 1) * dayWidth) + GRID.ENTRY_MARGIN;
    const width = (span * dayWidth) - (2 * GRID.ENTRY_MARGIN);
    const height = rowHeight - (2 * GRID.ENTRY_MARGIN);

    segments.push({
      top, left, width, height,
      month: m,
      isStart,
      isEnd,
      dayStart,
      dayEnd,
    });
  }

  return segments;
}

export interface GridCoords {
  month: number;
  day: number;
  rowIndex: number;
}

/**
 * Convert pixel coordinates (relative to grid) to grid coordinates.
 * Returns the month, day, and row at the given pixel position.
 */
export function pixelToGridCoords(
  clientX: number,
  clientY: number,
  gridRect: DOMRect,
  monthOffsets: MonthRowInfo[],
  rowHeight: number = GRID.DEFAULT_ROW_HEIGHT,
  dayWidth: number = GRID.DEFAULT_DAY_WIDTH
): GridCoords | null {
  const xInGrid = clientX - gridRect.left - GRID.MONTH_LABEL_WIDTH;
  const yInGrid = clientY - gridRect.top;

  if (xInGrid < 0 || yInGrid < 0) return null;

  const day = Math.floor(xInGrid / dayWidth) + 1;
  if (day < 1 || day > 31) return null;

  // Find month by Y position
  for (let i = 0; i < monthOffsets.length; i++) {
    const current = monthOffsets[i];
    const nextYOffset = i < monthOffsets.length - 1
      ? monthOffsets[i + 1].yOffset
      : current.yOffset + current.rowCount * rowHeight;

    if (yInGrid >= current.yOffset && yInGrid < nextYOffset) {
      const yInMonth = yInGrid - current.yOffset;
      const rowIndex = Math.max(0, Math.floor(yInMonth / rowHeight));
      return { month: current.month, day, rowIndex };
    }
  }

  return null;
}

/**
 * Calculate the total height of the grid (for container sizing).
 */
export function calculateGridHeight(
  monthOffsets: MonthRowInfo[],
  rowHeight: number = GRID.DEFAULT_ROW_HEIGHT
): number {
  if (monthOffsets.length === 0) return GRID.HEADER_HEIGHT;
  const lastMonth = monthOffsets[monthOffsets.length - 1];
  return lastMonth.yOffset + (lastMonth.rowCount * rowHeight);
}

/**
 * Determine text color (black or white) based on background luminance.
 * Handles both hex (#rrggbb) and rgba(r, g, b, a) color formats.
 */
export function getTextColor(bgColor: string): string {
  // Try rgba/rgb first
  const rgbaMatch = bgColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
  }

  // Fall back to hex parsing
  const hex = bgColor.replace('#', '');
  if (hex.length < 6) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#000' : '#fff';
}
