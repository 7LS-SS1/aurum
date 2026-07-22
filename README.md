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
  per-site status in the `distributions` table. Every published post carries an `aurum_movie_id` meta
  field (registered for REST read/write by `wordpress-theme/aurum-video/inc/meta.php`) — the stable
  identity `src/lib/site-sync` matches back against when checking what's already live on a site.
- `src/lib/site-sync/` — "sync old videos to a site" as a persistent, resumable, per-site background
  job (`SiteSyncJob`/`SiteSyncJobLog` in the schema): scans every post on the destination WordPress
  site (full pagination, never just page 1), matches each AURUM movie against that scan
  (`aurum_movie_id` → jwplayer media id → canonical video URL → slug/title, never fuzzy — see
  `match.ts`), reconciles anything already published, and only pushes what's genuinely missing by
  reusing `distributeToSite()`. Driven entirely by `/api/cron/site-sync-worker`, not by the browser —
  see the Coolify section below and `job-runner.ts`'s own doc comments for the concurrency/locking design.
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

## Deploying to Coolify (or any Docker host)

The repo ships a multi-stage `Dockerfile` (Next.js `output: "standalone"` + the Prisma CLI needed to
run migrations on boot) and a `docker-entrypoint.sh` that runs `prisma migrate deploy` before starting
the server — so schema changes ship automatically on every deploy, no manual migration step needed.

1. In Coolify, create a new **Dockerfile**-based application pointing at this repo.
2. Set the port to `3000` and point the healthcheck at `GET /api/health` (already implemented,
   returns `{ ok: true }`).
3. Set these environment variables (see `.env.example` for the full list/format):
   - `DATABASE_URL` (and `DIRECT_URL` if your Postgres needs a separate non-pooled connection for
     migrations, e.g. Neon)
   - `AUTH_SECRET`, `AUTH_URL` (your production origin, e.g. `https://aurum.example.com`)
   - `ENCRYPTION_KEY`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`,
     `R2_PUBLIC_HOSTNAME`, `NEXT_PUBLIC_R2_PUBLIC_URL`
   - `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_CDN_HOST` (optional fallback video path)
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (shared rate limiting across instances —
     required once you run more than one container)
   - `SYSTEM_API_KEY` (internal automation / the publish cron, see below)
   - `NODE_ENV=production`
4. **Never commit real values** — `.dockerignore` already excludes `.env*` so secrets are only ever
   injected by Coolify at runtime, never baked into the image.
5. Point an external scheduler (Coolify's own cron jobs, or any hourly job) at
   `POST /api/cron/publish-approved` with header `X-System-Key: <SYSTEM_API_KEY>` — this is what
   actually pushes `APPROVED` movies out to WordPress; nothing publishes automatically without it.
6. Also point a scheduler at `POST /api/cron/site-sync-worker` (same `X-System-Key` header) — **every
   1 minute** is recommended. This drives every "ซิงก์วิดีโอเก่า" (sync old videos) job started from
   the Sites admin page: each call claims a bounded number of in-progress jobs and advances each by one
   scan/compare step or one push batch, then returns immediately. Starting a sync also fires a
   best-effort immediate call to this same endpoint so a job usually begins within a second or two, but
   that immediate call is *not* durable on its own (the Node process can die between accepting the
   request and finishing the background work) — the cron schedule is what guarantees a job started
   right before a deploy/restart still finishes afterwards. See `src/lib/site-sync/job-runner.ts`.

Local sanity check before pushing: `docker build -t aurum . && docker run --env-file .env -p 3000:3000 aurum`,
then hit `http://localhost:3000/api/health`.

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
