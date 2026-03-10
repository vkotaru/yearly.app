# Yearly Planner

A modern, full-stack yearly planner web application with a visual 12-month grid layout, multiple view modes, and Google OAuth authentication.

## Features

### Calendar Views
- **Year Grid** - 12-month × 31-day grid with drag-and-drop entry management
- **Week Year** - 7-column (Mon-Sun) view with ~52 weeks stacked vertically
- **Month View** - Traditional single-month calendar (7×6 grid)
- **List View** - Chronological agenda grouped by month

### Entry Management
- Create entries spanning multiple days or months
- Drag to resize and move entries
- Color picker with opacity support
- Emoji quick picker
- Categories for filtering and organization
- Mark entries as "background" (subtle display)
- Travel times (departure/arrival)
- Private entries
- Checklist/todos per entry
- Comments with author attribution

### Visual Features
- Today highlighted in header
- Past dates shown with diagonal stripes
- Past entries have grayscale filter
- Incomplete todo badges on entry cells
- Sticky headers for filter chips and day numbers
- Auto-scroll to current week in Week Year view

### Settings
- Multiple font options (Geist, Inter, DM Sans, etc.)
- Adjustable font size and grid cell size
- Calendar width customization
- Background categories (entries display subtly)
- Settings sync across devices

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (dev server on port 5173)
- CSS Modules for styling
- React Context for state management

### Backend
- Express.js + TypeScript
- better-sqlite3 for database
- JWT authentication (httpOnly cookies)
- Google OAuth 2.0

### Deployment
- Hosted on Railway
- SQLite database with volume mount for persistence

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/vkotaru/yearly.app.git
cd yearly.app

# Install dependencies
npm install

# Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your Google OAuth credentials
```

### Environment Variables

Create `server/.env`:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:5173
```

### Development

```bash
# Run both frontend and backend
npm run dev

# Frontend only (port 5173)
cd client && npm run dev

# Backend only (port 3001)
cd server && npm run dev
```

### Production Build

```bash
# Build frontend
cd client && npm run build

# Start production server
cd server && npm start
```

## Project Structure

```
yearly.app/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── views/      # View modes (YearGrid, WeekYear, Month, List)
│   │   │   ├── EntryEditor/
│   │   │   ├── UserMenu/
│   │   │   └── ...
│   │   ├── contexts/       # React contexts (Settings, Entries, History)
│   │   ├── api/            # API client functions
│   │   └── utils/          # Utility functions
│   └── ...
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API routes (auth, entries, settings)
│   │   ├── db.ts           # SQLite database setup
│   │   └── index.ts        # Express app
│   └── data/               # SQLite database (gitignored)
├── shared/                 # Shared TypeScript types
│   └── types.ts
└── ...
```

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Entries
- `GET /api/entries?year=2026` - Get entries for year
- `POST /api/entries` - Create entry
- `PUT /api/entries/:id` - Update entry
- `DELETE /api/entries/:id` - Delete entry

### Settings
- `GET /api/settings` - Get user settings
- `PATCH /api/settings` - Update settings

## License

MIT

---

*Vibe coding for the win!!!*
