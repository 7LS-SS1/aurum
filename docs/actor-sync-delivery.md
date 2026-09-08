# Actor Push delivery

## Changed files

- `prisma/schema.prisma`, migrations `20260907000000_actor_sync` and `20260908120000_actor_sync_term_id`: source/destination identity mapping, unique constraints and the optional WordPress taxonomy term ID.
- `src/lib/actor-sync-contract.ts`, `actor-sync.ts`, `wordpress-client.ts`: canonical payload, destination preflight, idempotent GET/PUT, mapping, locks, audit, sanitized errors.
- `src/lib/permissions.ts`, `src/app/api/actors/sync/route.ts`: MANAGER/HEAD server authorization, validation and rate limits.
- `src/app/admin/actors/page.tsx`, `src/components/admin/ActorsManager.tsx`, `ActorPushPanel.tsx`: selection, confirmation, progress, per-item outcomes, retry failed only, stop remaining queue.
- Corresponding contract/service/permission/route/page tests; `scripts/actor-push-ui-harness.mjs` is an isolated browser fixture.
- `wordpress-plugin/aurum-video-core/aurum-video-core.php`, `includes/actor-sync.php`, `tests/actor-sync-integration.php`: optional WordPress bridge 1.1.0 (Author: 7LS preserved).
- `ARCHITECTURE.md` and this document.

## Flow

The admin selects actors and a destination, or chooses all actors. "เพิ่มเฉพาะนักแสดงใหม่" is append-only: an existing destination actor is reported as `existing` and receives no PUT, so destination edits are preserved. The regular selected/all modes use PUT so they can update actor data and backfill the AURUM taxonomy term. A read-only preflight checks the mapping table, active destination, authentication and actor endpoint. Batches of 10 or more require confirmation. The UI sends sequential requests and displays each outcome independently; retry sends only failures. Stop waits for the active request and cancels remaining items.

The server validates permissions on every request. Actor.id is the identity, with deterministic slug `aurum-actor-{id}`. A durable audit intent is saved before remote writes. A PostgreSQL advisory lock serializes destination synchronization. GET resolves identity first. In append-only mode an existing record stops there; in regular mode the idempotent PUT always runs because that handler also creates or backfills the `aurum_video_actor` term. Transient failures have bounded retries/timeouts. The remote post ID, taxonomy term ID and payload hash are persisted and the audit result recorded. The WordPress bridge also locks the actor identity, rejects ambiguous matches and never matches by name alone.

Images remain external URLs. Changing the URL replaces the displayed image; null removes it. No Media Library upload or duplicated attachment occurs. Replacing image bytes at the same URL requires a versioned URL to be detected. The bridge keeps the existing `aurum_actor` profile CPT and separately owns `aurum_video_actor`, attached to WordPress core posts. It never adopts the unrelated third-party `video_actor` taxonomy. The 123av theme reads `aurum_video_actor` as a fallback while retaining compatibility with its legacy taxonomy.

## Validation on 2026-09-09

- Full Vitest suite: 21 files, 237 tests passed.
- Full ESLint, TypeScript no-emit, Prisma Client generation and Next.js production build completed successfully.
- `git diff --check` passed.
- Configured database reports all 18 migrations applied, including `actor_syncs.term_id`.
- The current redesigned admin UI has not yet been browser/visual-tested against a signed-in production-like Next.js runtime; component/page tests and the production build do not replace that check.
- PHP lint passed for the updated AURUM plugin and all seven changed 123av PHP files in `wp_app`.
- Local WordPress integration passed create, repeat/idempotency, post and term ID stability, taxonomy metadata/image URL, rename, image replacement/removal, validation, permission and fixture cleanup.
- Production WordPress/Tunnel delivery and browser verification on production remain unverified.

## Install and verify

1. Deploy the AURUM code and apply the actor migration if the destination environment lacks it. Restart the application after deployment. Existing secrets remain server-side.
2. Install `dist/aurum-video-core-1.1.0.zip` on the WordPress destination, or provide equivalent authenticated GET/PUT routes at `/wp-json/aurum-video-core/v1/actors/{external_id}` through its theme. Do not activate two implementations of the same endpoint.
3. Configure the WordPress base URL and Application Password for an authorized administrator. Open `/admin/actors` as MANAGER/HEAD, select one actor and Push; repeat to verify skipped status, then change/remove its image URL and retry.
4. For a local disposable fixture, run `tests/actor-sync-integration.php` with `WP_LOAD_PATH` and `AURUM_ACTOR_TEST_ALLOW_WRITE=1`. It deletes its randomly identified post and taxonomy term in `finally`.

Archive: one `aurum-video-core/` root, required entrypoint and actor module present. This is a local package, not a production deployment. The UI queue requires the page to stay open; it is not a durable background job.

Package size: 131967 bytes. SHA-256: `2D1E5EED0909ED8B3E837FB5978059C99FED230729DB0C9D0CE56EFEA77E12CA`.
