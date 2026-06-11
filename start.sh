#!/usr/bin/env bash
# Start Memoria (backend + frontend dev server)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Killing any existing processes on ports 8765 and 5173…"
lsof -ti:8765 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "Starting backend…"
cd "$ROOT"
MEMORIA_TTL="${MEMORIA_TTL:-instance-types_lang=en_specific.ttl}" \
  python3 -m uvicorn backend.api:app --host 0.0.0.0 --port 8765 --reload &
BACKEND_PID=$!

echo "Waiting for backend to finish loading…"
until curl -sf http://localhost:8765/suggestions?top=1 > /dev/null 2>&1; do
  sleep 2
done
echo "Backend ready."

echo "Starting frontend…"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

echo ""
echo "  Backend : http://localhost:8765"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."
wait
