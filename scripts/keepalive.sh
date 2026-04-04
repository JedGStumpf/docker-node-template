#!/usr/bin/env bash
# Prevents GitHub Codespaces from going idle by generating periodic activity.
# The idle detector monitors terminal/process activity — this script creates
# just enough to keep the session alive.
#
# Usage:
#   nohup bash scripts/keepalive.sh &
#   # Or run in a background terminal in the IDE

INTERVAL="${KEEPALIVE_INTERVAL:-120}" # seconds between pings (default: 2 min)

echo "[keepalive] started — pinging every ${INTERVAL}s (PID $$)"

while true; do
  # Make an HTTP request to a forwarded port. Codespaces registers inbound
  # traffic on forwarded ports as activity, keeping the session alive even
  # when the browser tab is in the background.
  # Try ports in order: 5173 (Vite dev server), 3000 (Express), fallback to
  # touching a file so the script stays alive even before the server starts.
  if curl -sf --max-time 5 http://localhost:9999/ -o /dev/null 2>/dev/null; then
    echo "[keepalive] $(date -u '+%Y-%m-%dT%H:%M:%SZ') pinged :9999 (PID $$)"
  elif curl -sf --max-time 5 http://localhost:5173/ -o /dev/null 2>/dev/null; then
    echo "[keepalive] $(date -u '+%Y-%m-%dT%H:%M:%SZ') pinged :5173 (PID $$)"
  elif curl -sf --max-time 5 http://localhost:3000/ -o /dev/null 2>/dev/null; then
    echo "[keepalive] $(date -u '+%Y-%m-%dT%H:%M:%SZ') pinged :3000 (PID $$)"
  else
    touch /tmp/.codespace-keepalive 2>/dev/null
    echo "[keepalive] $(date -u '+%Y-%m-%dT%H:%M:%SZ') no server yet — waiting (PID $$)"
  fi
  sleep "$INTERVAL"
done
