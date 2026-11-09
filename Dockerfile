# Image for Render, or any host that runs Docker. Build it with: docker build -t majlisku .
# No secret is a build argument or an ENV line here. The build step below uses placeholder values on its own
# command line, and the real values reach the container from the host's environment when it starts.

FROM node:22-bookworm-slim AS base
# openssl: the Prisma query engine needs it. ca-certificates: TLS to Supabase, Google and the S3 endpoint.
# Debian (glibc) is used on purpose: sharp and ffmpeg-static ship binaries built for it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Every dependency, for the build. The "postinstall" script runs prisma generate, so the schema must be here first.
# Install scripts are left on: ffmpeg-static downloads its binary in one.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# Only what the running app needs. prisma and tsx are dependencies, so migrate deploy and the seed can run at start.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build only loads src/lib/env.ts, so it needs values of the right shape. They are placeholders and never reach the image
# as ENV. The real NEXT_PUBLIC_APP_URL is read from the environment at run time through env().
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" AUTH_SECRET="build-placeholder-not-a-secret-0000" HASH_SALT="build-placeholder-salt" NEXT_PUBLIC_APP_URL="http://localhost:3000" npm run build \
 && rm -rf .next/cache

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN chown node:node /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
# next.config.ts points the i18n plugin at this file, so it has to exist at start-up.
COPY --from=build --chown=node:node /app/src/i18n ./src/i18n
COPY --chown=node:node scripts/start.sh ./scripts/start.sh
USER node
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]