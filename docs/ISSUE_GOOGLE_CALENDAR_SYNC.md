# GitHub Issue: Google Calendar Auto-Sync Integration

> **Copy this to create a GitHub issue at:** https://github.com/vkotaru/yearly.app/issues/new

---

**Title:** Feature: Google Calendar Auto-Sync Integration

**Labels:** `enhancement`, `feature-request`

---

## Summary

Add automatic synchronization between the Yearly Planner app and Google Calendar, allowing entries to be synced bidirectionally.

## Implementation Plan

A detailed implementation guide is available at: [`docs/GOOGLE_CALENDAR_SYNC.md`](https://github.com/vkotaru/yearly.app/blob/main/docs/GOOGLE_CALENDAR_SYNC.md)

## Key Features

- **One-Way Sync (App → Google)** - Push entries to Google Calendar
- **Two-Way Sync** - Changes in either system propagate to the other
- **Calendar Selection** - Choose which Google Calendar to sync with
- **Sync Status Indicators** - Visual feedback on sync state per entry

## Technical Requirements

### Backend
- [ ] Modify OAuth to request Calendar API scopes
- [ ] Store Google refresh tokens for background sync
- [ ] Add `googleapis` package
- [ ] Create Calendar service (`server/src/services/googleCalendar.ts`)
- [ ] Create Sync service (`server/src/services/calendarSync.ts`)
- [ ] Add sync routes (`/api/sync/*`)
- [ ] Database migrations (users + entries tables)

### Frontend
- [ ] Settings panel for Calendar sync configuration
- [ ] Connect/disconnect Google Calendar UI
- [ ] Calendar selection dropdown
- [ ] Sync status indicators on entries

### Google Cloud
- [ ] Enable Google Calendar API
- [ ] Add calendar scopes to OAuth consent screen
- [ ] App verification for production (100+ users)

## Database Changes

```sql
-- Users table
ALTER TABLE users ADD COLUMN google_access_token TEXT;
ALTER TABLE users ADD COLUMN google_refresh_token TEXT;
ALTER TABLE users ADD COLUMN google_token_expiry INTEGER;
ALTER TABLE users ADD COLUMN google_calendar_id TEXT;
ALTER TABLE users ADD COLUMN calendar_sync_enabled INTEGER DEFAULT 0;

-- Entries table
ALTER TABLE entries ADD COLUMN google_event_id TEXT;
ALTER TABLE entries ADD COLUMN sync_status TEXT;  -- 'synced', 'pending', 'error'
```

## Estimated Effort

| Phase | Effort |
|-------|--------|
| One-way sync (App → Google) | ~20-25 hours |
| Two-way sync addition | +15-20 hours |

## Implementation Order

1. OAuth scope changes + token storage
2. One-way sync for create/update/delete
3. Settings UI + calendar selection
4. Testing + error handling
5. (Future) Two-way sync + conflict resolution
