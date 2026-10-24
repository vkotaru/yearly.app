# AGENTS.md

Technical guide to this repo, for coding agents and human contributors alike. For what the app
is and a quick start, see [README.md](README.md).

## What this is

Year-at-a-glance planner: a 12-month × 31-day grid of multi-day entries (trips, events, work
blocks), plus week-year, month and list views. React 18 + Vite 6 client, Express + better-sqlite3
server, types shared through `shared/types.ts`. Offline-first PWA (Dexie + a pending-sync queue).

## Commands

Three separate `package.json`s (root, `client/`, `server/`), each with its own `node_modules`.
There is no npm-workspaces setup; install in each.

```bash
./dev.sh                # install deps, write template .env files if missing, npm run dev
./run-dev.sh            # install deps, re-seed (--clear), then npm run dev
npm run dev             # server (tsx watch, :3001) + client (vite, :5173, proxies /api → :3001)
npm run seed            # seed sample entries for the first user, current year (idempotent by category)
npm run seed -- --clear | --keep | --year=2027 | --user=foo@bar.com
npm run build           # client: tsc -b && vite build; server build is a no-op
npm start               # NODE_ENV=production tsx — server also serves client/dist
```

`./run-dev.sh` passes `--clear`, which **deletes all entries for the current year** before
seeding. Use `./dev.sh` on a database you care about.

No tests, no linter, no CI. Before committing, verify with `cd client && npm run build` (this is
the client typecheck) and `cd server && npx tsc --noEmit` for the server.

## Environment

- `server/.env` (template: `server/.env.example`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `JWT_SECRET`, `ALLOWED_EMAILS`, `DATABASE_PATH` (default `server/data/yearly.db`), `PORT`,
  `FRONTEND_URL` (CORS).
- `client/.env`: `VITE_GOOGLE_CLIENT_ID` (must match the server's).
- `ALLOWED_EMAILS` is a comma-separated list of emails and/or `@domain`s. **Unset = everyone is
  rejected (fail closed).** It is re-checked on every request in `middleware/auth.ts`, not just at
  login. If `JWT_SECRET` is unset, a random one is generated per boot, logging everyone out.
- Local dev skips Google entirely: `POST /api/auth/dev-login` (only registered when
  `NODE_ENV !== 'production'`) upserts a `dev-user` that is exempt from the allowlist.

## Architecture

### Server (`server/src/`)

- `db.ts` creates tables and runs **ad-hoc, idempotent migrations** at import time: check
  `PRAGMA table_info`, then `ALTER TABLE ADD COLUMN`. There is no migration framework — add new
  columns the same way, at the end of the file, never by editing the `CREATE TABLE`.
- Routes: `auth`, `entries` (REST CRUD + nested comments/todos), `settings`, `backup` (JSON
  export/restore), `sync` (`GET /changes?since=`, `POST /push`). All but auth use `requireAuth`
  (JWT in an httpOnly `auth_token` cookie).
- Deletes are soft (`deleted_at`); deleting an entry also soft-deletes its comments and todos.
- Visibility: an entry is visible to a user if `is_private = 0` or they own it. Non-private entries
  are shared across all allowed users — keep that filter on any new query.
- The server is run by `tsx` in production too; there is no compiled output. Imports use `.js`
  extensions (Node16 ESM) and reach shared types via `../../../shared/types.js`.

### Client (`client/src/`)

- Provider stack: `AuthProvider` → `SettingsProvider` → `HistoryProvider` → `EntriesProvider` →
  `ViewContainer`, which switches between `views/YearGridView`, `WeekYearView`, `MonthView` and
  `ListView`. `components/YearGrid/` appears to be the pre-views grid and is not imported anywhere.
- `contexts/EntriesContext.tsx` is the only place entries are read or written. It maps Dexie rows
  to `Entry` with `id = serverId ?? -localId`, so **a negative `id` means not yet synced**.
- `contexts/HistoryContext.tsx` provides undo/redo (Ctrl+Z via `hooks/useUndoRedoKeyboard.ts`);
  entry mutations from the UI should go through it so they're undoable.
- `utils/entryPosition.ts` / `entryLayout.ts` place entries on the grid. Entries can span months
  (`month` … `end_month`); `row_index` is the vertical slot within a month row, and moves/resizes
  check conflicts across the whole span.

### Offline / sync (`client/src/lib/db.ts`, `lib/sync.ts`)

- `lib/db.ts` is the Dexie schema. Its header comment holds the versioning rules: **versions are
  append-only** — add `version(N+1)` with an `.upgrade()`, never edit an existing block. Only
  indexed fields go in `.stores()`; a new non-indexed field needs no new version.
- The SW update prompt (`components/SWUpdatePrompt`, `registerType: 'prompt'` in
  `vite.config.ts`) is what makes new Dexie migrations run on the first load after a deploy.
  Don't remove it or switch to auto-update.
- Entry writes go to Dexie first; if online they then call the REST API directly, and fall back to
  queueing in `pendingSync` on failure or when offline. `flushPendingSync` pushes the queue to
  `/api/sync/push` (server-wins via `updated_at`) and maps local IDs to server IDs.
- Entry loads read Dexie, then do a full `fetchEntries(year)` reconcile, then `pullChanges()`.
- Comments, todos and settings still call the REST API directly from components — they are not
  offline-capable yet, even though Dexie has tables for them.
- Known gotcha: the server writes `updated_at` with SQLite `datetime('now')`
  (`YYYY-MM-DD HH:MM:SS`), while the client's `since` cursor is an ISO string from its own clock.
  String comparison makes `/changes` miss same-day updates; the full per-year reconcile currently
  masks this.

### Adding a field to entries

Touch all of: `server/src/db.ts` (migration), `shared/types.ts` (`Entry` + both DTOs), the
create/update handlers in `routes/entries.ts` **and** `routes/sync.ts`, `routes/backup.ts`,
`client/src/lib/db.ts` (`DexieEntry`), and `dexieToEntry`/`entryToDexie` in `EntriesContext.tsx`.

## Deployment

Any Node host with a persistent disk. Railway config is included (`nixpacks.toml`,
`railway.json`): mount a volume at `/data` and set `DATABASE_PATH=/data/yearly.db`.

## Other docs in the repo

`CONTEXT.md`, `PROJECT_ANALYSIS.md` and `IMPROVEMENTS.md` date from 2026-03 and predate the
offline/sync work (e.g. they say there is no offline support). Use them for history, verify
against the code. `docs/GOOGLE_CALENDAR_SYNC.md` is a design proposal, not implemented.
