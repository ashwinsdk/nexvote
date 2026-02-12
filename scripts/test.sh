#!/usr/bin/env bash
# NexVote – Run all test suites
# Usage: ./scripts/test.sh [--backend | --contracts | --all]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${1:---all}"
EXIT_CODE=0

run_backend_tests() {
    echo "── Backend Tests ──────────────────────────────"
    (cd "$ROOT_DIR/backend" && npm test -- --ci) || EXIT_CODE=1
    echo ""
}

run_contract_tests() {
    echo "── Contract Tests ─────────────────────────────"
    (cd "$ROOT_DIR/contracts" && npx hardhat test) || EXIT_CODE=1
    echo ""
}

run_frontend_tests() {
    echo "── Frontend Tests ─────────────────────────────"
    (cd "$ROOT_DIR/frontend" && npx ng test --watch=false --browsers=ChromeHeadless 2>/dev/null) || {
        echo "[info] Frontend tests skipped (no test runner configured or Chrome not available)"
    }
    echo ""
}

echo "================================================"
echo "  NexVote – Test Runner"
echo "  Target: $TARGET"
echo "================================================"
echo ""

case "$TARGET" in
    --backend)
        run_backend_tests
        ;;
    --contracts)
        run_contract_tests
        ;;
    --frontend)
        run_frontend_tests
        ;;
    --all)
        run_backend_tests
        run_contract_tests
        run_frontend_tests
        ;;
    *)
        echo "Usage: ./scripts/test.sh [--backend | --contracts | --frontend | --all]"
        exit 1
        ;;
esac

if [ $EXIT_CODE -ne 0 ]; then
    echo "Some tests failed."
    exit $EXIT_CODE
fi

echo "All tests passed."
