#!/bin/sh
set -e

# Prisma Client is generated at build time. Schema changes run as an explicit
# release job after backup/restore verification, not on web or worker restarts.
if [ "${1:-}" = "migrate" ]; then
  exec node node_modules/prisma/build/index.js migrate deploy
fi

exec "$@"
