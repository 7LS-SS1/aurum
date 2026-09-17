# Handoff to Codex — AURUM actor-taxonomy fix + push/internal-link completion

Context for the agent picking this up: this is the AURUM project (Next.js/TypeScript/Prisma app that
pushes video/actor content to multiple WordPress sites) plus a WordPress theme called `123av`
(the site's own theme, authored by the project owner). Repo: `D:\developer\aurum-project`.
Theme: `D:\developer\wp-docker\wp-content\themes\123av`. A third-party plugin,
`7ls-video-publisher-3.0.1` ("7M Video Publisher", different vendor), also lives in the same
wp-docker install and owns its own `video_actor`/`video_category`/`video_tag` taxonomies and a
`video` CPT — **do not touch that plugin**, it is out of scope and unrelated.

## Problem that was fixed

AURUM pushes actors into WordPress as a custom post type `aurum_actor` (profile record: name,
bio, metrics, external image URL). The theme's `/actors/` page showed "0 collections" because it
was reading from a **taxonomy**, not the CPT — specifically `video_actor`, which belongs to the
unrelated 7M plugin above and is not registered when that plugin isn't active (e.g. on
production `thaitube.live`, which correctly uses `TargetSite.postType = "posts"`, not `video`).
AURUM never had its own taxonomy connecting videos to actors.

## Fix implemented

Added a new taxonomy `aurum_video_actor`, owned by AURUM, registered on WordPress core `post`
(`show_in_rest: true`, `rewrite: false`). It sits alongside the existing `aurum_actor` CPT
(untouched) rather than replacing it. The plugin's actor-push endpoint now finds-or-creates a
term in this taxonomy on every push, syncing name + term meta (reusing the theme's own
`_av123_actor_*` meta key convention, plus a new `_av123_actor_profile_image_url` key for the
external image URL — images are never re-uploaded to the Media Library). Video distribution now
also pushes each movie's actors and attaches the resulting term IDs to the video post via
WordPress's native REST taxonomy-field mechanism (same approach already used for categories and
tags). The theme was extended to recognize this new taxonomy as a fallback everywhere it already
checked for `video_actor`.

## Files changed (all in this session, none deployed, none committed to git)

### aurum-project (Next.js/Prisma repo)
- `prisma/schema.prisma` — added `ActorSync.termId Int? @map("term_id")`.
- `prisma/migrations/20260908120000_actor_sync_term_id/migration.sql` — additive, nullable
  column, **not yet applied to the database** (`npx prisma migrate deploy` required).
- `wordpress-plugin/aurum-video-core/includes/actor-sync.php` — new functions:
  `aurum_actor_sync_taxonomy_register()`, `aurum_actor_sync_term_meta_fields()`,
  `aurum_actor_sync_find_term()`, `aurum_actor_sync_write_term()`. Wired into
  `aurum_actor_sync_write()` at both the "skipped" early return and the final success return, so
  `termId` is always attached to the PUT response.
- `src/lib/actor-sync-contract.ts` — added optional `termId` to `actorSyncRemoteSchema`.
- `src/lib/wordpress-client.ts` — **removed a client-side short-circuit** in `syncActor()` that
  used to return `status: "skipped"` straight from the GET lookup when the CPT payload already
  matched, without ever calling PUT. This mattered because PUT is the only place that syncs the
  taxonomy term — without removing this, re-pushing actors to backfill terms would silently do
  nothing for any actor whose CPT record hadn't changed (i.e. almost all of them).
- `src/lib/actor-sync.ts` — captures `remote.termId`, persists it into `actor_syncs.term_id` via
  the existing raw-SQL upsert.
