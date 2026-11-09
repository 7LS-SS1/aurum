# Destination analytics

## Metrics and coverage
- Dashboard and `/admin/analytics`: top five sites by measured views/likes, descending, hover/focus tooltips; details show top five videos per site and top ten Google queries by clicks.
- WordPress window: 28 calendar days including today (UTC). Views require ten seconds of visible primary HTML5 playback; deduplicated per video/browser/day. Likes are confirmed positive events, not net likes after unlikes.
- Visitors are approximate distinct browsers per site, NOT verified people across domains. Browser IDs expire in 30 days; multiple devices/storage resets/blockers affect accuracy. DNT/GPC and logged-in editors are excluded. Integrate the site's consent manager before public rollout where required.
- Like adapters: 7M/123AV `sevenls_vp_like_video`, RetroTube `post-like`, Aurum theme REST reaction. Other handlers/direct SQL need adapters. Cross-origin iframe playback is unknown and never counted from iframe clicks. Primary native players use the selectors in `assets/analytics.js`.
- Imported and automated Video Boost totals never enter the new ledger. Existing legacy counters and sync cron remain unchanged. Historical genuine counts cannot be reconstructed from boosted totals.
- Missing data is not zero. Failed refresh retains the last snapshot and error. Current rankings exclude stale/failed sources. New installations measure from their start date.

## Search Console across different Google owners
No domain transfer or common Cloudflare account is required. Each owner can grant the same service account read access to their Property, or use separate service accounts. All API calls request only `webmasters.readonly`.
1. Enable Search Console API in the Google Cloud project.
2. Owner: Search Console > Settings > Users and permissions; grant the service account access to the intended Property, restricted read access where supported.
3. Store the service-account JSON fields in SERVER environment secrets, never chat/git/browser/NEXT_PUBLIC variables.
4. `SEARCH_CONSOLE_ACCOUNTS_JSON`: map aliases such as `ownerA` and `ownerB` to objects containing `client_email` and `private_key`.
5. `SEARCH_CONSOLE_PROPERTIES_JSON`: map each AURUM site ID to `{ "property": "sc-domain:example.com", "account": "ownerA" }`. URL-prefix properties require the exact URL including scheme/trailing slash. One alias may serve many domains.
Google reports 28 completed days ending three days ago. Position is average position, NOT live SERP ranking. Top queries are sorted by clicks; privacy-filtered queries can be absent. Each reporting window is displayed separately.

## Rollout, preservation and rollback
- Back up PostgreSQL and destination WordPress databases and verify a staging restore before production. Preserve all video IDs, ownership, metadata, media, distribution records and iframe URLs.
- Apply additive migration `20261109000000_site_analytics` and generate Prisma client. Local test database: 127.0.0.1:55441/aurum_stripe_test. No production migration has been run.
- Upgrade the reviewed AURUM Video Core build on ONE staging destination first. It creates a separate `wp_aurum_measured_events` table, without modifying existing view/like totals. Preserve all other current plugin changes when packaging. Keep the previous plugin ZIP.
- Canary: test native playback, confirmed like, dedup, bots/privacy exclusions, cached pages/CDN and private snapshot access. Unsupported themes/iframe providers must remain explicit coverage gaps before rollout to other sites.
- AURUM pulls aggregate snapshots with existing encrypted WordPress credentials. Snapshot permission is `manage_options`. HTTPS is required; redirects are rejected to avoid credential forwarding. Do not cache the private endpoint publicly.
- Run `node scripts/site-analytics-worker.mjs` with `SITE_ANALYTICS_ORIGIN` and `SYSTEM_API_KEY`, or schedule authenticated POST `/api/cron/site-analytics` every minute. One active site per tick, least recently attempted first; new registered sites join automatically. Each site has a five-minute claim/retry guard. Fifteen sites take about fifteen minutes per cycle, not realtime. Successful Google snapshots refresh after twelve hours.
- Rollback: stop/drain the analytics worker (up to 65 seconds), disable collection with `AURUM_ANALYTICS_DISABLED=true` in wp-config, then revert UI/collector/plugin code while retaining the additive tables. Publication/payment workers require no draining because their contracts are unchanged. DNS/CDN cutover N/A: hostnames and media delivery are unchanged.
- Live deployment, Google permissions and all-site collection require destination access and are separate from local tests. Validate last successful sync and error per site.

References: https://developers.google.com/webmaster-tools/v1/searchanalytics/query ; https://developers.google.com/identity/protocols/oauth2/service-account ; https://support.google.com/webmasters/answer/7687615
