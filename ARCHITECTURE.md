# Actor synchronization

Scope: independently synchronize the actor directory to destinations running the bundled aurum-video-core plugin. Existing third-party actor taxonomies are not automatically adopted by name.

## Identity and payload
Actor.id (CUID) is the stable external identity. The deterministic slug is aurum-actor-{id}; names can change or collide. A dedicated WordPress aurum_actor post stores name, bio, structured measurements and profile image URL. A unique (actorId, siteId) source mapping stores the remote ID and last successful hash. Missing or conflicting identity fails closed.

Images follow the existing external-media URL architecture. Replace the stored URL and rendered image, clear it on null, and never upload duplicate Media Library files. Same-URL binary replacement must use a versioned URL; content hashes are not downloaded. Existing arbitrary WordPress actor records require explicit migration/mapping before adoption.

## API and consistency
POST /api/actors/sync accepts one siteId and 1–5 distinct actorIds; MANAGER or HEAD only. Frontend sends selected actors sequentially, one per request, with confirmation for 10+ records and per-item results. Server applies per-user and per-site rate limits. Every item has a durable start audit before remote I/O and a final audit afterwards.

A PostgreSQL transaction advisory lock serializes synchronization per destination on the source. WordPress uses a connection-scoped MySQL named lock per external identity for atomic compare/upsert. Deterministic slug lookup recovers a create whose response was lost; unowned slug conflicts stop rather than silently duplicate. GET returns a fingerprint of actual managed data; identical data results in no PUT. PUT compares again under lock. Only idempotent actor endpoints retry transient failures, with bounded timeout/backoff. No credentials enter client props, responses or audit metadata.

The source uses parameterized SQL for its mapping and transaction locks; the Prisma schema and SQL migration describe the same composite key. No migration is run against production as part of editing.

## Verification and delivery
Unit tests cover new/unchanged/changed-image/removed-image/repeated requests, invalid remote responses and errors, plus route permission failures. PHP integration tests exercise destination creation, repeat, rename, image change/removal, and rejection without permission. Run lint/typecheck and targeted tests, then install the updated plugin and apply the migration before runtime verification. The browser queue pauses if closed; completed items remain durable and can safely be retried.

## Authorization and rollout

The user approved MANAGER and HEAD on 2026-09-07. The shared actor:push policy now controls both the server API and the actors page. STAFF, SENIOR and SYSTEM cannot push. The page selects only id/name from active destinations and renders ActorPushPanel for authorized users.

The feature is enabled in code. ACTOR_SYNC_ENABLED=false is an optional server-side kill switch which hides the panel and returns 503 from the API; no enable flag is otherwise required. Before remote I/O, the source checks that actor_syncs exists and reports a migration-required error if missing. Install the bundled destination plugin and apply the migration before actual synchronization. A live deployment was not performed as part of the authorization change.