- `src/lib/distributor.ts` — added `ACTOR_SYNC_SELECT` (exported Prisma select shape for actor
  fields), `syncMovieActors()` (best-effort per-actor push during video distribution — one
  actor's failure never fails the whole video), wired into `buildPayload()` to set
  `payload.aurum_video_actor = [...termIds]`. Extended `MovieWithTags` to include `actors`.
  Updated the `prisma.movie.findUnique` in `distributeMovie()` to include actors.
- `src/lib/site-sync/job-runner.ts` — updated the `prisma.movie.findMany` in `runPushBatch()` to
  include `actors: { select: ACTOR_SYNC_SELECT }` (this movie list feeds `distributeToSite()`).
- `src/lib/distributor.test.ts` — updated `fakeMovie()` to default `actors: []`, added
  `syncActor`/`$executeRaw` mocks, added two new tests: actors sync + term ids attached to the
  post payload, and a video still publishes successfully when an actor sync fails.

### 123av theme
- `inc/directory-pages.php` — actors directory's `taxonomies` list: `['video_actor']` →
  `['video_actor', 'aurum_video_actor']`.
- `inc/actor-profile.php` — added `av123_actor_profile_taxonomy()` (resolves whichever actor
  taxonomy is registered) and `av123_actor_profile_image_url()` (attachment first, else AURUM's
  external URL). Added parallel `aurum_video_actor_edit_form_fields` / `edited_aurum_video_actor`
  hooks alongside the existing `video_actor` ones. Extended the admin-assets taxonomy check and
  the `term_link` filter to accept either taxonomy.
- `template-actres.php` (actor single profile page) — resolves taxonomy dynamically instead of
  hardcoding `video_actor`; resolves post types via the theme's existing
  `av123_homepage_content_types()` helper instead of hardcoding CPT `video` (this page's video
  query would otherwise always return zero results on production, since production's content
  type is `post`, not `video`).
- `inc/video-player.php` — `av123_related_query_args()`'s taxonomy list gained
  `aurum_video_actor`.
- `single-video.php` — actor chip taxonomy list gained `aurum_video_actor`.
- `inc/search-optimization.php` — archive intro taxonomy check gained `aurum_video_actor`.
- `functions.php`, `style.css` — `AV123_VERSION` bumped `1.5.2` → `1.6.0` (theme already has a
  version-gated one-time `flush_rewrite_rules()` on version change; this triggers it without a
  new per-request flush).
- `CHANGELOG.md` — added a `1.6.0` entry.

## Verification status (be precise about this — don't re-claim anything as tested that wasn't)

- `npx tsc --noEmit` — **ran successfully, 0 errors.**
- `npm run lint` (ESLint, type-aware via `next/typescript`) — **could not complete**: timed out
  repeatedly (180s) even on a single file, in the sandboxed Linux VM this work was done in. Not
  attributed to a code defect — needs to be run for real.
- `npx prisma validate` — **could not complete**: timed out, sandbox network could not reach the
  Prisma engine download host.
- `npm run test` (vitest) — **could not run at all**: the mounted `node_modules` was installed on
  Windows (has `query_engine-windows.dll.node`) and is missing the Linux-native
  `@rollup/rollup-linux-x64-gnu` optional dependency that vitest's bundler needs. This is a
  platform mismatch, not a code issue — but it means the actual test suite, including the two new
  tests added, has never actually executed.
- PHP (`php -l` / `npm run wordpress:test-plugin`) — no PHP CLI available in the sandbox. Syntax
  was checked manually (brace/paren balance scripted-verified across every edited file, plus
  careful line-by-line review) but **not run through a real PHP parser.**
- No deployment happened. Nothing was pushed to WordPress (neither the wp-docker test install nor
  production). Nothing was committed to git.

## What Codex should do

1. Run `npm run lint`, `npm run test`, `npx prisma validate`, and `php -l` on the changed PHP
   files, on a real machine/CI where these actually complete. Fix anything they surface — the
   above claims are the state as of this handoff, not a guarantee.
2. If `npm run test` reveals the two new `distributor.test.ts` cases don't pass, the likely
   culprit is the exact shape of the `syncActor` mock return value vs. what
   `actorSyncRemoteSchema` / `syncMovieActors()` expect — check field names carefully.
3. Deploy the updated `aurum-video-core` plugin (currently the wp-docker copy is older than the
   repo copy — confirm before assuming it's current) and the 123av theme (1.6.0) to a real
   WordPress test install, then run `npx prisma migrate deploy`.
4. Manually verify end-to-end: push one actor from `/admin/actors`, confirm a term appears in
   the WordPress admin taxonomy "AURUM Actor (video)", confirm `/actors/` (or `/actres/`) no
   longer shows "0 collections", distribute one video with actors attached, confirm the actor's
   `/actres/{slug}/` page lists that video.
5. To backfill the 20 pre-existing actors: re-push them all from `/admin/actors` after deploying
   (no separate migration script needed — this now works because of the client-side short-circuit
   removal above). Videos already published before this change need to be re-distributed (or
   re-synced via the site-sync job) for `set_object_terms` to actually attach the taxonomy term —
   WordPress won't backfill that retroactively.
6. Do not touch the `7ls-video-publisher-3.0.1` plugin. Do not delete any existing `aurum_actor`
   CPT data. Do not change `TargetSite.postType` away from `"posts"` for production.
7. Separately flagged, **not yet approved to fix**: production's `/videos/` page 404s because
   `archive-video.php` depends on the CPT `video` archive, which doesn't exist on production
   (same root architecture mismatch as the actor page had). Leave this alone unless the project
   owner explicitly asks for it.

Full bilingual (Thai) delivery report with the original root-cause/architecture/checklist
write-up is saved separately in this project as `claude/actor-taxonomy-fix-2026-09-08.md`.
