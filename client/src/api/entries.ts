import type { Entry, Comment, Todo, CreateEntryDto, UpdateEntryDto, CreateTodoDto, UpdateTodoDto } from '../../../shared/types';

const BASE = '/api/entries';

export async function fetchEntries(year: number): Promise<Entry[]> {
  const res = await fetch(`${BASE}/${year}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch entries');
  return res.json();
}

export async function createEntry(dto: CreateEntryDto): Promise<Entry> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to create entry');
  return res.json();
}

export async function updateEntry(id: number, dto: UpdateEntryDto): Promise<Entry> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to update entry');
  return res.json();
}

export async function deleteEntry(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete entry');
}

// ── Comments ──

export async function fetchComments(entryId: number): Promise<Comment[]> {
  const res = await fetch(`${BASE}/${entryId}/comments`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch comments');
  return res.json();
}

export async function createComment(entryId: number, text: string, author?: string): Promise<Comment> {
  const res = await fetch(`${BASE}/${entryId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, author }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to create comment');
  return res.json();
}

export async function deleteComment(commentId: number): Promise<void> {
  const res = await fetch(`${BASE}/comments/${commentId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete comment');
}

// ── Todos ──

export async function fetchTodos(entryId: number): Promise<Todo[]> {
  const res = await fetch(`${BASE}/${entryId}/todos`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch todos');
  return res.json();
}

export async function createTodo(entryId: number, text: string): Promise<Todo> {
  const res = await fetch(`${BASE}/${entryId}/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to create todo');
  return res.json();
}

export async function updateTodo(todoId: number, updates: UpdateTodoDto): Promise<Todo> {
  const res = await fetch(`${BASE}/todos/${todoId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to update todo');
  return res.json();
}

export async function deleteTodo(todoId: number): Promise<void> {
  const res = await fetch(`${BASE}/todos/${todoId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete todo');
}
