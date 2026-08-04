#!/bin/sh
set -e

mkdir -p /app/data

if [ "$(id -u)" = "0" ]; then
  if ! chown -R node:node /app/data; then
    echo "warning: could not chown /app/data; continuing with existing permissions" >&2
  fi

  if command -v runuser >/dev/null 2>&1; then
    runuser -u node -- node /app/scripts/migrate-database.cjs
    exec runuser -u node -- "$@"
  fi

  su node -s /bin/sh -c 'node /app/scripts/migrate-database.cjs'
  exec su node -s /bin/sh -c 'exec "$@"' -- "$@"
fi

node /app/scripts/migrate-database.cjs
exec "$@"
