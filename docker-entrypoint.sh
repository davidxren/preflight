#!/bin/sh
# Migrations run before the server accepts traffic, through the same script the
# test suite and `npm run db:migrate` use, so there is one migration path.
set -e

echo "[preflight] migrating ${PREFLIGHT_DB_PATH}"
node_modules/.bin/tsx scripts/migrate.ts

echo "[preflight] starting on ${HOSTNAME}:${PORT} (data mode: ${PREFLIGHT_DATA})"
exec node_modules/.bin/next start --hostname "${HOSTNAME}" --port "${PORT}"
