#!/bin/sh
# Push the schema to a SQLite database and generate a SQLite-compatible client.
# Creates a temporary schema with provider="sqlite" and stripped @db annotations,
# runs prisma generate + db push, then cleans up.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA="$SCRIPT_DIR/schema.prisma"
TMP_SCHEMA="$SCRIPT_DIR/schema.sqlite.prisma"

# Create SQLite-compatible schema
sed -e 's/provider = "postgresql"/provider = "sqlite"/' \
    -e 's/@db\.VarChar([0-9]*)//' \
    -e 's/@db\.Timestamptz([0-9]*)//' \
    "$SCHEMA" > "$TMP_SCHEMA"

# Generate Prisma client from SQLite schema
npx prisma generate --schema "$TMP_SCHEMA"

# Push schema to SQLite
DATABASE_URL="${DATABASE_URL}" npx prisma db push --schema "$TMP_SCHEMA"

# Clean up
rm "$TMP_SCHEMA"

echo "SQLite schema pushed and client generated successfully."
