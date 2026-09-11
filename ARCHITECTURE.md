# Actor Push completion

The approved scope is actor synchronization on top of commit 3f593ad. MANAGER and HEAD may push; other roles may not. Preserve the existing video workflow and the user's plugin Author change (7LS).

Use the actor external CUID as identity, a per-site remote-ID mapping, server-side credentials, transaction locks and a destination lock. Compare the actual remote payload before writing. Replace or clear the external image URL without creating duplicate attachments. All six measurement/age fields, name, bio, identity and slug participate in comparison.

The destination contract is GET/PUT /wp-json/aurum-video-core/v1/actors/{externalId}. A compatible theme bridge can implement it without a plugin. The bundled optional plugin v1.1.0 provides an independent aurum_actor directory. It does not silently adopt unrelated legacy actor taxonomies by name; those require an explicit adapter/mapping in the WordPress project.

Before a batch, check destination capability and the local mapping schema. Process actors sequentially with per-item status and durable audit intent/outcome. Preserve finished results, support retrying failed actors and stopping queued actors, and block list navigation during a running batch. Request confirmation for 10 or more actors.

Validation: role tests, independent failures, repeated pushes, image changes/removal, malformed destination replies, audit storage failures, concurrent locks and missing migration. Verify actual WordPress HTTP behavior and rendered UI with test fixtures where runtime tools permit. Never blindly retry real video publication as part of this task.

## Actor taxonomy and append-only mode

The `aurum_actor` CPT remains the profile record. AURUM additionally owns the non-rewriting, REST-enabled `aurum_video_actor` taxonomy on WordPress core `post`; video distribution attaches the returned term IDs. This taxonomy must remain independent of the third-party `video_actor` taxonomy. The 123av theme may read both for backward compatibility.

Regular selected/all synchronization calls the idempotent PUT even when the profile payload matches, because PUT is responsible for creating or backfilling the taxonomy term. The separate `create_only` mode is intentionally append-only: if GET finds the external actor identity, no PUT occurs and neither destination content nor local mapping hashes are updated.

## WordPress-owned editorial fields and idempotent video refresh (proposed, approval required)

### Status and scope

This section records a read-only audit performed on 2026-09-10. It is a proposal only. No application code, WordPress data, production configuration, migration, deployment, or retry was changed during the audit.

The desired ownership boundary is:

- AURUM owns stable identity and playback metadata.
- WordPress owns `title`, `slug`, `content`, `excerpt`, categories, tags, featured image, publication status, and Rank Math fields after the first import.
- A repeat send uses video-only refresh by default. An editorial overwrite is a separate, explicit user choice and must be carried through the API, audit log, and worker job; it must never be inferred from a retry.

### Findings from the current code

1. `src/lib/distributor.ts` always builds a create-style payload containing `title`, generated `content`, `excerpt`, `status`, optional `slug`, category IDs, tag IDs, actor terms, featured media, and all AURUM video meta. `distributeToSite()` then always calls `WordPressClient.createPost()` even when the `(movieId, siteId)` Distribution already has a `remotePostId`. A manual retry of a failed/uncertain create can therefore create another post.
2. The database already has the correct primary local identity anchor: one `Distribution` per `(movieId, siteId)` via `@@unique([movieId, siteId])`, with `remotePostId`. `MovieSiteDraft` has the same pair uniqueness and stores destination-specific editorial input, but it currently has no explicit overwrite intent.
3. `WordPressClient.createPost()` is a raw POST to `/wp-json/wp/v2/{postType}`. GET calls have bounded retry, while general post creation is deliberately not retried. `verifyVideoMeta()` correctly reads the created post back with authenticated `context=edit` and fails closed when registered video meta did not persist.
4. The current success verification covers the canonical and compatibility video meta keys, but not preservation of remote editorial/SEO fields. The current client does not expose a post update operation whose payload can be constrained to video metadata only.
5. The site-sync matcher prioritizes `aurum_movie_id`, then JW Player media ID/video URL, and finally slug/title. The repair planner prioritizes local `remotePostId`, but it filters out posts without the legacy `aurum-video` content block and can then fall back to video URL, slug, or title. This prevents repair after an editor removes the block and permits identity guesses that are no longer acceptable.
6. Site-sync skips a local `SUCCESS` Distribution with a `remotePostId`, while the direct distribute/retry path rebuilds and resends the full create payload. Retry and refresh semantics are therefore inconsistent.
7. No AURUM path currently writes Rank Math meta directly. That is useful for preservation, but it is not sufficient while repeat sends overwrite core editorial fields from which Rank Math or plugin-generated descriptions may be derived.
8. The bundled plugin source in this repository reports AURUM Video Core `1.1.0`. The filesystem copy at `D:\developer\wp-docker\wp-content\plugins\aurum-video-core` reports `1.2.2`, differs from the bundled source, and contains `includes/editor-persistence.php`. That file snapshots legacy marked-block media before editor content replacement and backfills playback meta only when no stored playback source exists. Filesystem presence/header does not prove that 1.2.2 is active in the actual destination runtime.

