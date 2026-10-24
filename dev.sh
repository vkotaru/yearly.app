#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[dev]${NC} $*"; }
warn()  { echo -e "${YELLOW}[dev]${NC} $*"; }
error() { echo -e "${RED}[dev]${NC} $*" >&2; }

# ── Check prerequisites ──
for cmd in node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is not installed"
    exit 1
  fi
done

info "Node $(node -v) / npm $(npm -v)"

# ── Create .env files if missing ──
if [ ! -f server/.env ]; then
  warn "server/.env not found — creating from template"
  cat > server/.env <<'EOF'
# Google OAuth (get from console.cloud.google.com)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# JWT secret (generate with: openssl rand -base64 32)
JWT_SECRET=change-me-to-a-random-secret

# Login allowlist: comma-separated emails and/or @domains. Empty = all Google logins rejected.
ALLOWED_EMAILS=

# SQLite path (local dev default)
DATABASE_PATH=./data/yearly.db

# Port
PORT=3001
EOF
  warn "  -> Edit server/.env with your real credentials before using auth"
fi

if [ ! -f client/.env ]; then
  warn "client/.env not found — creating from template"
  cat > client/.env <<'EOF'
# Must match the server's GOOGLE_CLIENT_ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id
EOF
  warn "  -> Edit client/.env with your real Google Client ID"
fi

# ── Install dependencies ──
if [ ! -d node_modules ]; then
  info "Installing root dependencies..."
  npm install
fi

if [ ! -d client/node_modules ]; then
  info "Installing client dependencies..."
  (cd client && npm install)
fi

if [ ! -d server/node_modules ]; then
  info "Installing server dependencies..."
  (cd server && npm install)
fi

# ── Ensure server data directory exists ──
mkdir -p server/data

# ── Start dev servers ──
info "Starting dev servers..."
info "  Client: http://localhost:5173"
info "  Server: http://localhost:3001"
info "  (Client proxies /api/* to server)"
echo ""

npm run dev
