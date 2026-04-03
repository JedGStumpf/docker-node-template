#!/usr/bin/env bash
# Prevents GitHub Codespaces from going idle by generating periodic activity.
# The idle detector monitors terminal/process activity — this script creates
# just enough to keep the session alive.
#
# Usage:
#   nohup bash scripts/keepalive.sh &
#   # Or run in a background terminal in the IDE

INTERVAL="${KEEPALIVE_INTERVAL:-300}" # seconds between pings (default: 5 min)

echo "[keepalive] started — pinging every ${INTERVAL}s (PID $$)"

while true; do
  # Touch a temp file to create filesystem activity (detected by idle monitor)
  touch /tmp/.codespace-keepalive 2>/dev/null
  sleep "$INTERVAL"
done