### Required contract

#### Identity

- The authoritative local key is `(movieId, siteId)`.
- The authoritative remote keys are the Distribution's `remotePostId` and the post's exact `aurum_movie_id` meta.
- Title, slug, video URL, and fuzzy/exact text matching are not valid identity for refresh or repair.
- A remote ID is usable only after an authenticated read confirms that `meta.aurum_movie_id === movie.id`. A mismatch is an identity conflict and must fail closed without writing.
- If `remotePostId` is absent or returns 404, AURUM may reconcile only by an exact, unique `aurum_movie_id` result. Zero or multiple results stop the operation; they do not authorize a new post automatically when a previous create may have succeeded.

#### Write modes

Introduce an explicit mode carried end-to-end, with a restrictive default:

- `video_only` (default): update only the AURUM-owned identity/playback meta keys. Do not send `title`, `slug`, `content`, `excerpt`, `status`, categories, tags, Rank Math fields, featured media, or editorial taxonomies. Actor relationship refresh should be a separately named option or be omitted by default so it cannot silently replace an editor's taxonomy choices.
- `overwrite_editorial` (explicit): send the selected AURUM editorial fields in addition to video metadata. The UI must show a warning and require a deliberate selection/confirmation. The API must reject a missing/unknown mode rather than interpreting retry as overwrite. Rank Math description may only be overwritten when that specific SEO field is explicitly selected and the active plugin contract confirms the REST key and authorization.

Retry is not a write mode. A retry repeats the original operation with the original persisted mode and identity; it cannot broaden `video_only` into `overwrite_editorial`.

#### First import

1. Run an AURUM Video Core capability/version check before creating.
2. Reconcile by local Distribution and exact `aurum_movie_id` before POST.
3. For a genuinely new movie/site pair, create one post with initial editorial fields plus video metadata stored independently in registered post meta.
4. Treat the fallback `<!-- aurum-video -->` content block as legacy compatibility, not the canonical playback store. With a verified compatible AURUM Video Core runtime, new content should remain editorial and playback should render from metadata.
5. Read the created post back using authenticated `context=edit`; verify every AURUM video meta field and exact `aurum_movie_id` before marking the Distribution `SUCCESS`.
6. Persist `remotePostId` immediately when a POST response supplies it, even if later verification fails, so retry reconciles that post rather than creating another.

#### Repeat refresh

1. Load the unique `(movieId, siteId)` Distribution.
2. Fetch its `remotePostId` and verify the remote `aurum_movie_id`.
3. Snapshot protected remote fields for verification: title, slug, raw content, raw excerpt, status, category IDs, tag IDs, featured media ID, and the supported Rank Math fields.
4. Send a partial update containing only the fields permitted by the selected mode.
5. Read back the post and verify both the expected video metadata and, in `video_only`, byte/semantic equality of every protected field.
6. Mark success only after read-back. A preservation mismatch is a failed integration, not a warning.

### WordPress plugin boundary

AURUM Video Core is the sole owner/registrar of AURUM video metadata. The application and theme may consume those keys but must not introduce a second registrar with competing sanitization or authorization rules.

Before implementation compatibility is claimed, query the destination's authenticated diagnostics/runtime and record:

- active AURUM Video Core version (minimum expected for this work: 1.2.2 or a reviewed successor);
- supported post types and all registered video meta keys;
- `show_in_rest`, type, single-value behavior, sanitize callbacks, and authorization callbacks;
- player behavior when the legacy content block is absent;
- exact Rank Math REST exposure if explicit SEO overwrite is offered.

The repo's bundled 1.1.0 plugin must not be packaged or deployed over the newer 1.2.2 installation. First choose and document a canonical plugin source, then port/reconcile 1.2.2 into the repository without losing actor-taxonomy work.

For robust exact lookup and creation recovery, the preferred plugin addition is an authenticated idempotent video endpoint keyed by AURUM movie ID, conceptually `GET/PUT /wp-json/aurum-video-core/v1/videos/{aurum_movie_id}`. It should return a conflict for duplicate identities, update only allow-listed metadata in video-only mode, and return the post plus persisted metadata for verification. If this endpoint is not approved, the fallback is a complete authenticated scan by exact `aurum_movie_id`; it is slower and must still fail on ambiguity.

