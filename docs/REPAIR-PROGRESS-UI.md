# Distribution repair progress UI

Branch: `codex/repair-progress-ui`, based on the isolated toast/retry hotfix.

- Select/search eligible sites, then follow per-site progress, result counts, elapsed time and estimated remaining time.
- Reads the existing job/log endpoint every three seconds after each completed poll, with at most three concurrent reads and a 15-second per-read timeout.
- Incremental log cursors, deduplication and a 200-entry display cap keep long jobs manageable. Failed reads preserve the last known status and retry automatically.
- Estimates need at least two processed items; stale worker heartbeats or read failures suppress estimates. Progress counts processed items, including failures.
- Refresh restores active jobs. Completed history in this screen is retained only while the page stays open.

## Release boundaries

UI only; existing repair, cancellation, worker and authorization contracts remain unchanged. No schema/migration, database reset, storage change or payment code is included. Database backup/restore changes are not applicable to this UI change. A deployment can still interrupt work if its worker runs inside the replaced application container: deploy after in-flight jobs finish or use the existing worker-draining procedure.

Canary: load the page, verify an existing active job updates, then repair one eligible test item and verify its remote post before a wider run. Roll back by deploying the preceding hotfix commit `9378d5bb2e724e4a60cbe62223b6640910decca8`; no database rollback is required.

Validation: targeted repair service/API tests (16), TypeScript, ESLint, local browser fixture with simulated job progress and network failure, and mobile overflow inspection. The fixture never contacts production or publishes posts. Production deployment and a real repair remain unverified.
