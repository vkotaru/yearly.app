export interface UserSettings {
  backgroundCategories?: string[];
  hideBackgroundsInList?: boolean;
  // Add other settings that should sync across devices
}

export async function fetchSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings', {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 401) return {}; // Not logged in
    throw new Error('Failed to fetch settings');
  }
  return res.json();
}

export async function updateSettings(settings: UserSettings): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to save settings');
}

export async function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}
