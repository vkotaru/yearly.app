import type { Entry } from '../../../shared/types';

/**
 * Represents a reversible action in the history stack
 */
export type HistoryAction =
  | { type: 'create'; entries: Entry[] }           // undo = delete these entries
  | { type: 'update'; before: Entry; after: Entry } // undo = restore 'before' state
  | { type: 'delete'; entries: Entry[] };          // undo = recreate these entries

/**
 * State for the history stack
 */
export interface HistoryState {
  past: HistoryAction[];      // Actions that can be undone (most recent last)
  future: HistoryAction[];    // Actions that were undone and can be redone
}

/**
 * Get a human-readable description of an action
 */
export function getActionDescription(action: HistoryAction): string {
  switch (action.type) {
    case 'create':
      return action.entries.length === 1
        ? `Created "${action.entries[0].title}"`
        : `Created ${action.entries.length} entries`;
    case 'update':
      return `Updated "${action.after.title}"`;
    case 'delete':
      return action.entries.length === 1
        ? `Deleted "${action.entries[0].title}"`
        : `Deleted ${action.entries.length} entries`;
  }
}
