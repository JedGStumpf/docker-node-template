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
    -e 's/String\[\]\s*@default(\[\])/String @default("")/' \
    -e 's/String\[\]/String @default("")/' \
    "$SCHEMA" > "$TMP_SCHEMA"

# Also fix enum references (SQLite doesn't support enums as native types)
# Replace RequestStatus and AssignmentStatus type annotations with String
sed -i \
    -e '/^enum RequestStatus/,/^}/d' \
    -e '/^enum AssignmentStatus/,/^}/d' \
    -e 's/RequestStatus\s*@default([^)]*)/String @default("unverified")/' \
    -e 's/AssignmentStatus\s*@default([^)]*)/String @default("pending")/' \
    -e 's/RequestStatus/String/' \
    -e 's/AssignmentStatus/String/' \
    "$TMP_SCHEMA"

# Generate Prisma client from SQLite-compatible schema
npx prisma generate --schema "$TMP_SCHEMA"

# Push schema to SQLite database
DATABASE_URL="${DATABASE_URL}" npx prisma db push --schema "$TMP_SCHEMA"

# Clean up temp schema
rm "$TMP_SCHEMA"

echo "SQLite schema pushed and client generated successfully."
