# Yearly Planner — Project Analysis

> Generated: 2026-02-24  
> Reviewer: Antigravity (code review pass)

---

## Table of Contents

1. [Design Idea](#1-design-idea)
2. [Implementation Details](#2-implementation-details)
3. [Flaws](#3-flaws)
4. [Improvements](#4-improvements)

---

## 1. Design Idea

### Core Concept

**yearly.app** is a collaborative yearly-planning calendar built around a single, radical idea: **compress an entire year onto one scrollable screen** as a 12 × 31 grid (months as rows, days 1–31 as columns). This gives the user a high-density "bird's-eye view" of their year — travel, events, and activities at a glance — without flipping through month-by-month pages.

The mental model is closest to a **Gantt chart for personal life** or a wall-mounted year planner, but interactive and multi-user.

### Target Users

- Small groups (couples, families, friend circles, travel partners) who want a shared view of their year
- Individual power users who want dense year-at-a-glance planning

### Design Pillars

| Pillar | How it's expressed |
|--------|-------------------|
| **Density** | 31-column × 12-row flat grid; entries are thin horizontal bars |
| **Directness** | Drag to create, drag to move, drag handle to resize — no extra dialogs |
| **Clarity** | Past days striped, today highlighted green, tentative entries dashed-border |
| **Collaboration** | Shared entries visible to all logged-in users; private flag hides from others |
| **Personalization** | Per-user font, font-size, cell height, and calendar width settings (localStorage) |

### Interaction Design

```
Drag empty cells          → select date range → entry editor opens
Click entry               → detail panel (read) opens
Drag entry body           → moves entry across months/rows
Drag entry right edge     → resizes end date
Click day column header   → highlights that column across all months
Category filter           → dims non-matching entries
Undo / Redo (Ctrl+Z/Y)   → full create/update/delete history
```

---

## 2. Implementation Details

### 2.1 Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                       │
│  ├── Auth gate (Google OAuth)                              │
│  ├── YearGrid (main grid container, all drag/resize logic) │
│  │     ├── MonthRow × 12  (background cell grid)          │
│  │     ├── EntryOverlay × N  (absolute-positioned bars)   │
│  │     └── Moving overlay (drag ghost)                    │
│  ├── EntryEditor (modal)                                   │
│  ├── EntryDetailPanel (side panel)                         │
│  ├── CategoryFilter                                        │
│  ├── Settings modal                                        │
│  └── FeedbackToast (undo/redo notifications)              │
└────────────────────────────────────────────────────────────┘
               │  fetch (cookies)
┌──────────────▼─────────────────────────────────────────────┐
│  Express backend (TypeScript, ESM)                         │
│  ├── POST /api/auth/google    (Google OAuth token → JWT)   │
│  ├── GET  /api/auth/me                                     │
│  ├── GET  /api/entries/:year                               │
│  ├── POST/PUT/DELETE /api/entries/:id                      │
│  ├── GET/POST/DELETE /api/entries/:id/comments             │
│  ├── GET/POST        /api/entries/:id/todos                │
│  └── PUT/DELETE      /api/entries/todos/:id                │
└────────────────────────────────────────────────────────────┘
               │
┌──────────────▼──────────────┐
│  SQLite (better-sqlite3)    │
│  WAL mode + FK enforcement  │
│  Tables: entries, users,    │
│          comments, todos    │
└─────────────────────────────┘
```

### 2.2 Frontend Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 18 + TypeScript |
| Bundler | Vite |
| Styling | CSS Modules per-component + global design tokens in `index.css` |
| Auth | `@react-oauth/google` (Google One-Tap / button) |
| State | React `useState` / `useContext` — no external store |

### 2.3 Grid Rendering — Two-Layer Architecture

This is the most interesting engineering decision in the project.

**Layer 1 — Background (MonthRow)**  
Each `MonthRow` renders a CSS Grid div for that month with `rowCount × 31` cells. The cells receive `onMouseDown`/`onMouseEnter` for drag-to-select. Entry rendering does **not** happen here; cells are purely background and interaction targets.

**Layer 2 — Entry Overlays (absolute positioned)**  
All `EntryOverlay` components are absolutely positioned siblings of the MonthRow layer inside the same `gridRef` div. `entryPosition.ts` computes each overlay's `top`, `left`, `width`, `height` from:
- `GRID.MONTH_LABEL_WIDTH = 72px` — left gutter
- `GRID.DAY_WIDTH = 40px` — column width
- `GRID.ROW_HEIGHT = 24px` — row height (overridable via settings)
- Cumulative `yOffset` per month (computed from `calculateMonthOffsets`)

**Layer 3 — Moving Ghost**  
While dragging an entry, the original overlay fades to 30% opacity and a `movingOverlay` div is rendered at the current cursor position.

This layer separation avoids the complexity of a pure CSS Grid spanning system and makes cross-month entries simple to implement.

### 2.4 Cross-Month Entries

An entry stores `month` (start month), `end_month`, `day_start`, `day_end`. For cross-month entries, `calculateCrossMonthSegments()` returns one segment per traversed month. Each segment is rendered as a separate `EntryOverlay` div. The first segment shows the title; the last gets the resize handle. Continuation segments have their left/right border-radius removed to appear as a continuous bar.

### 2.5 Drag, Resize, and Move State Machine

All three interaction modes are managed via `useRef` + `useState` pairs in `YearGrid`:

```
moveIntent.current  →  set on mousedown on entry
isMoving.current    →  set after 5px horizontal threshold
isDragging.current  →  set on mousedown on empty cell
isResizing.current  →  set on mousedown on resize handle
```

Global `window` event listeners (`mousemove` / `mouseup`) are registered inside `useEffect` hooks that are each scoped to their relevant state. On `mouseup`, the final state is committed to the backend via the API.

**Conflict resolution on drop/resize:** The code checks for existing entries at the target `row_index`. If there's a conflict, it finds the first free row index.

### 2.6 Undo / Redo System

`HistoryContext` maintains a classic **past/future stack** (capped at 50 actions):

```typescript
type HistoryAction =
  | { type: 'create'; entries: Entry[] }
  | { type: 'update'; before: Entry; after: Entry }
  | { type: 'delete'; entries: Entry[] }
```

Undo/redo **executors** are registered by `YearGrid` via `registerExecutors()`. These executors make real API calls to reverse or replay the action. This means undo/redo is **server-persisted** (not just ephemeral UI state), which is functionally correct but network-latency dependent.

### 2.7 Authentication

- **Login:** Google ID token sent to `POST /api/auth/google` → verified with `google-auth-library` → user upserted in DB → JWT signed and set as `httpOnly` cookie (7-day TTL).
- **Session verification:** Every API route runs `requireAuth` middleware which reads the cookie, verifies the JWT, and fetches the live `User` row from DB. No token revocation is needed because the live DB lookup catches deleted users.
- **Ownership model:** Entries have `user_id` (nullable for legacy). Edit/delete is blocked for entries where `user_id !== null && user_id !== req.user.id`.

### 2.8 Database

`db.ts` uses an **inline migration** pattern: on startup it reads `PRAGMA table_info(entries)` and adds `ALTER TABLE ... ADD COLUMN` statements for any missing columns. This lets the schema evolve without a formal migration tool.

Tables:
- `entries` — core data (year, month, end_month, day_start, day_end, row_index, + metadata fields)
- `users` — Google OAuth profile cache
- `comments` — threaded comments per entry
- `todos` — ordered checklist items per entry

WAL mode is enabled for better concurrent read performance (important for multi-user).

### 2.9 Deployment

- **Railway**: Single service, `nixpacks.toml` installs dev deps for TypeScript compilation
- **Static serving**: In production, Express serves `client/dist` and falls back to `index.html` for SPA routing
- **Persistent storage**: Railway volume mounted at `/data`, path injected via `DATABASE_PATH` env var
- **CORS**: Explicit allowlist using `FRONTEND_URL` env var (no wildcard)

### 2.10 Settings

User preferences are stored in `localStorage` and applied as CSS custom property overrides on `:root`:
- `--font-family`, `--font-size`: typography
- `--grid-cell-height`: row height (controls visual density)
- `--calendar-max-width`: max-width for centered layout

---

## 3. Flaws

### 3.1 Critical / Data-Safety

#### F1 — `YEAR` hard-coded in `App.tsx`
```typescript
const YEAR = 2026;  // line 13
```
The year is a compile-time constant. Viewing past or future years requires a code change and redeploy. This is a significant limitation for any user wanting historical data or planning ahead.

#### F2 — Undo on "delete" uses fuzzy matching
When redoing a delete, the code finds the target entry by matching on `(month, day_start, day_end, title)`:
```typescript
const match = currentEntries.find(e =>
  e.month === deletedEntry.month &&
  e.day_start === deletedEntry.day_start &&
  e.day_end === deletedEntry.day_end &&
  e.title === deletedEntry.title
);
```
This fuzzy match can silently delete the wrong entry if two entries share the same start/end/title. The correct fix is to track the recreated entry's new ID after undo-of-delete and use that for redo-of-delete.

#### ~~F3 — No input validation on `category` and `url` fields~~ ✅ FIXED
~~Category is free-text with no normalization (case, trimming). URL has no validation — any string is accepted and rendered as an `<a href>`. A malicious user could inject `javascript:` URLs.~~

**Fix:** Added `isValidUrl()` validation in `server/src/routes/entries.ts` that only allows `http://` and `https://` URLs.

#### F4 — `row_index` is the stored layout position, not computed
Entries store their `row_index` in the database. When an entry is dragged to a free slot, the conflict check is simple. But if two users concurrently drag entries to the same row, there's no server-side conflict resolution — whichever `PUT` lands last wins, potentially causing visible overlap.

---

### 3.2 UX / Product

#### F5 — No year navigation
Users cannot navigate between years from the UI (see F1). The app is effectively a "one year at a time" tool, which severely limits its usefulness as a multi-year planner.

#### F6 — Category is free-text, not a managed taxonomy
Every user types categories manually. Typos silently create new categories (`Travel` vs `travel` vs `Travels`). There is no autocomplete, no merge, no canonical list.

#### F7 — No real-time collaboration
The app is multi-user but not real-time. If User A creates an entry while User B has the page open, User B won't see it until they refresh. There's no polling, WebSocket, or Server-Sent Events mechanism.

#### ~~F8 — Entry color stored as `rgba(...)` string breaks `getTextColor`~~ ✅ FIXED
~~`getTextColor()` only handles hex colors:~~
```typescript
// OLD CODE - now fixed
export function getTextColor(bgColor: string): string {
  const hex = bgColor.replace('#', '');
  if (hex.length < 6) return '#fff';  // silently returns white for rgba strings
  ...
}
```
~~Entries with rgba colors (opacity < 1) will always show white text, even on very light, nearly-transparent backgrounds. This is a silent visual bug.~~

**Fix:** Updated `getTextColor()` in `client/src/utils/entryPosition.ts` to parse rgba/rgb colors before falling back to hex.

#### F9 — `MonthRow` creates `new Date()` inside every render
```typescript
const today = new Date();  // inside MonthRow component
```
With 12 MonthRows × potentially many re-renders (during drag), this creates hundreds of `Date` objects per second. It should be computed once at a higher level and passed down as props.

#### F10 — No loading or error states for API failures
`fetchEntries` can throw an error (e.g., network failure, 401), but there's no error boundary or user-visible feedback. The grid silently stays empty.

---

### 3.3 Security

#### ~~F11 — Legacy entries (`user_id = null`) are editable by anyone~~ ✅ FIXED
~~The ownership check explicitly allows edits to legacy entries:~~
```typescript
// OLD CODE - now fixed
if (existing.user_id !== null && existing.user_id !== req.user!.id) {
  res.status(403).json({ error: 'Forbidden' });
}
```
~~Any authenticated user can edit or delete entries with `user_id = null`. If legacy entries contain important historical data, this is a data integrity risk.~~

**Fix:** Simplified ownership check to `existing.user_id !== req.user.id`. Entries with `user_id = null` are no longer supported and will be rejected by the ownership check.

#### ~~F12 — JWT payload contains full user row (name, picture, email)~~ ✅ FIXED
~~`createToken` embeds the user object. If the user updates their Google profile, the JWT carries stale info until it expires. More importantly, the token contains PII in the payload (though not the signature). The payload should contain only `userId`.~~

**Fix:** JWT payload in `server/src/utils/jwt.ts` now contains only `userId`, `iat`, and `exp`. Email removed from payload.

#### ~~F13 — CORS allows any `*.railway.app` domain in production~~ ✅ FIXED
```typescript
// OLD CODE - now fixed
origin.includes('.railway.app')
```
~~This allows any Railway deployment (not just yours) to make credentialed requests to your API. If a malicious actor deploys to Railway, they can make cross-origin requests with cookies.~~

**Fix:** Removed wildcard Railway check in `server/src/index.ts`. CORS now only allows origins in the explicit `allowedOrigins` list (localhost + `FRONTEND_URL` env var).

---

### 3.4 Code Quality / Architecture

#### F14 — `YearGrid.tsx` is a 782-line god component
All drag, resize, move, undo/redo executor registration, conflict resolution, and rendering live in one file. This violates single-responsibility and makes the file hard to test and maintain. The interaction state machines should be extracted into custom hooks (`useDrag`, `useResize`, `useMove`).

#### F15 — Inline migration pattern doesn't handle destructive schema changes
`db.ts` can add columns but cannot rename, drop, or reorder them without manual intervention. The pattern also runs on every server startup, making the startup slightly slower as the DB grows.

#### F16 — History undo for "delete" restores entries without their todos/comments
```typescript
case 'delete':
  for (const entry of action.entries) {
    await createEntry({ ... });  // creates new entry shell
  }
```
The recreated entry gets a new ID and loses all its comments and todos. Users who undo a delete are surprised to find the entry is empty.

#### F17 — `entryLayout.ts` referenced in `CONTEXT.md` but doesn't exist
The `CONTEXT.md` file documents `entryLayout.ts` with a `computeRowSlots` function, but the actual file is `entryPosition.ts` with a different API. The CONTEXT.md is outdated documentation.

#### F18 — Settings are not synced across sessions / devices
Settings live only in `localStorage`. If a user logs in from a different browser or device, all their preferences reset to defaults.

---

## 4. Improvements

### P0 — Must-Fix (data correctness / security)

#### I1 — Year Navigation UI
Add a year selector to the header (e.g., `‹ 2025  2026  2027 ›`). Make `YEAR` a state variable, reload entries from the API when it changes.

```typescript
// App.tsx
const [year, setYear] = useState(new Date().getFullYear());
```

The `GET /api/entries/:year` endpoint already works for any year — the backend needs no changes.

#### ~~I2 — Fix `getTextColor` for rgba colors~~ ✅ IMPLEMENTED
```typescript
// Now implemented in client/src/utils/entryPosition.ts
export function getTextColor(bgColor: string): string {
  // Try rgba first
  const rgbaMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const [r, g, b] = rgbaMatch.slice(1).map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#000' : '#fff';
  }
  // existing hex logic ...
}
```

#### ~~I3 — Fix CORS to use a specific origin allowlist~~ ✅ IMPLEMENTED
~~Store the production frontend URL in an env var and check against it exactly, not with `.includes('.railway.app')`.~~

**Done:** CORS now uses exact match against `FRONTEND_URL` env var only.

#### I4 — Fix undo/redo history for deleted entries with todos/comments
When recording a delete action, also snapshot the entry's todos and comments. When undoing, recreate the entry then re-POST all todos and comments.

```typescript
type DeleteAction = {
  type: 'delete';
  entries: Entry[];
  todosByEntryId: Record<number, Todo[]>;
  commentsByEntryId: Record<number, Comment[]>;
};
```

#### ~~I5 — Sanitize URL field~~ ✅ IMPLEMENTED
~~On save, validate that URL starts with `http://` or `https://` (or is empty). Reject `javascript:` and other dangerous schemes.~~

**Done:** Added `isValidUrl()` helper in `server/src/routes/entries.ts` that validates URLs in both POST and PUT handlers.

---

### P1 — High Impact UX

#### I6 — Real-time collaboration with Server-Sent Events (SSE)
Add a `GET /api/events` SSE endpoint. On any create/update/delete, broadcast a `{ type: 'refresh' }` event. Clients subscribe and call `loadEntries()` on receipt. This turns the app into a genuinely collaborative tool without needing WebSockets.

```typescript
// server: POST /api/entries handler
res.json(entry);
broadcast({ type: 'entry:created', entry });

// client: useEffect
const es = new EventSource('/api/events', { withCredentials: true });
es.onmessage = () => loadEntries();
```

#### I7 — Managed category taxonomy
Replace the free-text category `<input>` with a `<datalist>` showing existing categories derived from the user's own entries. On the server, normalize categories (trim, lowercase) before inserting.

#### I8 — Error boundaries and loading states
Wrap `YearGrid` in a React `ErrorBoundary`. Add a top-level loading skeleton during the initial `fetchEntries` call. Show a toast notification on API errors instead of silently failing.

#### I9 — Extract custom hooks from `YearGrid`
```
YearGrid.tsx
├── useDragToCreate()     → drag state + DragState type
├── useEntryMove()        → move state + MoveState type
├── useEntryResize()      → resize state + ResizeState type
└── useEntryOperations()  → handleSave, handleDelete, loadEntries
```
This reduces `YearGrid` to a pure layout/render component of ~200 lines.

#### I10 — Save settings to the user account (server side)
Add a `settings` JSON column to the `users` table. Sync preferences on login/save so they persist across devices.

```sql
ALTER TABLE users ADD COLUMN settings TEXT DEFAULT '{}';
```

Add `GET /api/auth/me` already returns the user — just include `settings` in the response and update on `PUT /api/auth/settings`.

---

### P2 — Nice to Have

#### I11 — Entry duplication
Add a "Duplicate" button in `EntryEditor` which calls `createEntry` with the same data offset by one row. Already documented in `CONTEXT.md` as a future idea.

#### I12 — Multi-year data model and navigation
The `year` column already exists in `entries`. Add a year picker instead of the `const YEAR = 2026` hack. The API is already parameterized by year.

#### I13 — Search / filter by title
Add a text input near the `CategoryFilter`. Filter entries client-side using `entries.filter(e => e.title.toLowerCase().includes(query))`, dim non-matches the same way category filtering works.

#### I14 — Recurring entries
Add `recurrence` field (e.g., `'weekly'|'monthly'|'yearly'|null`). On the server, when fetching a year, expand recurring entries into the visible date range. This enables birthday reminders, weekly meetings, etc.

#### I15 — Export to PDF / image
Use the browser's `window.print()` with a `@media print` stylesheet that hides the header/toolbar and renders the grid full-width. Alternatively, use a `<canvas>` snapshot via `html2canvas`.

#### I16 — Touch / mobile support
The drag system relies entirely on `MouseEvent`. Replace with Pointer Events (`pointerdown`, `pointermove`, `pointerup`) which unify mouse and touch. Add `touch-action: none` on draggable elements.

#### I17 — Keyboard navigation
- `Tab` / arrows to navigate between entries
- `Enter` to open an entry's detail panel
- `Delete` to delete the focused entry
- `E` to open the editor for the focused entry

#### I18 — Improve the inline migration system
Replace the ad-hoc `PRAGMA table_info` migration with a versioned migration runner (e.g., a simple `schema_version` table + ordered migration scripts). This makes schema changes predictable and auditable.

#### I19 — Move today's date to a prop/context instead of `new Date()` per component
Compute the current date once in `YearGrid` and pass `todayYear`, `todayMonth`, `todayDay` props to `MonthRow` and other components. Eliminates ~12 redundant `new Date()` calls per render cycle.

#### I20 — Audit and normalize `DATE` strings to ISO 8601
`created_at` and `updated_at` use SQLite `datetime('now')` which returns UTC without a `Z` suffix. Some browsers may interpret this as local time. Change the default to `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` for unambiguous ISO 8601 timestamps.

---

## Summary Matrix

| ID | Category | Severity | Effort | Status |
|----|----------|----------|--------|--------|
| F1 / I1 | Hard-coded year | 🔴 High | Low | Open |
| F2 / I4 | Undo delete fuzzy match | 🔴 High | Medium | Open |
| ~~F3 / I5~~ | ~~URL sanitization~~ | ~~🔴 High~~ | ~~Low~~ | ✅ Fixed |
| ~~F8 / I2~~ | ~~rgba text color bug~~ | ~~🟠 Medium~~ | ~~Low~~ | ✅ Fixed |
| ~~F11~~ | ~~Legacy entries editable~~ | ~~🔴 High~~ | ~~Low~~ | ✅ Fixed |
| ~~F12~~ | ~~JWT contains PII~~ | ~~🟡 Low~~ | ~~Low~~ | ✅ Fixed |
| ~~F13 / I3~~ | ~~CORS over-permissive~~ | ~~🔴 High~~ | ~~Low~~ | ✅ Fixed |
| F14 / I9 | God component | 🟡 Low | High | Open |
| F16 / I4 | Undo loses todos/comments | 🔴 High | Medium | Open |
| I6 | Real-time SSE | 🟠 Medium | Medium | Open |
| I7 | Category autocomplete | 🟡 Low | Low | Open |
| I8 | Error boundaries | 🟠 Medium | Low | Open |
| I10 | Server-side settings | 🟡 Low | Medium | Open |
| I11–I20 | Feature additions | 🟢 Nice | Varies | Open |
