# Service page administration

`/admin/services` edits `/services`. MANAGER and HEAD can read and save through
`/api/services`; other roles, including SYSTEM, cannot. Saving publishes immediately.
Prices describe offers only: this feature never changes existing customer contracts,
video entitlements, WordPress credentials, media records, API/embed behavior or jobs.

## Storage and concurrency

The independent `service_page_config` row holds validated JSON, a revision and a
timestamp. A conditional revision update prevents stale browser tabs overwriting
newer changes. First-save races return HTTP 409. The audit entry, previous JSON and
new JSON are committed in the same transaction. Audit failure rolls back the write.
The public page reads fresh settings; there is no cross-process settings cache.
Missing table preserves the old default public page but disables admin saving.
Other database or validation failures are not silently replaced by default prices.

## Rollout gates

- Generate Prisma Client and apply `20261104000000_service_page_config` as an
  explicit deployment step before running the new app. Do not mutate schema during
  application startup. The configured workspace database was migrated on 2026-11-04 after backup and restore rehearsal; verify that the deployment uses this same target.
- Build the Docker `web` target (now also the default target). The tracker requires
  `--target p2p-tracker`. The runtime includes the Prisma CLI dependency closure.
- Set `AUTH_URL` to the exact public HTTPS origin. Service-page writes validate
  this configured origin, including behind a reverse proxy; forwarded headers are
  not accepted as an independent source of trust.
- Run `docker run --rm --env-file <protected-release-env> <new-image> migrate`
  after backup verification, then roll out the same image. The env file stays off
  source control and contains the intended database URL. Normal startup does not
  run schema mutations or regenerate Prisma Client.
- This adds one table without changing existing IDs, records or relations. Old app
  versions can run with the new table; retain the table and audit history on rollback.
- Before production migration, verify target/database PostgreSQL major and pending
  migrations, take a database backup and rehearse restoring it to an isolated database
  of that major. `prisma migrate deploy` applies ALL pending migrations: review them.
- Migration sets a 5-second lock timeout and 30-second statement timeout. If it fails,
  diagnose before retrying; do not reset the database or drop existing data.
- Canary: verify public page, manager save/reload, staff denial and revision conflict
  in staging, then monitor errors for 10 minutes after production rollout.
  On production, do not temporarily change advertised prices just to test: use
  read checks or a revision-aware save of unchanged settings. Confirm existing
  media playback and WordPress integration in the deployment environment as well;
  those live integrations were not exercised by the service-page fixture.
- Migration itself does not require a worker drain (independent settings table).
  Web-container replacement still needs graceful draining: stop dispatching new
  publish/site-sync/content-generation cron requests to retiring replicas, let
  active requests finish, and confirm no claimed work is interrupted. Allow a
  bounded 10-minute drain window; if work is still active, stop the rollout rather
  than force-killing it. Resume dispatch after healthy replacement replicas are ready.
  If no work is active, record that evidence instead of assuming zero impact.
- Media/R2 backup is N/A to this change (no media writes). Deployment rollback:
  revert app revision, preserve new settings and audit rows. Restore an older
  setting via a reviewed revision-aware update.

Domain budget, transfer fees, tax and hosting limits remain as agreed with sales;
the editor must not be used to imply retroactive changes to existing contracts.

## Release preparation — 2026-11-04

- Next.js 15.5.29, Auth.js beta.32, Zod 4.6.7 and Vitest 4.1.12; patched image,
  PostCSS, source-map, Nanoid, brace-expansion and Prisma configuration dependencies.
  Compatible minimatch 11 override covers archive generation. Release containers use
  Node 24 LTS; package engines require Node 24. Node 20 is EOL per
  https://nodejs.org/en/about/previous-releases.
- Full workspace suite: 376 tests / 41 files passed; TypeScript passed. Vitest
  constructor mocks and JSX transform were adapted without changing assertions.
- Dependency runtime smoke passed: PNG input resized to JPEG/WebP/AVIF; archive
  glob and ZIP read-back; tracker health and allowed/denied WebSocket origins.
