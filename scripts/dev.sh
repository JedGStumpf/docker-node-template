#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Load environment
set -a
. ./.env 2>/dev/null || true
set +a

if [[ "$DATABASE_URL" == file:* ]]; then
  # SQLite mode — no Docker needed
  exec npx concurrently -n server,client -c green,magenta \
    "cd server && ./prisma/sqlite-push.sh && npm run dev" \
    "cd client && npx wait-on http://localhost:3000/api/health && npx vite --host"
else
  # Postgres mode — start DB container + server + client
  exec npx concurrently -n db,server,client -c blue,green,magenta \
    "DOCKER_CONTEXT=$DEV_DOCKER_CONTEXT docker compose -f docker-compose.dev.yml up db" \
    "./docker/wait-for-db.sh && cd server && npx prisma generate && npx prisma migrate dev && npm run dev" \
    "cd client && npx wait-on http://localhost:3000/api/health && npx vite --host"
fi
