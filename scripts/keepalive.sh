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
  # Touch a temp file and print a timestamped heartbeat.
  # Terminal output is more reliably detected by the Codespaces idle monitor
  # than filesystem-only activity.
  touch /tmp/.codespace-keepalive 2>/dev/null
  echo "[keepalive] $(date -u '+%Y-%m-%dT%H:%M:%SZ') alive (PID $$)"
  sleep "$INTERVAL"
done
