export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/backup', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to download backup');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yearly-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreBackup(file: File): Promise<{ entries: number; comments: number; todos: number }> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file');
  }

  const res = await fetch('/api/backup/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Restore failed' }));
    throw new Error(err.error || 'Restore failed');
  }

  const result = await res.json();
  return result.restored;
}
