#!/usr/bin/env bash
# NexVote – Build all services for production
# Usage: ./scripts/build.sh [--docker | --local]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:---local}"

echo "================================================"
echo "  NexVote – Production Build"
echo "  Mode: $MODE"
echo "================================================"
echo ""

if [ "$MODE" = "--docker" ]; then
    echo "[1/4] Building backend image..."
    docker build -t nexvote-backend ./backend

    echo "[2/4] Building AI image..."
    docker build -t nexvote-ai ./ai

    echo "[3/4] Building frontend image..."
    docker build -t nexvote-frontend ./frontend

    echo "[4/4] Building DB migration image..."
    docker build -t nexvote-db ./db

    echo ""
    echo "All Docker images built successfully."
    echo "  nexvote-backend"
    echo "  nexvote-ai"
    echo "  nexvote-frontend"
    echo "  nexvote-db"
    exit 0
fi

# ── Local builds ──────────────────────────────────────────────────────────────

echo "[1/3] Building backend..."
(cd "$ROOT_DIR/backend" && npm ci && npm run build)
echo "  -> backend/dist/"

echo ""
echo "[2/3] Building frontend..."
(cd "$ROOT_DIR/frontend" && npm ci && npx ng build --configuration=production)
echo "  -> frontend/dist/"

echo ""
echo "[3/3] Compiling contracts..."
(cd "$ROOT_DIR/contracts" && npm ci && npx hardhat compile)
echo "  -> contracts/artifacts/"

echo ""
echo "All builds completed successfully."
