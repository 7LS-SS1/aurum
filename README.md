# AURUM — multi-site content distribution platform

Upload content once, distribute (video + metadata) to multiple WordPress sites in parallel via the
WordPress REST API, with a public AURUM-themed display site.

Stack: **Next.js 15 (App Router)** · **Prisma + NeonDB (PostgreSQL)** · **Auth.js (credentials/JWT)**
· **Cloudflare R2** (images) · **Bunny.net Stream** (video: transcode + HLS delivery)

> The previous Express/static-HTML prototype is preserved untouched under [`legacy/`](legacy/) for
> reference — it is no longer part of the running application.

## Getting started

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, R2_*, BUNNY_*
npm run db:migrate            # creates tables in NeonDB
npm run db:seed               # seeds an admin user (admin@aurum.local / ChangeMe123!) + demo data
npm run dev                   # http://localhost:3000
```

Generate the required secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"       # ENCRYPTION_KEY
```

**Change the seeded admin password immediately** — it exists only to unblock local development.

## Architecture

- `src/app/(admin gated by middleware)` — upload/distribute dashboard + site management, client
  components calling the API routes below. Protected by `src/middleware.ts` (session + role check).
- `src/app/page.tsx`, `src/app/watch/[id]/page.tsx` — public display site. These are **React Server
  Components that query Prisma directly**, not a public JSON API — there is nothing for a scraper to
  hit repeatedly, and Next.js's route-level `revalidate` handles caching.
- `src/app/api/**` — mutating operations only (create/distribute/manage sites, presigned uploads).
  Every route: role-checked (`src/lib/authz.ts`), zod-validated (`src/lib/validation.ts`), rate-limited
  (`src/lib/rate-limit.ts`), and never leaks internal error details (`src/lib/api-response.ts`).
- `src/lib/distributor.ts` + `src/lib/wordpress-client.ts` — the distribution engine. Fans out to all
  selected sites with `Promise.allSettled` (one failing site never blocks the others) and records
  per-site status in the `distributions` table.
- `prisma/schema.prisma` — `Movie` is the single source of truth for the video; `MovieSiteDraft` holds
  optional per-site title/excerpt/content/tag overrides so the same video can be described differently
  per destination without duplicating the video itself.

## Security notes

- WordPress application passwords / JWTs are AES-256-GCM encrypted before they ever reach the database
  (`src/lib/crypto.ts`) and are never returned by any API response.
- All admin API routes require an authenticated session; site-credential management additionally
  requires the `ADMIN` role (`EDITOR` can create/distribute content but not register sites).
- Uploads go straight from the browser to R2/Bunny via short-lived presigned URLs — file bytes never
  transit this server, and server-side content-type/size checks (`src/lib/validation.ts`) run before a
  presigned URL is even issued.
- Configure `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in any multi-instance deployment —
  without it, rate limiting falls back to a per-instance in-memory limiter (fine for local dev only).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev/build/production server |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:migrate:deploy` | Apply migrations in CI/production |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Seed an admin user + demo movie/site |
| `npm test` | Vitest |
