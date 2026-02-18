#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Tablerizer Test Runner
# Spins up PostgreSQL in Docker and runs the full test suite
# ============================================================

COMPOSE_FILE="docker-compose.test.yml"
PROJECT_NAME="tablerizer-tests"

cleanup() {
  echo ""
  echo "Cleaning up..."
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "=========================================="
echo " Tablerizer Test Suite"
echo "=========================================="
echo ""

# Clean previous runs
cleanup 2>/dev/null || true

# Build and run
echo "Starting PostgreSQL and building test image..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build tests

echo ""
echo "Running tests..."
echo "------------------------------------------"

docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" run --rm tests
EXIT_CODE=$?

echo "------------------------------------------"

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "All tests passed."
else
  echo ""
  echo "Tests failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
