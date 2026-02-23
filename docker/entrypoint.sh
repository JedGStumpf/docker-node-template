#!/bin/sh

# Load each Docker Swarm secret file as an environment variable.
# File name maps to variable name (uppercased).
# e.g. /run/secrets/db_password → $DB_PASSWORD
for secret_file in /run/secrets/*; do
  if [ -f "$secret_file" ]; then
    var_name=$(basename "$secret_file" | tr '[:lower:]' '[:upper:]')
    export "$var_name"="$(cat "$secret_file")"
  fi
done

exec "$@"
