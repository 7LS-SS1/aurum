#!/bin/sh
set -e

echo "Running prisma generate..."
node_modules/.bin/prisma generate
echo "Running prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy

exec "$@"
