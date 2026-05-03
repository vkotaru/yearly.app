import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../shared/types';
import { fetchEntries, createEntry as apiCreateEntry, updateEntry as apiUpdateEntry, deleteEntry as apiDeleteEntry } from '../api/entries';
import { db, type DexieEntry } from '../lib/db';
import { addToPendingSync, isOnline, onConnectivityChange, pullChanges } from '../lib/sync';
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

// ── ID mapping ──
// Components use entry.id (number). We map:
//   serverId > 0  → id = serverId
//   local-only    → id = -(localId)  (negative, so no collision)

function dexieToEntry(d: DexieEntry): Entry {
  return {
    id: d.serverId ?? -(d.localId!),
    year: d.year,
    month: d.month,
    end_month: d.end_month,
    day_start: d.day_start,
    day_end: d.day_end,
    row_index: d.row_index,
    title: d.title,
    description: d.description,
    url: d.url,
    color: d.color,
    category: d.category,
    emoji: d.emoji,
    departure_time: d.departure_time,
    arrival_time: d.arrival_time,
    user_id: d.user_id,
    is_private: d.is_private,
    is_tentative: d.is_tentative,
    created_at: d.created_at,
    updated_at: d.updated_at,
    incomplete_todos: d.incomplete_todos,
  };
}

async function findDexieEntry(id: number): Promise<DexieEntry | undefined> {
  if (id > 0) {
    // Server ID
    return db.entries.where('serverId').equals(id).first();
  }
  // Local ID (negative → positive)
  return db.entries.get(-id);
}

