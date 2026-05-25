# 📅 Yearly Planner

A high-density, full-stack yearly planner web application displaying an entire year (12 months × 31 days) on a single scrollable grid. Designed for visualizing personal schedules, trips, work blocks, and goals at a glance.

![Yearly Planner Screenshot](docs/screenshot.png)

## ✨ Features

- **Year-at-a-Glance Grid**: 12-month visual timeline with drag-and-drop entry management.
- **Multiple Views**: Seamlessly switch between Year Grid, Week-Year List, Month View, and Agenda List.
- **Task & Comments Layer**: Maintain todo lists and collaborative logs directly inside event details.
- **Dev-Bypass Auth**: Built-in developer login to completely skip Google OAuth constraints during local runs.
- **Zero-Config Database**: Autoseeds mock categories and alternating 7-day "Work Week" schedules upon launch.

---

## 🚀 Quick Start (Development)

Set up dependencies, auto-create the database, seed mock entries, and launch the dev server in **one command**:

```bash
# 1. Clone the project
git clone https://github.com/vkotaru/yearly.app.git
cd yearly.app

# 2. Run the automated startup script
./run-dev.sh
```

The app will compile and launch. Access the local client at **`http://localhost:5173`** (or next available port).

---

## 🛠️ Configuration

Configure Google OAuth and production settings via `server/.env`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:5173
```

---

## 📦 Deployment (Railway)

The app is optimized for Railway deployments out of the box using [nixpacks.toml](nixpacks.toml) and [railway.json](railway.json):

1. Link your repository in Railway.
2. Mount a persistent disk volume at `/data` (for SQLite storage).
3. Set the `DATABASE_PATH` env variable to `/data/yearly.db`.
4. Define your client production origin in `FRONTEND_URL` to enable CORS headers.

---
*Vibe coding for the win!*
