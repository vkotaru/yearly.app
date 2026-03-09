# Google Calendar Auto-Sync Implementation Guide

## Overview

This document outlines the technical approach to integrate the yearly planner app with Google Calendar, enabling automatic synchronization of entries.

---

## Table of Contents

1. [Sync Architecture Options](#sync-architecture-options)
2. [Google Cloud Setup](#google-cloud-setup)
3. [OAuth Modifications](#oauth-modifications)
4. [Database Changes](#database-changes)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Changes](#frontend-changes)
7. [Sync Logic](#sync-logic)
8. [Considerations & Challenges](#considerations--challenges)

---

## Sync Architecture Options

### Option A: One-Way Sync (App → Google)
- Push entries from our app to Google Calendar
- Simpler to implement
- User's Google Calendar becomes read-only mirror
- **Best for**: Personal use where app is source of truth

### Option B: One-Way Sync (Google → App)
- Pull events from Google Calendar into our app
- App becomes read-only view of Google Calendar
- **Best for**: Viewing existing Google Calendar in yearly format

### Option C: Two-Way Sync (Recommended)
- Changes in either system propagate to the other
- Requires conflict resolution strategy
- Most complex but most useful
- **Best for**: Full integration where either can be modified

### Recommendation
Start with **Option A** (App → Google), then expand to two-way sync. This lets you validate the integration without complex conflict handling.

---

## Google Cloud Setup

### 1. Create Google Cloud Project

```
1. Go to https://console.cloud.google.com
2. Create new project: "Yearly Planner"
3. Enable Google Calendar API:
   - APIs & Services → Library
   - Search "Google Calendar API"
   - Click Enable
```

### 2. Configure OAuth Consent Screen

```
1. APIs & Services → OAuth consent screen
2. User Type: External (or Internal for Workspace)
3. App information:
   - App name: "Yearly Planner"
   - Support email: your email
   - Authorized domains: your-domain.com
4. Scopes:
   - https://www.googleapis.com/auth/calendar.events
   - https://www.googleapis.com/auth/calendar.readonly
5. Test users: Add your Google account
```

### 3. Create OAuth Credentials

```
1. APIs & Services → Credentials
2. Create Credentials → OAuth client ID
3. Application type: Web application
4. Authorized redirect URIs:
   - http://localhost:3001/api/auth/google/callback (dev)
   - https://your-app.railway.app/api/auth/google/callback (prod)
5. Save Client ID and Client Secret
```

### 4. Environment Variables

Add to `.env`:
```env
# Existing
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# New - Calendar API scopes
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events
```

---

## OAuth Modifications

### Current OAuth Flow
The app already uses Google OAuth for authentication. We need to:
1. Add Calendar API scopes to the OAuth request
2. Store the refresh token for background sync
3. Handle token refresh for long-lived sessions

### Modified OAuth URL

**File: `server/src/routes/auth.ts`**

```typescript
// Add calendar scope to existing auth URL
const scopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events', // NEW
];

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: GOOGLE_CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: scopes.join(' '),
  access_type: 'offline',  // Required for refresh token
  prompt: 'consent',       // Force consent to get refresh token
})}`;
```

### Store Tokens

After OAuth callback, store both access and refresh tokens:

```typescript
// In callback handler
const tokens = await exchangeCodeForTokens(code);

// Store in database
db.prepare(`
  UPDATE users
  SET google_access_token = ?,
      google_refresh_token = ?,
      google_token_expiry = ?
  WHERE id = ?
`).run(
  tokens.access_token,
  tokens.refresh_token,
  Date.now() + (tokens.expires_in * 1000),
  userId
);
```

---

## Database Changes

### New Columns for `users` Table

```sql
ALTER TABLE users ADD COLUMN google_access_token TEXT;
ALTER TABLE users ADD COLUMN google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN google_token_expiry INTEGER;
ALTER TABLE users ADD COLUMN google_calendar_id TEXT;  -- Which calendar to sync to
ALTER TABLE users ADD COLUMN calendar_sync_enabled INTEGER DEFAULT 0;
```

### New Columns for `entries` Table

```sql
ALTER TABLE entries ADD COLUMN google_event_id TEXT;   -- Link to Google Calendar event
ALTER TABLE entries ADD COLUMN google_etag TEXT;       -- For detecting external changes
ALTER TABLE entries ADD COLUMN last_synced_at TEXT;    -- Last sync timestamp
ALTER TABLE entries ADD COLUMN sync_status TEXT;       -- 'synced', 'pending', 'error'
```

### New Table: `sync_log`

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  entry_id INTEGER,
  google_event_id TEXT,
  action TEXT NOT NULL,  -- 'create', 'update', 'delete'
  direction TEXT NOT NULL,  -- 'to_google', 'from_google'
  status TEXT NOT NULL,  -- 'success', 'error'
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (entry_id) REFERENCES entries(id)
);
```

---

## Backend Implementation

### 1. Install Google APIs Client

```bash
cd server
npm install googleapis
```

### 2. Create Calendar Service

**File: `server/src/services/googleCalendar.ts`**

```typescript
import { google, calendar_v3 } from 'googleapis';
import db from '../db.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function getCalendarClient(userId: number): Promise<calendar_v3.Calendar> {
  const user = db.prepare(`
    SELECT google_access_token, google_refresh_token, google_token_expiry
    FROM users WHERE id = ?
  `).get(userId) as any;

  if (!user?.google_refresh_token) {
    throw new Error('User not connected to Google Calendar');
  }

  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
  });

  // Check if token needs refresh
  if (Date.now() > user.google_token_expiry - 60000) {
    const { credentials } = await oauth2Client.refreshAccessToken();

    db.prepare(`
      UPDATE users SET
        google_access_token = ?,
        google_token_expiry = ?
      WHERE id = ?
    `).run(credentials.access_token, credentials.expiry_date, userId);

    oauth2Client.setCredentials(credentials);
  }

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export function entryToGoogleEvent(entry: any, year: number): calendar_v3.Schema$Event {
  const startDate = new Date(year, entry.month - 1, entry.day_start);
  const endDate = new Date(year, (entry.end_month ?? entry.month) - 1, entry.day_end);
  endDate.setDate(endDate.getDate() + 1); // Google uses exclusive end date

  return {
    summary: entry.title,
    description: [
      entry.description,
      entry.url ? `\nLink: ${entry.url}` : '',
      entry.category ? `\nCategory: ${entry.category}` : '',
    ].filter(Boolean).join(''),
    start: {
      date: startDate.toISOString().split('T')[0],
    },
    end: {
      date: endDate.toISOString().split('T')[0],
    },
    colorId: mapColorToGoogleColorId(entry.color),
    extendedProperties: {
      private: {
        yearlyAppEntryId: String(entry.id),
        yearlyAppCategory: entry.category || '',
      },
    },
  };
}

// Google Calendar has limited color options (1-11)
function mapColorToGoogleColorId(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#3b82f6': '9',  // Blue
    '#10b981': '10', // Green
    '#f59e0b': '5',  // Yellow
    '#ef4444': '11', // Red
    '#8b5cf6': '3',  // Purple
    '#ec4899': '4',  // Pink
    '#06b6d4': '7',  // Cyan
    '#f97316': '6',  // Orange
  };
  return colorMap[hexColor.toLowerCase()] || '9';
}
```

### 3. Sync Service

**File: `server/src/services/calendarSync.ts`**

```typescript
import { getCalendarClient, entryToGoogleEvent } from './googleCalendar.js';
import db from '../db.js';

export async function syncEntryToGoogle(entryId: number, userId: number) {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any;
  if (!entry) throw new Error('Entry not found');

  const calendar = await getCalendarClient(userId);
  const user = db.prepare('SELECT google_calendar_id FROM users WHERE id = ?').get(userId) as any;
  const calendarId = user.google_calendar_id || 'primary';

  const event = entryToGoogleEvent(entry, entry.year);

  try {
    let response;

    if (entry.google_event_id) {
      // Update existing event
      response = await calendar.events.update({
        calendarId,
        eventId: entry.google_event_id,
        requestBody: event,
      });
    } else {
      // Create new event
      response = await calendar.events.insert({
        calendarId,
        requestBody: event,
      });
    }

    // Save Google event ID back to entry
    db.prepare(`
      UPDATE entries SET
        google_event_id = ?,
        google_etag = ?,
        last_synced_at = datetime('now'),
        sync_status = 'synced'
      WHERE id = ?
    `).run(response.data.id, response.data.etag, entryId);

    logSync(userId, entryId, response.data.id!, entry.google_event_id ? 'update' : 'create', 'to_google', 'success');

    return response.data;
  } catch (error: any) {
    db.prepare(`UPDATE entries SET sync_status = 'error' WHERE id = ?`).run(entryId);
    logSync(userId, entryId, null, 'create', 'to_google', 'error', error.message);
    throw error;
  }
}

export async function deleteFromGoogle(entryId: number, userId: number, googleEventId: string) {
  const calendar = await getCalendarClient(userId);
  const user = db.prepare('SELECT google_calendar_id FROM users WHERE id = ?').get(userId) as any;
  const calendarId = user.google_calendar_id || 'primary';

  try {
    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });
    logSync(userId, entryId, googleEventId, 'delete', 'to_google', 'success');
  } catch (error: any) {
    if (error.code !== 404) {
      logSync(userId, entryId, googleEventId, 'delete', 'to_google', 'error', error.message);
      throw error;
    }
  }
}

function logSync(
  userId: number,
  entryId: number | null,
  googleEventId: string | null,
  action: string,
  direction: string,
  status: string,
  errorMessage?: string
) {
  db.prepare(`
    INSERT INTO sync_log (user_id, entry_id, google_event_id, action, direction, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, entryId, googleEventId, action, direction, status, errorMessage || null);
}
```

### 4. Update Entry Routes

**File: `server/src/routes/entries.ts`** (modifications)

```typescript
import { syncEntryToGoogle, deleteFromGoogle } from '../services/calendarSync.js';

// In POST /api/entries (after creating entry):
const user = db.prepare('SELECT calendar_sync_enabled FROM users WHERE id = ?').get(userId) as any;
if (user?.calendar_sync_enabled) {
  // Async sync - don't block response
  syncEntryToGoogle(result.lastInsertRowid as number, userId).catch(console.error);
}

// In PUT /api/entries/:id (after updating entry):
if (user?.calendar_sync_enabled) {
  syncEntryToGoogle(id, userId).catch(console.error);
}

// In DELETE /api/entries/:id (before deleting):
if (existing.google_event_id && user?.calendar_sync_enabled) {
  await deleteFromGoogle(id, userId, existing.google_event_id);
}
```

### 5. New Sync Routes

**File: `server/src/routes/sync.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCalendarClient } from '../services/googleCalendar.js';
import { syncEntryToGoogle } from '../services/calendarSync.js';
import db from '../db.js';

const router = Router();
router.use(requireAuth);

// GET /api/sync/status - Check sync status
router.get('/status', (req, res) => {
  const user = db.prepare(`
    SELECT calendar_sync_enabled, google_calendar_id, google_refresh_token
    FROM users WHERE id = ?
  `).get(req.user!.id) as any;

  res.json({
    connected: !!user?.google_refresh_token,
    enabled: !!user?.calendar_sync_enabled,
    calendarId: user?.google_calendar_id || 'primary',
  });
});

// POST /api/sync/enable - Enable sync
router.post('/enable', async (req, res) => {
  const { calendarId = 'primary' } = req.body;

  db.prepare(`
    UPDATE users SET
      calendar_sync_enabled = 1,
      google_calendar_id = ?
    WHERE id = ?
  `).run(calendarId, req.user!.id);

  res.json({ success: true });
});

// POST /api/sync/disable - Disable sync
router.post('/disable', (req, res) => {
  db.prepare(`UPDATE users SET calendar_sync_enabled = 0 WHERE id = ?`).run(req.user!.id);
  res.json({ success: true });
});

// GET /api/sync/calendars - List user's calendars
router.get('/calendars', async (req, res) => {
  try {
    const calendar = await getCalendarClient(req.user!.id);
    const response = await calendar.calendarList.list();

    res.json(response.data.items?.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary,
    })) || []);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/sync/full - Sync all entries
router.post('/full', async (req, res) => {
  const userId = req.user!.id;
  const { year } = req.body;

  const entries = db.prepare(`
    SELECT id FROM entries
    WHERE user_id = ? AND year = ? AND sync_status != 'synced'
  `).all(userId, year) as any[];

  const results = { success: 0, failed: 0 };

  for (const entry of entries) {
    try {
      await syncEntryToGoogle(entry.id, userId);
      results.success++;
    } catch {
      results.failed++;
    }
  }

  res.json(results);
});

export default router;
```

---

## Frontend Changes

### 1. Settings Panel Addition

**File: `client/src/components/Settings/CalendarSync.tsx`**

```tsx
import { useState, useEffect } from 'react';
import styles from './CalendarSync.module.css';

interface Calendar {
  id: string;
  summary: string;
  primary: boolean;
}

export default function CalendarSync() {
  const [status, setStatus] = useState<{
    connected: boolean;
    enabled: boolean;
    calendarId: string;
  } | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    const res = await fetch('/api/sync/status', { credentials: 'include' });
    const data = await res.json();
    setStatus(data);

    if (data.connected) {
      const calRes = await fetch('/api/sync/calendars', { credentials: 'include' });
      const calData = await calRes.json();
      setCalendars(calData);
    }
    setLoading(false);
  }

  async function toggleSync() {
    const endpoint = status?.enabled ? '/api/sync/disable' : '/api/sync/enable';
    await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    fetchStatus();
  }

  if (loading) return <div>Loading...</div>;

  if (!status?.connected) {
    return (
      <div className={styles.container}>
        <h3>Google Calendar Sync</h3>
        <p>Connect your Google account to sync entries with Google Calendar.</p>
        <a href="/api/auth/google?scope=calendar" className={styles.connectButton}>
          Connect Google Calendar
        </a>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3>Google Calendar Sync</h3>

      <div className={styles.row}>
        <label>
          <input
            type="checkbox"
            checked={status.enabled}
            onChange={toggleSync}
          />
          Enable auto-sync
        </label>
      </div>

      {status.enabled && (
        <div className={styles.row}>
          <label>Sync to calendar:</label>
          <select
            value={status.calendarId}
            onChange={e => {
              fetch('/api/sync/enable', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendarId: e.target.value }),
              }).then(fetchStatus);
            }}
          >
            {calendars.map(cal => (
              <option key={cal.id} value={cal.id}>
                {cal.summary} {cal.primary && '(Primary)'}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
```

### 2. Sync Status Indicator

Add a sync indicator on entries:

```tsx
// In EntryOverlay.tsx or EntryCell
{entry.sync_status === 'pending' && <span className={styles.syncPending}>⟳</span>}
{entry.sync_status === 'error' && <span className={styles.syncError}>⚠</span>}
```

---

## Sync Logic

### Real-Time Sync (Recommended for App → Google)

```
User creates/edits entry
        ↓
Save to local database
        ↓
Return response to UI (fast)
        ↓
Background: Call Google Calendar API
        ↓
Update entry with google_event_id
```

### Periodic Full Sync (For Two-Way)

```typescript
// server/src/jobs/syncJob.ts
import cron from 'node-cron';

// Run every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const users = db.prepare(`
    SELECT id FROM users WHERE calendar_sync_enabled = 1
  `).all() as any[];

  for (const user of users) {
    await pullChangesFromGoogle(user.id);
  }
});

async function pullChangesFromGoogle(userId: number) {
  const calendar = await getCalendarClient(userId);
  const user = db.prepare('SELECT google_calendar_id FROM users WHERE id = ?').get(userId) as any;

  // Get changes since last sync using sync tokens
  const response = await calendar.events.list({
    calendarId: user.google_calendar_id || 'primary',
    syncToken: user.google_sync_token,  // Store and use sync tokens
    singleEvents: true,
  });

  for (const event of response.data.items || []) {
    await processGoogleEvent(userId, event);
  }
}
```

---

## Considerations & Challenges

### 1. OAuth Scope Changes
- Existing users will need to re-authenticate to grant calendar permissions
- Handle gracefully if user denies calendar access

### 2. Rate Limits
- Google Calendar API: 1,000,000 queries/day, 500 queries/100 seconds/user
- Batch API calls when doing full sync
- Implement exponential backoff

### 3. Conflict Resolution (Two-Way Sync)
```
If both changed since last sync:
  - Option A: Last write wins (simpler)
  - Option B: User chooses (better UX)
  - Option C: Create duplicate with conflict marker
```

### 4. Deleted Events
- Google uses "cancelled" status, not actual deletion
- Need to handle sync of deleted events in both directions

### 5. All-Day vs Timed Events
- Our app uses dates only (all-day events)
- departure_time/arrival_time could map to timed events

### 6. Recurring Events
- Not currently supported in our app
- Google Calendar has complex recurrence rules
- Consider excluding recurring events from sync

### 7. Private Entries
- Decision: Sync private entries or skip?
- If synced, set visibility to "private" in Google

### 8. Production Verification
- Google requires app verification for sensitive scopes
- Until verified, limited to 100 test users
- Submit for verification before public launch

---

## Implementation Order

1. **Week 1**: OAuth scope changes + token storage
2. **Week 2**: One-way sync (App → Google) for create/update
3. **Week 3**: Delete sync + settings UI
4. **Week 4**: Testing + error handling
5. **Future**: Two-way sync + conflict resolution

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Google Cloud setup | 1 hour |
| OAuth modifications | 3-4 hours |
| Database migrations | 1 hour |
| Calendar service | 4-6 hours |
| Sync routes | 2-3 hours |
| Frontend settings | 3-4 hours |
| Testing & debugging | 4-6 hours |
| **Total (one-way)** | **~20-25 hours** |
| Two-way sync addition | +15-20 hours |
