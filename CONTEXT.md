# Yearly Planner App - Project Context

## Overview
A yearly planner web app displaying a 12-month × 31-day grid for managing trips, events, and activities. Supports multi-user access with Google OAuth authentication.

**Live URL**: Deployed on Railway
**Repository**: github.com/vkotaru/yearly.app

---

## Tech Stack

### Frontend (port 5173)
- React 18 + TypeScript
- Vite for bundling
- CSS Modules for styling
- `@react-oauth/google` for Google Sign-In

### Backend (port 3001)
- Express.js + TypeScript
- better-sqlite3 for database
- `google-auth-library` for token verification
- JWT in httpOnly cookies for sessions

### Shared
- `shared/types.ts` - TypeScript interfaces shared between frontend/backend

---

## Project Structure

```
yearly.app/
├── client/                    # React frontend
│   ├── src/
│   │   ├── api/entries.ts     # API client functions
│   │   ├── components/
│   │   │   ├── YearGrid/      # Main calendar grid
│   │   │   ├── MonthRow/      # Individual month rows
│   │   │   ├── EntryEditor/   # Modal for creating/editing entries
│   │   │   ├── EntryDetailPanel/  # Side panel for viewing entry details
│   │   │   ├── CategoryFilter/    # Filter entries by category
│   │   │   ├── Login/         # Google OAuth login page
│   │   │   └── Settings/      # User settings modal
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx    # Authentication state management
│   │   ├── utils/
│   │   │   ├── calendar.ts    # Date utilities
│   │   │   └── entryLayout.ts # Grid layout algorithms
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css          # CSS variables and global styles
│   └── vite.config.ts         # Vite config with API proxy
│
├── server/                    # Express backend
│   ├── src/
│   │   ├── db.ts              # SQLite database setup + migrations
│   │   ├── index.ts           # Express server entry point
│   │   ├── routes/
│   │   │   ├── entries.ts     # CRUD for entries, comments, todos
│   │   │   └── auth.ts        # Google OAuth endpoints
│   │   ├── middleware/
│   │   │   └── auth.ts        # JWT verification middleware
│   │   └── utils/
│   │       └── jwt.ts         # JWT creation/verification
│   └── data/yearly.db         # SQLite database (gitignored)
│
├── shared/
│   └── types.ts               # Shared TypeScript interfaces
│
├── package.json               # Root package with dev scripts
└── nixpacks.toml              # Railway build configuration
```

---

## Database Schema

### entries
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| year | INTEGER | Year (e.g., 2026) |
| month | INTEGER | Month 1-12 |
| day_start | INTEGER | Start day 1-31 |
| day_end | INTEGER | End day 1-31 |
| row_index | INTEGER | Row position in month |
| title | TEXT | Entry title |
| description | TEXT | Description |
| url | TEXT | Associated URL |
| color | TEXT | Hex color or rgba |
| category | TEXT | Category for filtering |
| emoji | TEXT | Emoji displayed before title |
| departure_time | TEXT | Travel departure info |
| arrival_time | TEXT | Travel arrival info |
| user_id | INTEGER | Owner (FK to users) |
| is_private | INTEGER | 0=shared, 1=private |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

### users
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| google_id | TEXT | Google OAuth ID (unique) |
| email | TEXT | User email |
| name | TEXT | Display name |
| picture | TEXT | Avatar URL |
| created_at | TEXT | Timestamp |

### comments
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| entry_id | INTEGER | FK to entries |
| text | TEXT | Comment text |
| author | TEXT | Author name |
| user_id | INTEGER | FK to users |
| created_at | TEXT | Timestamp |

### todos
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| entry_id | INTEGER | FK to entries |
| text | TEXT | Todo item text |
| completed | INTEGER | 0=pending, 1=done |
| sort_order | INTEGER | Display order |
| created_at | TEXT | Timestamp |
| updated_at | TEXT | Timestamp |

---

## Key Features

