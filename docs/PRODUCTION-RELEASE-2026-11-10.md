# AURUM production release — 10 November 2026

Deployed application commit: `69346fab19a9ca7c35fe5b519fc45ba636db5a9f` on branch `codex/release-20261109-services`. Coolify deployment `gocujfgaicbqpoicgai9kqss` completed successfully at 2026-11-09 16:56:55 UTC. Runtime `SOURCE_COMMIT` matches. The health endpoint currently reports `gitSha: unknown` because the Docker default takes precedence; release identity was verified through runtime SOURCE_COMMIT and Coolify, not inferred from that endpoint.

## Data and rollback evidence

- Preserved all five commits from the previously deployed `codex/monitor-panel` branch, including monitor and site-sync repair features.
- Before migration: no active sync/content leases and no recently updated processing distributions. Existing queued/stale jobs were preserved, not cancelled or retried.
- Briefly stopped the old web container to freeze new writes, took a fresh custom-format PostgreSQL dump, validated its restore table of contents, and captured legacy column checksums.
- Fresh backup: `E:/aurum-backups/cutover-2026-11-09T16-44-32-487Z/database.dump`.
- SHA-256: `0e4a030fe819ea7784169cff81dfd8e4c16b5906e084f511a0ca6a0a41ae035c`.
- All 11 pending migrations applied successfully from the candidate image, exit 0. Original columns, row counts and content checksums of all 36 application tables were identical immediately afterward. The migrations metadata table was intentionally excluded from this comparison.
- Restarted the old app after verification; public HTTPS returned 200 while the replacement built. Coolify subsequently completed a rolling replacement.
- Source history bundle: `E:/aurum-backups/20261109-release-231156/release-69346fa.bundle` (verified complete history). Earlier full project/image/config backups remain available.
- Server configuration snapshots: `/root/aurum-backups/20261109-release-2315/`, including root-only before/after Docker inspect files. Earlier full image/filesystem/config backup: `/root/aurum-backups/20261109T135733Z`.
- Prior application-data restore rehearsal succeeded; provider-specific `prisma_postgres` extension restoration was not tested. No separate Bunny media-byte backup was requested. Existing R2/Bunny media was not modified.

Rollback: disable the service scheduler and let active work finish; restore the saved old application build configuration/runtime settings and compatible image (`1b4ede142eace4511cbc57979ae6ff9985064117`). Preserve the additive schema and new records. Do not overwrite post-backup transactions with an old dump without reconciliation.

## Verified release behavior

- Production Docker build: 550 tests passed, 1 Redis integration test skipped; dependency runtime smoke passed. Build/lint completed with existing non-fatal warnings.
- Fixed non-root runtime file ownership and explicitly installed development dependencies in the build stage despite hosting NODE_ENV. Coolify now uses Dockerfile target `web` and Docker BuildKit secrets.
- Fixed management routing for Auth.js origin rewriting and standalone Next.js internal hosts/ports. Routing uses only configured origins; arbitrary forwarded hosts cannot choose a redirect destination.
- Local standalone HTTP and Linux canary passed management root protection, fixed public/admin redirect, wrong-host POST rejection and login-page rendering.
- Public HTTPS `/`, `/services`, `/services/select` and health endpoint respond successfully. The live service selector was inspected in a browser.
- `https://system-management.aurum123.com/` redirects to its login page; login returns 200 over verified TLS. `/admin` on the public origin redirects to the management origin. Management responses include `X-Robots-Tag: noindex, nofollow`.
- Unauthenticated worker POST returns 401; public-origin admin login POST returns 409. A valid staff login on the new production host has not been exercised with a user's credentials.
- Actual production runtime preflight passed. R2 attachment bucket `aurum-attachments` passed write/read/delete of a unique release probe; the probe was removed. This provider probe is not a substitute for a signed-in customer upload test. Earlier full adapter HTTP testing used an isolated database.
- Both persistent bind mounts are present in the deployed container; restart count was 0 during verification. Checked database/auth/encryption/R2/Bunny secret variable names are absent from the resulting image's Config.Env. This does not audit historical images or every layer of earlier builds.
- Legacy watch-page sample returns 200 and contains player markup. Full video playback on every destination website was not retested during this deployment.
- Service worker manual run succeeded at 16:57:59 UTC. Two automatic five-minute scheduler runs succeeded at 17:00:09 and 17:05:07 UTC (00:00 and 00:05 Bangkok on 10 November). Both database records have SUCCEEDED and finishedAt; Coolify execution logs agree. Payments and email providers remain disabled, so these prove scheduling and application work, not provider delivery or settlement.

## Remaining external setup

- Sender saved as `noreply@aurum123.com`. Email delivery remains disabled: the available Cloudflare browser session is not authenticated, and Email Sending domain verification/API permissions still need completion followed by a delivery test to the user's nominated Gmail address.
- Stripe remains disabled on production. This code supports isolated sandbox payments only; this release is not approval or implementation of live payments. Business eligibility confirmation and a separately verified live-payment integration remain required.
- No test purchase, paid transaction, customer message or production password change was performed.
