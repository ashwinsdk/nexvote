#!/usr/bin/env bash
# NexVote – Start all services for local development
# Usage: ./scripts/start.sh [--docker | --local]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:---local}"

echo "================================================"
echo "  NexVote – Development Startup"
echo "  Mode: $MODE"
echo "================================================"

if [ "$MODE" = "--docker" ]; then
    echo ""
    echo "[1/1] Starting all services via Docker Compose..."
    docker compose up --build -d
    echo ""
    echo "Services:"
    echo "  Frontend:  http://localhost:4200"
    echo "  Backend:   http://localhost:3000"
    echo "  AI:        http://localhost:8000"
    echo "  Postgres:  localhost:5432"
    echo ""
    echo "Logs: docker compose logs -f"
    exit 0
fi

# ── Local mode ────────────────────────────────────────────────────────────────

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "Error: node is required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 is required"; exit 1; }

# Load .env
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
    echo "[env] Loaded .env"
else
    echo "[warn] No .env file found. Copy .env.example to .env and edit it."
fi

# Install deps if needed
echo ""
echo "[1/5] Checking dependencies..."

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
    echo "  Installing backend dependencies..."
    (cd "$ROOT_DIR/backend" && npm install)
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo "  Installing frontend dependencies..."
    (cd "$ROOT_DIR/frontend" && npm install)
fi

if [ ! -d "$ROOT_DIR/db/node_modules" ]; then
    echo "  Installing db dependencies..."
    (cd "$ROOT_DIR/db" && npm install)
fi

if [ ! -d "$ROOT_DIR/ai/venv" ]; then
    echo "  Setting up AI virtual environment..."
    (cd "$ROOT_DIR/ai" && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt)
fi

# Run migrations
echo ""
echo "[2/5] Running database migrations..."
(cd "$ROOT_DIR/db" && npx knex migrate:latest --knexfile knexfile.js) || {
    echo "[warn] Migrations failed – is PostgreSQL running?"
}

# Start AI service
echo ""
echo "[3/5] Starting AI service (port 8000)..."
(cd "$ROOT_DIR/ai" && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000) &
AI_PID=$!

# Start backend
echo ""
echo "[4/5] Starting backend (port 3000)..."
(cd "$ROOT_DIR/backend" && npx ts-node-dev --respawn src/index.ts) &
BACKEND_PID=$!

# Start frontend
echo ""
echo "[5/5] Starting frontend (port 4200)..."
(cd "$ROOT_DIR/frontend" && npx ng serve --port 4200) &
FRONTEND_PID=$!

echo ""
echo "================================================"
echo "  All services starting..."
echo "  Frontend:  http://localhost:4200"
echo "  Backend:   http://localhost:3000"
echo "  AI:        http://localhost:8000"
echo "  Press Ctrl+C to stop all"
echo "================================================"

# Graceful shutdown
trap "kill $AI_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

wait
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $AI_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $AI_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "All services stopped."
}
trap cleanup SIGINT SIGTERM

wait
