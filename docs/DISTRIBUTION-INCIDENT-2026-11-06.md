# WordPress distribution HTTP 500 — 6 November 2026

## Confirmed evidence

Around 21:31–21:33 Asia/Bangkok, authenticated GET-only probes using existing registered credentials returned intermittent HTTP 500 bodies containing `Error establishing a database connection`.

- Seen on heesuay.com, xn--12cl6bzdtapz.com, xn--l3cac7lpb.com, brigadeneopolis.live; a second pass with a unique query and Cache-Control: no-cache also saw this on yeddude.com and zaixt.net.
- The same sites also returned 200 on other requests. doomhee.com returned 200 for all three probes in both passes; its earlier stored failure remains unexplained by these probes.
- Requests included users/me, AURUM diagnostics and a one-row authenticated post collection read. No publication or remote mutations were performed.
- Public REST roots returned 200 on four tested hosts. A successful public page does not establish authenticated publishing readiness.
- Stored latest-movie failures had four attempts. Older failed distributions had up to 124 attempts. One latest failure already had remotePostId 5640: do not recreate it or delete its mapping.
- Headers identify Hostinger/LiteSpeed. Shared account, exact MySQL limits, origin PHP logs and resource saturation have NOT been verified.

The evidence identifies a destination database connection failure during the probes, not its exact underlying cause or the exact original failing publish request. Redis/R2 changes are not a demonstrated remedy. No claim that all sites now publish successfully.

## Immediate operations

1. Avoid repeatedly starting new publish/backfill batches while the destinations fail reads. Preserve jobs and queued items; pause new scheduling through normal controls, let active work finish, do not delete jobs.
2. Inspect Hostinger PHP/MySQL logs and account resource graphs for the incident window. Check connection-rate limits, max_user_connections, Too many connections, Operation not permitted, database service availability and PHP workers. Ask support to correlate requests from the actual AURUM server IP; probe-client IP and production-server IP need not match.
3. Confirm authenticated reads are stable, then canary ONE failed destination using its existing movie/distribution identity. Reconcile any existing remote post before writes. Retain all successful destinations and original media.
4. Retry only failed destinations, initially one publishing job at a time. Increase measured concurrency only after errors stop. Completion requires verified post ID, meta, taxonomy and playable media on every intended target.
5. For speed after stabilization, implement an authenticated exact movie-ID lookup in the WordPress plugin with compatibility fallback. Current recovery scans all posts before create; do not bypass that scan until the replacement proves identity/duplicate safety.

## Local patch and release gates

- WordPress errors now identify HTTP method/route and recognize the database failure without exposing HTML or query strings.
- Automatic retry pass uses one site at a time and preserves the caller's write mode. Previously it escalated video_only to overwrite_editorial.
- First-pass concurrency remains three. This is not a distributed/account-wide rate limiter; simultaneous jobs/replicas can still exceed it.
- No schema migration or media changes; database backup/restore is not executed by this patch. Existing backups and persistent mounts must be verified before deployment. Do not restore production to resolve HTTP 500.
- Deploy only the reviewed patch/revision, drain active requests, preserve env and storage. Canary first, roll back to prior image if needed without rolling back database rows or media. Local uncommitted work must not be bundled inadvertently.
- Production deployment, PHP/MySQL server correction and successful end-to-end publish remain pending.

Read-only diagnostic command (credentials stay in environment, do not share its raw output externally):

```powershell
node --env-file=.env --import tsx scripts/diagnose-distribution-readonly.ts
```

Reference: https://www.hostinger.com/support/how-to-fix-mysql-operation-not-permitted-error/
