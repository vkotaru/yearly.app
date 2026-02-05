import type { Entry } from '../../../shared/types';

export interface CellSlot {
  type: 'empty' | 'start' | 'continuation';
  entry?: Entry;
}

/**
 * For a given month, compute a 2D grid of slots:
 * rows[rowIndex][dayIndex] = CellSlot
 *
 * Each entry occupies one row and spans from day_start to day_end.
 * The 'start' cell is at day_start, and day_start+1..day_end are 'continuation'.
 */
export function computeRowSlots(
  entries: Entry[],
  daysInMonth: number,
  minRows: number
): CellSlot[][] {
  const maxRowIndex = entries.reduce((max, e) => Math.max(max, e.row_index), minRows - 1);
  const rowCount = maxRowIndex + 1;

  // Initialize empty grid
  const rows: CellSlot[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: daysInMonth }, () => ({ type: 'empty' as const }))
  );

  // Place entries
  for (const entry of entries) {
    const ri = entry.row_index;
    if (ri >= rowCount) continue;

    for (let d = entry.day_start; d <= Math.min(entry.day_end, daysInMonth); d++) {
      const dayIdx = d - 1; // 0-based
      rows[ri][dayIdx] = {
        type: d === entry.day_start ? 'start' : 'continuation',
        entry,
      };
    }
  }

  return rows;
}
