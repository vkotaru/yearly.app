# Planned Improvements

## Google Calendar Integration

### Overview
Integrate Google Calendar to import/sync events with the yearly planner.

### Current Advantages
- Google OAuth already implemented for login
- JWT/cookie auth infrastructure in place
- Entry data model similar to calendar events (dates, title, description)

### Implementation Phases

#### Phase 1: Read-Only Import (Recommended Start)
**Scope**: One-time import of Google Calendar events as entries

**Work Required**:
1. Add calendar OAuth scope (`calendar.readonly`)
2. Backend route: `GET /api/calendar/events?year=2026`
3. "Import from Google Calendar" button in Settings
4. Convert Google events to Entry format

**Effort**: 1-2 days

#### Phase 2: Auto-Refresh Sync
**Scope**: Periodically pull updates from Google Calendar

**Work Required**:
1. Store last sync timestamp per user
2. Background refresh on app load
3. "Synced from Google" badge on imported entries
4. Handle deleted events (soft delete or remove?)

**Effort**: 2-3 days

#### Phase 3: Push to Google Calendar
**Scope**: Create Google Calendar events from entries

**Work Required**:
1. Add write scope (`calendar.events`)
2. Backend route: `POST /api/calendar/push/:entryId`
3. Store Google event ID on Entry for updates
4. "Add to Google Calendar" button on entry modal

**Effort**: 2-3 days

#### Phase 4: Two-Way Sync (Complex)
**Scope**: Full bidirectional synchronization

**Work Required**:
1. Conflict detection and resolution UI
2. Sync status tracking per entry
3. Webhook for real-time updates (or polling)
4. "Last synced" indicators

**Effort**: 1-2 weeks

---

### Data Mapping

| Entry Field | Google Calendar Field | Notes |
|-------------|----------------------|-------|
| `title` | `summary` | Direct mapping |
| `description` | `description` | Direct mapping |
| `month`, `day_start`, `day_end` | `start.date`, `end.date` | Google uses exclusive end dates |
| `url` | `source.url` | Or store in description |
| `color` | `colorId` | Google has only 11 preset colors |
| `category` | `extendedProperties` | Custom field storage |
| `emoji` | — | No equivalent, store in title? |
| `is_tentative` | `status: 'tentative'` | Direct mapping available |
| `departure_time`, `arrival_time` | `start.dateTime`, `end.dateTime` | For timed events |
| `row_index` | — | App-specific, not synced |
| `is_private` | — | Should NOT sync to Google |

---

### Key Challenges

#### 1. Date Format Mismatch
- **Google**: End date is exclusive (Jan 1-3 event has `end: Jan 4`)
- **App**: `day_end` is inclusive
- **Solution**: Add/subtract 1 day during conversion

#### 2. Color Limitations
- **Google**: 11 preset `colorId` values only
- **App**: Hex colors with opacity
- **Solution**: Map to nearest Google color, or ignore color sync

#### 3. Recurring Events
- **Google**: Complex RRULE patterns (daily, weekly, monthly, etc.)
- **Options**:
  - Expand into individual entries (data explosion)
  - Ignore recurring events
  - Add recurrence support to Entry model (significant change)
- **Recommendation**: Start by ignoring, add later if needed

#### 4. Token Management
- Access tokens expire in 1 hour
- Need refresh token storage and silent refresh flow
- Handle re-auth gracefully when refresh fails

#### 5. Privacy
- Entries with `is_private: true` should never sync
- Clear UI indication of what will/won't sync
- Consider "sync_enabled" flag per entry

#### 6. Rate Limits
- Google Calendar API: 1M queries/day (free tier)
- Per-user limits apply
- Use batch requests for bulk operations

---

### API Routes

```
# Read
GET  /api/calendar/auth          → Redirect to Google OAuth with calendar scope
GET  /api/calendar/callback      → Handle OAuth callback, store tokens
GET  /api/calendar/events        → Fetch events from Google Calendar
GET  /api/calendar/status        → Check if calendar is connected

# Write
POST /api/calendar/import        → Import events as new entries
POST /api/calendar/push/:id      → Push single entry to Google Calendar
POST /api/calendar/sync          → Full two-way sync

# Management
DELETE /api/calendar/disconnect  → Revoke access, delete tokens
```

---

### Database Changes

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN google_calendar_token TEXT;
ALTER TABLE users ADD COLUMN google_calendar_refresh_token TEXT;
ALTER TABLE users ADD COLUMN google_calendar_connected_at TEXT;

-- Add to entries table
ALTER TABLE entries ADD COLUMN google_event_id TEXT;
ALTER TABLE entries ADD COLUMN google_synced_at TEXT;
ALTER TABLE entries ADD COLUMN sync_enabled INTEGER DEFAULT 1;
```

---

### UI Components Needed

1. **Settings Page**
   - "Connect Google Calendar" button
   - Calendar selection dropdown (user may have multiple)
   - "Import Events" button with year selector
   - Sync frequency setting (manual / daily / hourly)

2. **Entry Modal**
   - "Synced from Google" indicator
   - "Push to Google Calendar" button
   - "Sync enabled" toggle

3. **Entry Cell**
   - Small Google Calendar icon for synced entries

---

### Recommendation

Start with **Phase 1 (Read-Only Import)** only:
- Minimal complexity
- No conflict handling needed
- Users can manually manage imported entries
- Provides 80% of value with 20% of effort

Evaluate user feedback before investing in two-way sync.
