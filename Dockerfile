# syntax=docker/dockerfile:1
#
# Multi-stage build for Coolify (or any Docker-based host). Produces a lean
# runtime image using Next.js's "standalone" output (next.config.ts sets
# output: "standalone") plus just enough of the Prisma CLI to run
# `prisma migrate deploy` on container boot — the standalone trace alone only
# bundles what `node server.js` itself imports, not arbitrary npm scripts.
#
# Debian-slim (not alpine) — Prisma's query engine binaries need glibc/OpenSSL
# and are notoriously flaky on musl/alpine without extra binaryTargets config.

FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Forced regardless of any ambient NODE_ENV build arg/env a host might inject
# (e.g. a platform defaulting build-time vars to "development") — `next build`
# run with a non-production NODE_ENV is a known cause of prerender failures
# like "<Html> should not be imported outside of pages/_document" on /404.
# DATABASE_URL etc. are NOT required here — `prisma generate` only reads the
# schema file, it never needs a live database connection.
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ARG GIT_COMMIT_SHA=unknown
ENV NODE_ENV=production
ENV PORT=3000
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone server + static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# WordPress theme source — not an npm dependency, so Next's standalone trace
# never picks it up automatically; the admin "WordPress Theme" page zips this
# directory on demand (src/app/api/wp-theme/download/route.ts) and needs it
# present on disk at runtime.
COPY --from=builder /app/wordpress-theme ./wordpress-theme

# Prisma CLI + schema/migrations for `prisma migrate deploy` on boot
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && chown nextjs:nodejs docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
