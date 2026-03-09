import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../shared/types';
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../api/entries';
import { useHistory } from './HistoryContext';
import type { HistoryAction } from '../types/history';

interface EntriesContextValue {
  entries: Entry[];
  entriesByMonth: Record<number, Entry[]>;
  categories: string[];
  activeCategory: string | null;
  setActiveCategory: (category: string | null) => void;
  loading: boolean;
  // CRUD operations
  createNewEntry: (dto: CreateEntryDto) => Promise<Entry>;
  updateExistingEntry: (id: number, dto: UpdateEntryDto) => Promise<Entry>;
  deleteExistingEntry: (id: number) => Promise<void>;
  // Batch operations
  saveEntries: (dtos: (CreateEntryDto | ({ id: number } & UpdateEntryDto))[]) => Promise<void>;
  // Refresh
  loadEntries: () => Promise<void>;
}

const EntriesContext = createContext<EntriesContextValue | null>(null);

interface EntriesProviderProps {
  children: ReactNode;
  year: number;
}

export function EntriesProvider({ children, year }: EntriesProviderProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { recordAction, registerExecutors } = useHistory();

  // Load entries from API
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEntries(year);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [year]);

  // Execute undo action
  const executeUndo = useCallback(async (action: HistoryAction) => {
    switch (action.type) {
      case 'create':
        for (const entry of action.entries) {
          await deleteEntry(entry.id);
        }
        break;
      case 'update':
        await updateEntry(action.before.id, {
          month: action.before.month,
          end_month: action.before.end_month,
          title: action.before.title,
          description: action.before.description,
          url: action.before.url,
          category: action.before.category,
          color: action.before.color,
          emoji: action.before.emoji,
          day_start: action.before.day_start,
          day_end: action.before.day_end,
          row_index: action.before.row_index,
          departure_time: action.before.departure_time,
          arrival_time: action.before.arrival_time,
          is_private: action.before.is_private,
          is_tentative: action.before.is_tentative,
        });
        break;
      case 'delete':
        // Recreate deleted entries and update their IDs in the action
        for (let i = 0; i < action.entries.length; i++) {
          const entry = action.entries[i];
          const newEntry = await createEntry({
            year: entry.year,
            month: entry.month,
            end_month: entry.end_month,
            day_start: entry.day_start,
            day_end: entry.day_end,
            row_index: entry.row_index,
            title: entry.title,
            description: entry.description,
            url: entry.url,
            category: entry.category,
            color: entry.color,
            emoji: entry.emoji,
            departure_time: entry.departure_time,
            arrival_time: entry.arrival_time,
            is_private: entry.is_private,
            is_tentative: entry.is_tentative,
          });
          // Update the action entry with the new ID for redo
          action.entries[i] = { ...entry, id: newEntry.id };
        }
        break;
    }
    await loadEntries();
  }, [loadEntries]);

  // Execute redo action
  const executeRedo = useCallback(async (action: HistoryAction) => {
    switch (action.type) {
      case 'create':
        for (const entry of action.entries) {
          await createEntry({
            year: entry.year,
            month: entry.month,
            end_month: entry.end_month,
            day_start: entry.day_start,
            day_end: entry.day_end,
            row_index: entry.row_index,
            title: entry.title,
            description: entry.description,
            url: entry.url,
            category: entry.category,
            color: entry.color,
            emoji: entry.emoji,
            departure_time: entry.departure_time,
            arrival_time: entry.arrival_time,
            is_private: entry.is_private,
            is_tentative: entry.is_tentative,
          });
        }
        break;
      case 'update':
        await updateEntry(action.after.id, {
          month: action.after.month,
          end_month: action.after.end_month,
          title: action.after.title,
          description: action.after.description,
          url: action.after.url,
          category: action.after.category,
          color: action.after.color,
          emoji: action.after.emoji,
          day_start: action.after.day_start,
          day_end: action.after.day_end,
          row_index: action.after.row_index,
          departure_time: action.after.departure_time,
          arrival_time: action.after.arrival_time,
          is_private: action.after.is_private,
          is_tentative: action.after.is_tentative,
        });
        break;
      case 'delete':
        for (const entry of action.entries) {
          await deleteEntry(entry.id);
        }
        break;
    }
    await loadEntries();
  }, [loadEntries]);

  // Register undo/redo executors
  useEffect(() => {
    registerExecutors(executeUndo, executeRedo);
  }, [registerExecutors, executeUndo, executeRedo]);

  // Load entries on year change
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Group entries by month
  const entriesByMonth = useMemo(() => {
    return entries.reduce<Record<number, Entry[]>>((acc, e) => {
      (acc[e.month] ??= []).push(e);
      return acc;
    }, {});
  }, [entries]);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(entries.map(e => e.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [entries]);

  // CRUD operations with history recording
  const createNewEntry = useCallback(async (dto: CreateEntryDto): Promise<Entry> => {
    const newEntry = await createEntry(dto);
    recordAction({ type: 'create', entries: [newEntry] });
    await loadEntries();
    return newEntry;
  }, [recordAction, loadEntries]);

  const updateExistingEntry = useCallback(async (id: number, dto: UpdateEntryDto): Promise<Entry> => {
    const beforeEntry = entries.find(e => e.id === id);
    const afterEntry = await updateEntry(id, dto);
    if (beforeEntry) {
      recordAction({ type: 'update', before: beforeEntry, after: afterEntry });
    }
    await loadEntries();
    return afterEntry;
  }, [entries, recordAction, loadEntries]);

  const deleteExistingEntry = useCallback(async (id: number): Promise<void> => {
    const entryToDelete = entries.find(e => e.id === id);
    await deleteEntry(id);
    if (entryToDelete) {
      recordAction({ type: 'delete', entries: [entryToDelete] });
    }
    await loadEntries();
  }, [entries, recordAction, loadEntries]);

  // Batch save (for editor modal that can create or update)
  const saveEntries = useCallback(async (dtos: (CreateEntryDto | ({ id: number } & UpdateEntryDto))[]) => {
    const createdEntries: Entry[] = [];

    for (const dto of dtos) {
      if ('id' in dto) {
        const { id, ...updates } = dto;
        const beforeEntry = entries.find(e => e.id === id);
        const afterEntry = await updateEntry(id, updates);
        if (beforeEntry) {
          recordAction({ type: 'update', before: beforeEntry, after: afterEntry });
        }
      } else {
        const newEntry = await createEntry(dto as CreateEntryDto);
        createdEntries.push(newEntry);
      }
    }

    if (createdEntries.length > 0) {
      recordAction({ type: 'create', entries: createdEntries });
    }

    await loadEntries();
  }, [entries, recordAction, loadEntries]);

  return (
    <EntriesContext.Provider
      value={{
        entries,
        entriesByMonth,
        categories,
        activeCategory,
        setActiveCategory,
        loading,
        createNewEntry,
        updateExistingEntry,
        deleteExistingEntry,
        saveEntries,
        loadEntries,
      }}
    >
      {children}
    </EntriesContext.Provider>
  );
}

export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext);
  if (!ctx) {
    throw new Error('useEntries must be used within an EntriesProvider');
  }
  return ctx;
}
