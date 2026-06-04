#!/usr/bin/env bash
# Start Memoria (backend + frontend dev server)
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend…"
cd "$ROOT"
MEMORIA_TTL="${MEMORIA_TTL:-liveaid_instances_master.ttl}" \
  python3 -m uvicorn backend.api:app --host 0.0.0.0 --port 8765 --reload &
BACKEND_PID=$!

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