### Calendar Grid
- 12 months × 31 days CSS Grid layout
- `display: contents` on MonthRow for flat grid
- Entries span multiple days via `grid-column: span N`
- Drag to select date range for new entries
- Drag entries to move them
- Resize entries by dragging right edge
- Click column header to highlight entire column

### Entry Management
- Title, description, URL, category fields
- Emoji picker with 20 quick-select options
- Travel times (departure/arrival) for trips
- Color picker with opacity slider
- Private entries (only visible to creator)
- Checklist/todo items per entry
- Comments with author attribution

### Visual Indicators
- Today's date highlighted in header (green)
- Past dates show diagonal stripes
- Past entries grayed out (grayscale filter)
- Incomplete todo count badge on entries
- Weekend columns have subtle tint

### Authentication
- Google OAuth 2.0 Sign-In
- JWT stored in httpOnly cookie (7-day expiry)
- Shared entries visible to all users
- Private entries only visible to creator
- Ownership check on edit/delete

---

## API Endpoints

### Auth (`/api/auth`)
- `POST /google` - Exchange Google credential for JWT
- `GET /me` - Get current user
- `POST /logout` - Clear auth cookie

### Entries (`/api/entries`)
- `GET /:year` - Get entries for year (includes incomplete_todos count)
- `POST /` - Create entry
- `PUT /:id` - Update entry (ownership check)
- `DELETE /:id` - Delete entry (ownership check)

### Comments (`/api/entries`)
- `GET /:id/comments` - Get comments for entry
- `POST /:id/comments` - Add comment
- `DELETE /comments/:id` - Delete comment (ownership check)

### Todos (`/api/entries`)
- `GET /:id/todos` - Get todos for entry
- `POST /:id/todos` - Create todo
- `PUT /todos/:id` - Update todo (toggle complete)
- `DELETE /todos/:id` - Delete todo

---

## Environment Variables

### Server (`server/.env`)
```
GOOGLE_CLIENT_ID=your-google-client-id
JWT_SECRET=your-secret-key
DATABASE_PATH=/data/yearly.db  # Railway volume
```

### Client (`client/.env`)
```
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## Development

```bash
# Install dependencies
npm install

# Run both frontend and backend
npm run dev

# Build for production
npm run build
```

---

## Deployment (Railway)

1. **Build**: Uses `nixpacks.toml` to install dev dependencies for TypeScript compilation
2. **Start**: Runs `npm start` which starts the Express server
3. **Volume**: Mount `/data` for persistent SQLite storage
4. **Environment**: Set `DATABASE_PATH=/data/yearly.db`
5. **CORS**: Server allows `.railway.app` domains

---

## Key Code Patterns

### Entry Layout Algorithm (`entryLayout.ts`)
```typescript
computeRowSlots(entries, daysInMonth, minRows)
// Returns 2D array of cells, each cell is:
// - { type: 'start', entry } - entry begins here
// - { type: 'continuation' } - entry continues (hidden, covered by span)
// - null - empty cell
```

### Color Handling
- Supports hex (`#3b82f6`) and rgba (`rgba(59, 130, 246, 0.5)`)
- Opacity slider in editor creates rgba strings
- Text color auto-calculated based on background luminance

### Date Utilities (`calendar.ts`)
- `getDaysInMonth(year, month)` - handles leap years
- `isWeekend(year, month, day)` - checks Sat/Sun
- `getMonthName(month)` - returns abbreviated name

---

## CSS Variables (from `index.css`)

```css
--accent-500: #6366f1;      /* Primary accent (indigo) */
--success-500: #10b981;     /* Today highlight (green) */
--neutral-200: #e5e7eb;     /* Past date stripes */
--grid-cell-height: 24px;   /* Cell height */
--radius-md: 6px;           /* Border radius */
```

---

## Future Ideas
- Multi-year navigation (year selector in header)
- Entry duplication
- Search/filter by title
- Keyboard shortcuts
- Export to image/PDF
- Recurring entries
