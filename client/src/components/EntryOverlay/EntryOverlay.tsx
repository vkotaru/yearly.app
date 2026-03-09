import { useMemo } from 'react';
import type { Entry } from '../../../../shared/types';
import {
  calculateCrossMonthSegments,
  getTextColor,
  type MonthRowInfo,
} from '../../utils/entryPosition';
import styles from './EntryOverlay.module.css';

interface Props {
  entry: Entry;
  year: number;
  monthOffsets: MonthRowInfo[];
  rowHeight: number;
  dayWidth: number;
  isDimmed: boolean;
  isBeingMoved: boolean;
  isResizing: boolean;
  isBackground?: boolean;
  resizeDayEnd?: number;
  resizeEndMonth?: number;
  onMouseDown: (entry: Entry, clientX: number) => void;
  onResizeStart: (entry: Entry) => void;
}

export default function EntryOverlay({
  entry, year, monthOffsets, rowHeight, dayWidth, isDimmed, isBeingMoved, isResizing,
  isBackground = false, resizeDayEnd, resizeEndMonth,
  onMouseDown, onResizeStart,
}: Props) {
  // Adjust entry dimensions if resizing
  const adjustedEntry = useMemo(() => {
    if (!isResizing || resizeDayEnd == null) return entry;
    return {
      ...entry,
      day_end: resizeDayEnd,
      end_month: resizeEndMonth ?? entry.end_month,
    };
  }, [entry, isResizing, resizeDayEnd, resizeEndMonth]);

  const segments = useMemo(
    () => calculateCrossMonthSegments(adjustedEntry, year, monthOffsets, rowHeight, dayWidth),
    [adjustedEntry, year, monthOffsets, rowHeight, dayWidth]
  );

  const isPast = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endMonth = entry.end_month ?? entry.month;
    const endDate = new Date(year, endMonth - 1, entry.day_end);
    return endDate < todayStart;
  }, [entry, year]);

  const textColor = getTextColor(entry.color);

  const tooltip = [
    entry.is_tentative ? '(Tentative)' : '',
    entry.title,
    entry.description,
    entry.url,
    entry.category && `[${entry.category}]`,
  ].filter(Boolean).join('\n');

  return (
    <>
      {segments.map((segment) => (
        <div
          key={`${entry.id}-${segment.month}`}
          className={[
            styles.entryOverlay,
            isPast ? styles.past : '',
            entry.is_tentative ? styles.tentative : '',
            isBackground ? styles.background : '',
            !segment.isStart ? styles.continuationLeft : '',
            !segment.isEnd ? styles.continuationRight : '',
          ].filter(Boolean).join(' ')}
          style={{
            top: segment.top,
            left: segment.left,
            width: segment.width,
            height: segment.height,
            backgroundColor: entry.color,
            color: textColor,
            opacity: isBeingMoved ? 0.3 : isDimmed ? 0.2 : isBackground ? 0.4 : 1,
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            onMouseDown(entry, e.clientX);
          }}
          title={tooltip}
        >
          {/* Only show content on first segment */}
          {segment.isStart && (
            <>
              {entry.emoji && <span className={styles.emoji}>{entry.emoji}</span>}
              <span className={styles.title}>{entry.title}</span>
              {entry.incomplete_todos != null && entry.incomplete_todos > 0 && (
                <span className={styles.todoBadge} title={`${entry.incomplete_todos} item${entry.incomplete_todos > 1 ? 's' : ''} left`}>
                  {entry.incomplete_todos}
                </span>
              )}
              {entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkIcon}
                  onClick={(e) => e.stopPropagation()}
                  title={entry.url}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              )}
            </>
          )}

          {/* Resize handle only on last segment */}
          {segment.isEnd && (
            <div
              className={styles.resizeHandle}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResizeStart(entry);
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}
