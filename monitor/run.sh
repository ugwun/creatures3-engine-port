#!/usr/bin/env bash
# run.sh — Start the Creatures 3 browser monitor
# Usage: cd monitor && ./run.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "[monitor] Installing dependencies..."
  npm install --silent
fi

# Kill any stale relay that may already hold port 9998
STALE=$(lsof -ti tcp:9998 2>/dev/null || true)
if [ -n "$STALE" ]; then
  echo "[monitor] Killing stale process on port 9998 (PID $STALE)"
  kill $STALE 2>/dev/null || true
  sleep 0.3
fi

# Start the relay in the background
node relay.js &
RELAY_PID=$!
echo "[monitor] Relay started (PID $RELAY_PID)"

# Give it a moment to bind the port
sleep 0.5

# Open the browser console
echo "[monitor] Opening browser..."
open "file://$SCRIPT_DIR/index.html"

echo "[monitor] Ready. Open the game: ../build/lc2e"
echo "[monitor] Press Ctrl+C to stop the relay."

# Wait for relay to exit (or user Ctrl+C)
wait $RELAY_PID
