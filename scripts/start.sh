#!/bin/sh
# Container start. Any failing step stops the container, so the host shows a failed deploy instead of serving a broken app.
set -e
npx --no-install prisma migrate deploy
npm run db:seed:prod
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
