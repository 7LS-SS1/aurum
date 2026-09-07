# Distribution failure diagnosis — 2026-09-07

Read-only database snapshot at 09:06–09:08 UTC (16:06–16:08 Asia/Bangkok). No posts created, updated, retried or deleted. No production configuration changed.

## Counts
Distribution rows are unique movie/site pairs, not unique movies and not an append-only count of attempts.

| Current status / failure category | Count |
|---|---:|
| SUCCESS | 6731 |
| FAILED | 783 |
| PENDING | 771 |
| Failed: REST metadata verification | 395 |
| Failed: WordPress database connection error | 197 |
| Failed: HTTP 500 | 180 |
| Failed: timeout | 8 |
| Failed: HTTP 522 / 503 | 3 |

783 failed pairs affect 80 unique movies across 14 sites. Movie states are 702 DONE, 36 PARTIAL and 43 FAILED. One failed distribution belongs to a DONE movie. 437 failed distributions have a stored remote post ID; this alone does not prove every one still exists remotely.

## Verified current destination evidence
Authenticated GET requests using existing stored credentials, with no credential output:

| Destination | users/me | Core diagnostics | Sample failed distribution's remote post |
|---|---|---|---|
| boxvide.online | 200 | 404 rest_no_route | post 1453: 200, publish; playback metadata present but aurum_movie_id absent |
| doomhee.com | 200 | 404 rest_no_route | post 1114: 200, publish; playback metadata present but aurum_movie_id absent |
| thaitube.live | 200 | 404 rest_no_route | post 983: 200, publish; meta only exposes footnotes |

This confirms a destination integration contract mismatch: the required REST identity metadata is unavailable. It does not establish whether the bundled plugin is absent, inactive, outdated, or blocked by destination customizations. Current database outages were not reproduced on these three samples; historical error rows explicitly report database connection errors and HTTP 500. Server logs are needed to distinguish database downtime, exhausted connections and other backend faults.

## Source-code findings
- src/lib/distributor.ts creates a WordPress post before calling verifyVideoMeta. A verification failure marks the distribution FAILED even when the post has been published. This explains the live samples.
- distributeToSite calls createPost on each invocation. It does not reconcile an existing remotePostId before creating. Repeating these failed operations can create duplicate posts. No bulk retry was performed.
- distributeMovie uses Promise.allSettled across all selected destinations. This fan-out may amplify a shared-host capacity problem, but capacity exhaustion is not proven without destination server logs.
- src/app/api/sites/[id]/ping/route.ts only calls users/me and stores healthStatus/lastCheckedAt. It does not test the metadata contract. Many stored OK checks date from July/August; Dashboard's zero unhealthy sites is not a current readiness test.
- src/app/admin/page.tsx counts all FAILED distribution rows without a time filter. The 783 value is not 783 failed videos or 783 new failures today.
- Metadata errors in the snapshot start on September 1, before the actor synchronization changes in this workspace on September 7. The current actor changes add a separate endpoint and do not modify the existing video publication algorithm.

## Recovery order
1. Confirm/install/activate the compatible AURUM Video Core integration on affected destinations and verify required REST fields.
2. Reconcile existing remotePostId records and repair missing metadata on those posts; verify reads before marking success. Do not blind-create replacement posts.
3. Inspect destination WordPress/PHP/database logs around recorded failures; resolve database/500 failures before sending batches.
4. Fix video retries to reconcile existing posts, add preflight metadata checks and bounded concurrency, and distinguish credentials health from publication readiness.
5. Recompute movie status from all distribution rows and report failure counts by time window/category after recovery.

## Artifacts
- docs/distribution-failures-20260907.json: sanitized database evidence.
- scripts/diagnose-distribution-failures.mjs: read-only database aggregation (node --env-file=.env).
- scripts/probe-distribution-destinations.ts: authenticated GET-only sample probe (tsx --env-file=.env).

Diagnosis is complete; destination repair and production recovery were not executed.
