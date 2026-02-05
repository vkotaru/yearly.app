import type { Entry, CreateEntryDto, UpdateEntryDto } from '../../../shared/types';

const BASE = '/api/entries';

export async function fetchEntries(year: number): Promise<Entry[]> {
  const res = await fetch(`${BASE}/${year}`);
  if (!res.ok) throw new Error('Failed to fetch entries');
  return res.json();
}

export async function createEntry(dto: CreateEntryDto): Promise<Entry> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error('Failed to create entry');
  return res.json();
}

export async function updateEntry(id: number, dto: UpdateEntryDto): Promise<Entry> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) throw new Error('Failed to update entry');
  return res.json();
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete entry');
}
