#!/bin/sh
# Container start. Any failing step stops the container, so the host shows a failed deploy instead of serving a broken app.
set -e
# First, so an unsafe configuration never reaches the database (it prints each problem and exits 1).
node_modules/.bin/tsx scripts/check-config.ts
npx --no-install prisma migrate deploy
npm run db:seed:prod
# exec: next becomes the container's main process, so the host's stop signal (SIGTERM) reaches it and it can shut down.
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