### Repair tool redesign

- Scan eligible destination posts regardless of whether content contains an `aurum-video` block.
- Build candidates only from the selected site's Distribution history (`siteId`, `movieId`, `remotePostId`) and exact remote `aurum_movie_id`.
- Remove video URL, slug, and title from executable repair strategies. They may appear in a read-only diagnostic report but can never authorize a write.
- Repair only missing/mismatched AURUM-owned metadata. Do not restore a WordPress revision, replace full content, reinsert a legacy block, or change editorial/SEO/taxonomy fields.
- Preview the plan, show identity evidence and changed metadata keys, then require explicit confirmation before execution.
- Read every repaired post back and verify metadata plus protected-field preservation.

### Proposed application changes after approval

- `src/lib/distributor.ts`: split first-create and existing-refresh payload builders; use `video_only` as the default; stop appending a player block on compatible new imports; preserve the remote ID as soon as creation returns; perform protected-field read-back verification.
- `src/lib/wordpress-client.ts`: add capability/version inspection, exact identity lookup, constrained post update/idempotent plugin calls, richer editable-post fields (raw excerpt, terms, featured media and allowed SEO meta), and conflict-specific errors. Keep retries limited to reads and demonstrably idempotent operations.
- `src/lib/wordpress-video-repair.ts`: remove the content-block filter and executable URL/slug/title matching; accept site-scoped Distribution evidence; plan metadata-only repairs.
- `src/lib/site-sync/match.ts` and `job-runner.ts`: separate read-only legacy discovery from write authorization; queue refreshes using strong identity only; persist and reuse the requested mode; never silently backfill identity after a weak match.
- `src/lib/validation.ts` and distribute/sync API routes: validate an explicit mode and any selected overwrite fields; default omitted mode to `video_only` only for backward-compatible trusted callers.
- Admin UI: label the safe default as video-data refresh and place editorial overwrite behind an explicit warning/confirmation. Display the destination post ID and preservation result.
- Prisma: add the minimum audit fields needed to persist requested/effective mode and verification outcome. Prefer extending Distribution/audit records over creating a second source of identity truth.
- AURUM Video Core canonical source: reconcile 1.2.2 first, then add an idempotent identity endpoint only if approved. Preserve editor-persistence and actor-taxonomy behavior.

### Test plan

Automated tests must cover:

- initial create stores all video fields in meta, reads them back, and records one remote ID;
- lost POST response/retry reconciles by exact identity and does not create a duplicate;
- repeat `video_only` sends no protected fields;
- WordPress-edited title, slug, content, excerpt, categories, tags, featured image, status, and Rank Math description remain unchanged after refresh;
- playback metadata updates and the video still renders when the content block was removed;
- explicit editorial overwrite changes only the fields selected by the user;
- remote ID/movie ID mismatch, duplicate movie IDs, missing post, and unavailable plugin fail closed;
- repair finds a post without the legacy block from Distribution history and changes metadata only;
- repair never writes from URL/slug/title evidence;
- worker retry retains the original mode and cannot create a second post.

The approved end-to-end fixture must use a video the tester has rights to publish:

1. import once;
2. verify metadata read-back and playback;
3. edit title, slug, content, excerpt, categories, tags, and Rank Math description in WordPress;
4. remove the legacy player block if present and save;
5. run AURUM `video_only` refresh/retry;
6. verify playback, exact preservation of edits, one remote post only, and matching `remotePostId`/`aurum_movie_id`;
7. separately test explicit overwrite with a disposable fixture.

Static/type/unit tests, PHP lint, WordPress runtime, browser playback, Rank Math editor persistence, database migration, and production deployment are separate gates and must be reported separately.

### Risks and compatibility impact

- Existing callers that expect repeat distribution to overwrite editorial content will change behavior; they must opt in explicitly.
- Removing content fallback on new imports requires a verified active plugin/theme player that renders from meta.
- The 1.1.0 repository source versus 1.2.2 installed-copy divergence is a release-blocking risk until reconciled.
- WordPress REST may not expose Rank Math private meta uniformly; preservation can still be guaranteed by omission, but read-back verification may require a plugin-owned authenticated endpoint.
- Historical rows without reliable `remotePostId`/`aurum_movie_id` cannot be auto-repaired safely and require manual mapping.

### Acceptance gate

Implementation may begin only after the owner approves this section and decides:

1. whether to add the preferred idempotent AURUM Video Core video endpoint;
2. whether actor relationships are included in default `video_only` refresh or require a separate option;
3. which editorial and Rank Math fields the explicit overwrite UI may select;
4. which WordPress environment and licensed test video will be used for end-to-end validation.
