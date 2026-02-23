#!/bin/sh
set -e

echo "Waiting for database..."
npx wait-on tcp:db:5432 --timeout 30000

echo "Running migrations..."
npx prisma migrate dev --schema prisma/schema.prisma --skip-generate --name auto 2>/dev/null || npx prisma migrate deploy --schema prisma/schema.prisma

echo "Starting dev server..."
exec npx ts-node-dev --respawn --transpile-only --poll src/index.ts
