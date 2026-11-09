# Service worker deployment — 2026-11-09

## Prepared, not activated

Coolify application `dehl5p0oryk334p1fg35s2ug` has scheduled task **AURUM service worker**, every five minutes (`*/5 * * * *`), timeout 300 seconds, default application container:

```sh
if [ "${SERVICE_WORKER_ENABLED:-false}" = "true" ]; then node /app/scripts/service-worker.mjs; else echo "SERVICE_WORKER_DISABLED pending release"; fi
```

Production executions at 15:40 and 15:45 UTC succeeded with the disabled guard; this is not a production worker heartbeat. The current application was not restarted, migrated or redeployed.

Secret was generated on the server without displaying its value. Host directory `/data/coolify/applications/dehl5p0oryk334p1fg35s2ug/worker-secrets` is root:1001, mode 0750; its `service-worker-secret` file is root:1001, mode 0440. Coolify directory mount targets `/run/secrets/aurum`; runtime-only `SERVICE_WORKER_SECRET_FILE=/run/secrets/aurum/service-worker-secret` is configured. Mount/config take effect on the next deployment. Keep preview mount suffix isolation and leave the worker disabled in previews.

An isolated temporary container with UID 1001, no network and a read-only mount verified secret readability without displaying it. Back up this directory in the restricted server configuration backup before cutover; never commit the secret or store it in a public bucket.

## Validation completed

- Secret-file and route-auth tests: 5 passed; TypeScript and changed-file ESLint passed.
- Actual scheduler script called the actual route through a local HTTP harness against isolated `aurum_review_20261109`: missing auth rejected, authenticated execution succeeded, database heartbeat finished as SUCCEEDED, overlapping run rejected. External providers were disabled and network calls blocked. This was not a full Next.js or production integration test.
- Release and attachment preflight fixtures passed. New email uncertain-delivery results are reported as DEGRADED and cause a nonzero scheduler exit.
- Evidence: `artifacts/worker-setup-live.log`, `artifacts/worker-setup-tests.log`, `artifacts/worker-scheduler-guard.png`, `artifacts/worker-secret-server-probe.png`.

## Activation gate

1. Keep the scheduler guard disabled. Finish remaining origin/email configuration and release commit. Build the actual deployment artifact; verify `/app/scripts/service-worker.mjs` exists. Current Coolify uses Railpack, so a successful local Docker build alone does not prove its artifact layout.
2. Refresh project/database/config backups, drain writes and in-flight workers, then apply the reviewed migrations as a release job. This patch adds no migration, but the combined release has pending migrations.
3. Deploy the candidate with the secret mount and run `npm run release:preflight`. Confirm the application user can read the file without printing it, and the internal endpoint is unauthorized without its bearer token.
4. Run `node /app/scripts/service-worker.mjs` once inside the candidate container, after schema readiness. Verify ServiceWorkerRun result, provider settings, failed/uncertain mail and payment results. This command performs real configured work; do not use it before cutover readiness.
5. Set runtime `SERVICE_WORKER_ENABLED=true`, apply the runtime configuration using the hosting deployment workflow, and verify at least two completed database heartbeats five minutes apart. A Coolify Success entry alone is insufficient: it may be the disabled guard.
6. Check existing API/embed/playback and order/attachment flows during canary before completing traffic cutover. Stripe remains sandbox-only and disabled on production; this setup does not authorize live payments.

## Rollback

Disable the Coolify scheduled task immediately and wait for any active run to finish before rollback. Keep the environment guard false for the old image. Roll back to an image compatible with the migrated schema; retain new orders, attachments and heartbeat records. Do not restore an old database over post-backup transactions without reconciliation. Media worker changes are outside this patch; preserve existing media jobs during the combined deployment.