- Runtime audit: 0 critical, 2 high, 0 moderate. Both high entries describe the same
  unpatched upstream ip / bittorrent-tracker dependency. The advisory affects
  ip.isPublic; no application or tracker call uses that function. The only tracker
  ip call is toString in its UDP parser, and scripts/p2p-tracker.mjs disables UDP.
  The web process does not run the tracker. This is a reviewed non-reachable finding,
  not a claim that npm audit is clean. Reassess before enabling UDP, adding IP trust
  checks or changing tracker dependencies. No downgrade or advisory suppression.
- Development audit retains minimatch <11 through ESLint plugins using its old
  callable API. Patterns are repository-controlled. Runtime archive matching uses
  patched minimatch 11. Do not expose a lint service to untrusted pattern input.
- A real custom-format backup of the configured PostgreSQL 17.2 database was saved
  locally under backups/services-release-20261104/database.dump (excluded from Git
  and Docker). SHA256: 7b053f72472708f9929f8a070c3939ee22c30e49887b68bb91b0f2a7bb2f10c8.
- Restored application schema/data into isolated PostgreSQL 17: 36 public tables and
  25 completed migrations. Only CREATE/COMMENT for the provider-only prisma_postgres
  extension were omitted in the rehearsal; the original backup retains both entries.
  This verifies application recovery, not recreation of provider infrastructure.
- Applied the new migration to the restored copy first, then rechecked that the
  configured real database had exactly one pending migration and no failed migration.
  Applied only 20261104000000_service_page_config successfully. Existing tables,
  IDs, ownership, media, subscriptions and jobs are not modified by its SQL.
- App deployment has NOT been executed. The operator will deploy the release.
  Worker draining, actual deployment-target identity, live playback/WP checks and
  the 10-minute canary must be performed at rollout; they cannot be certified before
  replacing the running production app. Keep the new table on code rollback.
- Do not distribute Windows .next/standalone: it can contain local .env files.
  Use the Docker image from a clean release commit; secrets are injected at runtime.
  Docker now runs unit and dependency smoke tests before building the app.

## Operator handoff

The application is not deployed by this task. Deploy the pushed main revision with
the Docker web target and the existing runtime secrets. The configured workspace
database already has the service migration; another database target still needs
its own verified backup and explicit migration. Keep AUTH_URL equal to the public
HTTPS origin. Preserve active jobs through the bounded drain described above.

After deployment, run `node scripts/check-service-release.mjs https://YOUR-HOST`
for public rendering and unauthenticated access checks. Then use a MANAGER/HEAD
session to open `/admin/services`, save unchanged values and reload. Observe errors
for 10 minutes and verify existing playback and WordPress integration. Do not
restore the old database merely to roll back app code; retain the new table/data.

## Final immutable container verification

- Source commit: fca5fc5891f78e9786d726f141f1907ace7114f3, exported from Git
  without unrelated uncommitted WordPress work. Subsequent documentation-only
  handoff commits do not alter this tested application source.
- Image aurum-services-release:verified: sha256:db5bc8ee953a9c75ee54b3484afe6a9148a7ae6d14ea9f63afec357c82db7123.
- Actual Linux runtime Node 24.22.2; all 385 tests in 41 files passed, followed by
  image/ZIP/tracker smoke, production compilation, lint and TypeScript checks.
- The exact image applied all migrations to a fresh isolated PostgreSQL 17 database
  using its normal migrate command. Production HTTP checks passed credentials login,
  role/origin rejection, validation, revision conflicts, persisted settings, public
  and admin rendering, audit creation, and restoration of fixture defaults.
- The read-only post-deploy check also passed against this container.
- Image inspection: no /app/.env* files; ip, bittorrent-tracker and Vitest absent;
  sharp 0.35.5, Prisma 6.19.3 and a working relative Prisma executable symlink.
- Build retains a jose Edge compression warning; actual credentials/JWT paths passed.
  Optional compression paths were not exercised. Missing DATABASE_URL diagnostics
  during dynamic-page build probes are expected because build receives no secrets;
  runtime database access was verified separately above.