export function EntriesProvider({ children, year }: EntriesProviderProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { recordAction, registerExecutors } = useHistory();

  // Load entries from Dexie, then refresh from API in background
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Read from Dexie (instant, works offline)
      let localEntries: DexieEntry[] = [];
      try {
        localEntries = await db.entries
          .where('year')
          .equals(year)
          .filter(e => !e._deleted)
          .toArray();
      } catch {
        // IndexedDB unavailable (private browsing, quota) — fall through to API
      }

      setEntries(localEntries.map(dexieToEntry));
      if (localEntries.length > 0) {
        setLoading(false);
      }

      // 2. Fetch from API (background refresh)
      if (isOnline()) {
        try {
          const remote = await fetchEntries(year);

          // Upsert remote entries into Dexie
          try {
            for (const entry of remote) {
              const existing = await db.entries.where('serverId').equals(entry.id).first();
              if (existing) {
                await db.entries.update(existing.localId!, {
                  ...entryToDexie(entry),
                  serverId: entry.id,
                });
              } else {
                await db.entries.add({
                  ...entryToDexie(entry),
                  serverId: entry.id,
                });
              }
            }

            // Remove local entries with serverIds that no longer exist on server
            const remoteIds = new Set(remote.map(e => e.id));
            const allLocal = await db.entries.where('year').equals(year).toArray();
            for (const le of allLocal) {
              if (le.serverId && !remoteIds.has(le.serverId) && !le._deleted) {
                const pending = await db.pendingSync
                  .where('localId')
                  .equals(le.localId!)
                  .count();
                if (pending === 0) {
                  await db.entries.delete(le.localId!);
                }
              }
            }

            // Re-read from Dexie to get merged state
            const merged = await db.entries
              .where('year')
              .equals(year)
              .filter(e => !e._deleted)
              .toArray();
            setEntries(merged.map(dexieToEntry));
          } catch {
            // Dexie write failed — use API data directly
            setEntries(remote);
          }

          // Pull incremental changes from sync endpoint (if available)
          await pullChanges();
        } catch {
          // API unavailable — continue with local data
        }
      }
    } finally {
      setLoading(false);
    }
  }, [year]);

  // Execute undo action
  const executeUndo = useCallback(async (action: HistoryAction) => {
    switch (action.type) {
      case 'create':
        for (const entry of action.entries) {
          await doDelete(entry.id);
        }
        break;
      case 'update':
        await doUpdate(action.before.id, {
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
        for (let i = 0; i < action.entries.length; i++) {
          const entry = action.entries[i];
          const newEntry = await doCreate({
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
          await doCreate({
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
        await doUpdate(action.after.id, {
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
          await doDelete(entry.id);
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

  // Re-sync when coming back online
  useEffect(() => {
    return onConnectivityChange((online) => {
      if (online) loadEntries();
    });
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
    const newEntry = await doCreate(dto);
    recordAction({ type: 'create', entries: [newEntry] });
    await loadEntries();
    return newEntry;
  }, [recordAction, loadEntries]);

  const updateExistingEntry = useCallback(async (id: number, dto: UpdateEntryDto): Promise<Entry> => {
    const beforeEntry = entries.find(e => e.id === id);
    const afterEntry = await doUpdate(id, dto);
    if (beforeEntry) {
      recordAction({ type: 'update', before: beforeEntry, after: afterEntry });
    }
    await loadEntries();
    return afterEntry;
  }, [entries, recordAction, loadEntries]);

  const deleteExistingEntry = useCallback(async (id: number): Promise<void> => {
    const entryToDelete = entries.find(e => e.id === id);
    await doDelete(id);
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
        const afterEntry = await doUpdate(id, updates);
        if (beforeEntry) {
          recordAction({ type: 'update', before: beforeEntry, after: afterEntry });
        }
      } else {
        const newEntry = await doCreate(dto as CreateEntryDto);
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

// ── Core mutation helpers: Dexie-first, API-second ──

function entryToDexie(entry: Entry | CreateEntryDto & { id?: number }): Omit<DexieEntry, 'localId' | 'serverId'> {
  const now = new Date().toISOString();
  return {
    year: entry.year,
    month: entry.month,
    end_month: ('end_month' in entry ? entry.end_month : undefined) ?? entry.month,
    day_start: entry.day_start,
    day_end: entry.day_end,
    row_index: entry.row_index,
    title: ('title' in entry ? entry.title : undefined) ?? '',
    description: ('description' in entry ? entry.description : undefined) ?? '',
    url: ('url' in entry ? entry.url : undefined) ?? '',
    color: ('color' in entry ? entry.color : undefined) ?? '',
    category: ('category' in entry ? entry.category : undefined) ?? '',
    emoji: ('emoji' in entry ? entry.emoji : undefined) ?? '',
    departure_time: ('departure_time' in entry ? entry.departure_time : undefined) ?? '',
    arrival_time: ('arrival_time' in entry ? entry.arrival_time : undefined) ?? '',
    user_id: 'user_id' in entry ? entry.user_id as number | undefined : undefined,
    is_private: ('is_private' in entry ? entry.is_private : undefined) ?? false,
    is_tentative: ('is_tentative' in entry ? entry.is_tentative : undefined) ?? false,
    incomplete_todos: 'incomplete_todos' in entry ? entry.incomplete_todos as number | undefined : undefined,
    created_at: ('created_at' in entry ? entry.created_at as string : undefined) ?? now,
    updated_at: now,
  };
}

async function doCreate(dto: CreateEntryDto): Promise<Entry> {
  const now = new Date().toISOString();
  const dexieData: Omit<DexieEntry, 'localId'> = {
    ...entryToDexie(dto as any),
    created_at: now,
    updated_at: now,
  };

  // 1. Write to Dexie
  let localId: number | undefined;
  try {
    localId = await db.entries.add(dexieData as DexieEntry);
  } catch {
    // IndexedDB unavailable — go straight to API
  }

  if (localId) {
    const local = (await db.entries.get(localId))!;
    const entry = dexieToEntry(local);

    // 2. Sync to server
    if (isOnline()) {
      try {
        const serverEntry = await apiCreateEntry(dto);
        await db.entries.update(localId, { serverId: serverEntry.id });
        entry.id = serverEntry.id;
      } catch {
        await addToPendingSync('entries', 'create', dto as unknown as Record<string, unknown>, localId);
      }
    } else {
      await addToPendingSync('entries', 'create', dto as unknown as Record<string, unknown>, localId);
    }

    return entry;
  }

  // Fallback: API-only (no local storage available)
  return apiCreateEntry(dto);
}

async function doUpdate(id: number, dto: UpdateEntryDto): Promise<Entry> {
  const dexieEntry = await findDexieEntry(id);
  if (!dexieEntry) {
    // Fallback: direct API call (entry not in Dexie yet)
    return apiUpdateEntry(id > 0 ? id : -id, dto);
  }

  // 1. Update Dexie
  const updates = { ...dto, updated_at: new Date().toISOString() };
  await db.entries.update(dexieEntry.localId!, updates);
  const updated = (await db.entries.get(dexieEntry.localId!))!;
  const entry = dexieToEntry(updated);

  // 2. Sync to server
  if (dexieEntry.serverId) {
    if (isOnline()) {
      try {
        await apiUpdateEntry(dexieEntry.serverId, dto);
      } catch (err) {
        console.error('[doUpdate] apiUpdateEntry failed — queued for sync. dto=', dto, 'err=', err);
        await addToPendingSync('entries', 'update', dto as unknown as Record<string, unknown>, dexieEntry.localId, dexieEntry.serverId);
      }
    } else {
      await addToPendingSync('entries', 'update', dto as unknown as Record<string, unknown>, dexieEntry.localId, dexieEntry.serverId);
    }
  } else {
    // Local-only entry — update the pending create payload
    await addToPendingSync('entries', 'update', dto as unknown as Record<string, unknown>, dexieEntry.localId);
  }

  return entry;
}

async function doDelete(id: number): Promise<void> {
  const dexieEntry = await findDexieEntry(id);
  if (!dexieEntry) {
    // Fallback: direct API call
    if (id > 0) await apiDeleteEntry(id);
    return;
  }

  // 1. Soft-delete in Dexie (mark as deleted, remove from queries)
  await db.entries.update(dexieEntry.localId!, { _deleted: true });

  // 2. Sync to server
  if (dexieEntry.serverId) {
    if (isOnline()) {
      try {
        await apiDeleteEntry(dexieEntry.serverId);
        await db.entries.delete(dexieEntry.localId!);
      } catch {
        await addToPendingSync('entries', 'delete', {}, dexieEntry.localId, dexieEntry.serverId);
      }
    } else {
      await addToPendingSync('entries', 'delete', {}, dexieEntry.localId, dexieEntry.serverId);
    }
  } else {
    // Local-only — just hard-delete
    await db.entries.delete(dexieEntry.localId!);
  }
}
