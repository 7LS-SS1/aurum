# Toast and distribution retry hotfix

Base: b673e12. Only toast UI, distribution retry and WordPress error diagnostics change.

- Latest toast is in front, with two background cards and a remaining count. Each front card gets 10 seconds; hover or keyboard focus pauses its countdown. Dismissal does not cancel the sync job.
- Retry failed destinations sequentially, preserving the requested video-only/editorial mode. Initial fan-out remains three; this does not impose an account-wide queue across requests or replicas.
- Include HTTP method/path in WordPress errors and recognize destination database connection failures. Do not include raw HTML or query strings.

No payment/member release, schema/migration, dependency, credential, bucket, object, post ID or embed contract changes are included. The Hostinger database connection problem still needs an origin-side fix.

## Release gates

1. Verify the release diff against b673e12 and the target revision. Do not merge the unrelated original working directory.
2. Before replacing containers, stop accepting new publish/backfill jobs and let active requests/uploads finish. Preserve queued job records and resume existing schedulers once; do not run duplicate workers.
3. Confirm current backup/restore evidence and persistent storage mounts. No database migration/reset/seed or media migration is required for this hotfix.
4. Canary the new image: health/login, stacked toast pause/resume/close, one failed destination reconciled by existing identity. Check prior successful posts and playback still work. Do not run test publication against all sites.
5. Roll back to the previous image/config if necessary, preserving current database and media, including writes received since deployment. Never restore the entire database to roll back this UI/code patch.

This branch is prepared separately from production. Local checks do not establish live publishing success or Hostinger recovery.
