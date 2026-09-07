# Actor synchronization implementation report

Status: MANAGER and HEAD were explicitly approved by the user on 2026-09-07. The shared actor:push policy is implemented in the API and admin page, and the Push panel is wired. ACTOR_SYNC_ENABLED=false can optionally disable the feature; no enable flag is required. Runtime synchronization still requires the source migration and updated destination plugin.

## Changed files
- ARCHITECTURE.md — architecture, identity, image policy, authorization gate.
- prisma/schema.prisma — ActorSync relation and mapping.
- prisma/migrations/20260907000000_actor_sync/migration.sql — composite identity and unique remote mapping.
- src/lib/actor-sync-contract.ts — validated payload and deterministic fingerprint.
- src/lib/actor-sync.ts — synchronization, per-site transaction lock, durable audit, remote mapping.
- src/lib/wordpress-client.ts — read/compare/idempotent PUT with bounded retries and response verification.
- src/app/api/actors/sync/route.ts — shared permission check, optional kill switch, validation, per-item rate limiting and results.
- src/lib/permissions.ts — actor:push permits MANAGER and HEAD only.
- src/lib/permissions.test.ts — all five role outcomes.
- src/app/admin/actors/page.tsx — authorized panel and safe destination fields.
- src/app/admin/actors/page.test.tsx — rendered page tests for authorized/unauthorized roles and kill switch.
- src/components/admin/ActorPushPanel.tsx — selection, destination, large-batch confirmation, loading/results/summary.
- src/components/admin/ActorsManager.tsx — panel shown according to the server-provided permission.
- wordpress-plugin/aurum-video-core/aurum-video-core.php — loads actor module.
- wordpress-plugin/aurum-video-core/includes/actor-sync.php — WordPress actor directory, REST permissions, named lock, verified upsert and external image rendering.
- src/lib/actor-sync-contract.test.ts — destination client and comparison tests.
- src/lib/actor-sync.test.ts — orchestration, audit failures, locking and stale snapshot tests.
- src/app/api/actors/sync/route.test.ts — authorization, validation, rate limiting, disabled state and independent results.
- wordpress-plugin/aurum-video-core/tests/actor-sync-integration.php — real local WordPress REST integration with scoped cleanup.
- docs/actor-sync-implementation.md — this report.

Unrelated existing dist ZIPs and lighthouse artifacts were left untouched.

## Deduplication and images
1. Validate Actor.id and generate stable aurum-actor-{id} slug; never use name for matching.
2. Persist audit intent, then claim a PostgreSQL transaction advisory lock for the destination.
3. Read destination actor by external ID. Compare name, slug, bio, image URL and all six metadata fields.
4. Skip PUT entirely when unchanged. Otherwise PUT to the same identity; WordPress compares again under a MySQL named lock.
5. Store verified remote ID/hash in actor_syncs with unique constraints. Record final audit outcome.
6. Replace image URL when changed; clear it on null. No Media Library files are created, including on retries.
7. Handle each batch item independently. UI sends one actor per request, sequentially, with confirmation at 10 selected actors.

The WordPress endpoint requires manage_options and checks edit_post for existing records. The source allows only the user-approved MANAGER and HEAD roles. Before any remote I/O, it checks the mapping table exists and reports missing migration without writing to WordPress.

## Verification
- Targeted Vitest after authorization: 66 tests passed (6 files), including rendered admin pages and all five source roles.
- Final TypeScript noEmit, targeted ESLint and git diff --check passed after the default-off gate and tests were added.
- Prisma validate passed.
- PHP lint and existing plugin smoke passed.
- Local WordPress REST integration passed create/repeat/rename/image replace/image removal/no attachments/invalid image/anonymous denial/trash protection. The final rerun also passed plain-text bio protection.
- No production API calls or remote deployment performed.
- No main database migration executed. PostgreSQL locks/mapping persistence have unit coverage, not a live PostgreSQL integration run.
- Admin HTML rendering is verified for MANAGER/HEAD, STAFF/SENIOR and the kill switch. Interactive browser verification remains unavailable: localhost:3000 returned ERR_CONNECTION_REFUSED.

## Remaining activation work
1. Install updated bundled plugin on intended destinations, then apply migration and generate Prisma client.
2. Start the app and verify the interactive admin browser flow. Remove ACTOR_SYNC_ENABLED=false if the optional kill switch was configured.
3. If a destination already uses a different actor taxonomy or plugin, agree on an explicit mapping/migration; this implementation only owns aurum_actor records.

Images require accessible, durable URLs. A binary change at an identical URL is not detected; use versioned URLs. The browser-driven queue stops when the page closes; completed operations can be safely retried. A crash between WordPress post creation and metadata persistence fails closed for explicit reconciliation rather than creating another actor.
