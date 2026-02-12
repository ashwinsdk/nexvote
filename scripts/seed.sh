#!/usr/bin/env bash
# NexVote – Seed the database with demo data
# Usage: ./scripts/seed.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

echo "Running database seeds..."
(cd "$ROOT_DIR/db" && npx knex seed:run --knexfile knexfile.js)
echo "Seeding complete."
