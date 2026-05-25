#!/bin/bash

# Exit on error
set -e

echo "=================================================="
echo "=== Setting up Yearly Planner dev environment ==="
echo "=================================================="

# Check if node_modules exists, if not run npm install
if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d "client/node_modules" ]; then
  echo "Installing client dependencies..."
  cd client && npm install && cd ..
fi

if [ ! -d "server/node_modules" ]; then
  echo "Installing server dependencies..."
  cd server && npm install && cd ..
fi

# Ensure data directory exists for SQLite
mkdir -p server/data

# Seed database (this will auto-create the dev user if database is empty and seed data)
echo "Seeding database with mock events..."
cd server
npm run seed -- --clear
cd ..

# Start development servers
echo "Starting dev servers..."
npm run dev
