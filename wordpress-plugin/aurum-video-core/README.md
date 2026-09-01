# AURUM Video Core

Theme-independent integration for AURUM-distributed WordPress videos.

## Install

1. Run `npm run wordpress:build-plugin` in the AURUM repository.
2. Upload `dist/aurum-video-core.zip` in **Plugins → Add New → Upload Plugin** and activate it. Do not change the active theme.
3. Open `/wp-json/aurum-video-core/v1/diagnostics` while authenticated with an editor account. `ready` must be `true` and the active REST post type must have no missing fields.
4. Save permalinks once, or deactivate/reactivate the plugin, to register the video-sitemap routes.

The optional real REST integration test creates and then removes one local draft:

```bash
WP_LOAD_PATH=/var/www/html/wp-load.php php tests/rest-integration.php
```

For an MU-plugin deployment, copy the `aurum-video-core` directory into `wp-content/mu-plugins/` and add a root loader such as `wp-content/mu-plugins/aurum-video-core-loader.php` containing:

```php
<?php require_once WPMU_PLUGIN_DIR . '/aurum-video-core/aurum-video-core.php';
```

## Repair existing posts

Dry run is the default and performs no writes:

```bash
npm run wordpress:repair-video-meta -- --site-id TARGET_SITE_ID --post-id 48
```

Review the JSON plan, then apply it to the same post:

```bash
npm run wordpress:repair-video-meta -- --site-id TARGET_SITE_ID --post-id 48 --apply
```

The command only calls the existing post's meta update endpoint. It never calls the post-creation endpoint and never changes title, slug, or content. Re-running after a successful repair reports `noop`. Every applied repair writes an `AuditLog` entry with the post, movie, match strategy, and changed fields.

## Rendering and SEO ownership

- Direct/HLS videos are emitted as standard `<video><source>` markup in the first response. HLS.js is self-hosted and attaches only on explicit play intent in non-native browsers.
- Iframe providers receive a titled 16:9 iframe with explicit permissions.
- The legacy `<!-- aurum-video -->` link is stripped from displayed content. If meta is still missing, its safe HTTP(S) URL is used temporarily and `_aurum_video_core_needs_backfill` is stamped for diagnostics.
- The active `misiav` theme and the repository's `aurum-video` theme are detected so an existing theme player is not duplicated.
- Yoast private metadata is not registered. Public Yoast description/image filters are used only when Yoast has no value. Basic Yoast and AURUM can coexist; Yoast Video SEO remains the VideoObject owner when installed.
- `/aurum-video-sitemap.xml` is a sitemap index. Page files are `/aurum-video-sitemap-1.xml`, etc. The index is advertised in virtual `robots.txt`.
- Adult rating and `<video:family_friendly>no</video:family_friendly>` are opt-in through `aurum_explicit=1` or the `aurum_video_core_is_explicit` filter. Nothing is inferred merely from the site category.

## CDN and Search Console checklist

1. Keep Bunny token/hotlink protection for ordinary third-party traffic, but add a crawler-safe rule that permits verified Googlebot. Verification must use forward-confirmed reverse DNS or an equivalent trusted edge signal; never trust `User-Agent` alone.
2. Permit `GET`, `HEAD`, and byte/range requests to the poster, master/media M3U8 files, encryption keys if used, and media segments. Return the correct media MIME types and CORS headers for `https://javhub24.com`.
3. Keep media URLs stable. Do not generate a new expiring URL on each watch-page request.
4. Confirm an ordinary off-site hotlink still receives the intended denial, while a verified Googlebot request receives the manifest and at least one segment successfully.
5. Submit `/aurum-video-sitemap.xml` in Google Search Console. Run URL Inspection on repaired watch pages and review the Video indexing report after recrawl.
6. Validate the live response in Rich Results Test and Schema Markup Validator. Explicit pages may be ineligible for some search features even when technically valid.

## Rollback

1. Deactivate/remove `aurum-video-core`; this restores the prior theme behavior and removes its sitemap route after rewrite rules are flushed.
2. Revert the AURUM application commit if post-write verification must be rolled back. Existing WordPress posts are not deleted.
3. Repaired meta is safe to leave in place. If removal is required, restore only the fields recorded in the repair audit log; do not delete or recreate posts.
