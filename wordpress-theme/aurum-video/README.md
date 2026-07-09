# AURUM Video — WordPress theme

Dark/gold cinema-style WordPress theme built to display movies distributed from AURUM. No companion
plugin needed — this theme registers everything required on its own.

## Install

1. Zip this folder (`wordpress-theme/aurum-video/`) or copy it directly into `wp-content/themes/aurum-video/`
   on the destination WordPress site.
2. In **Appearance → Themes**, activate **AURUM Video**.
3. In AURUM's admin (`/admin/sites`), add this site as a `TargetSite` with its `baseUrl` pointing here.
   The WordPress user AURUM authenticates as (Application Password or JWT) needs the `edit_posts`
   capability (Author role or above) — that's what the theme's `auth_callback` in `inc/meta.php` checks.
4. Keep the site's `postType` at the default (`posts`) — these templates target WordPress's built-in
   `post` type. A custom post type would need extra `register_post_type`/`register_post_meta` work not
   included here.

## Why this theme also does meta registration

WordPress's REST API silently drops any `meta` key on `POST /wp-json/wp/v2/posts` that hasn't been
registered with `register_post_meta(..., ['show_in_rest' => true])` on the **receiving** site. AURUM
sends video data as `meta` fields — without this theme's `inc/meta.php`, none of it would actually be
saved, regardless of how nicely a theme tries to display it.

## Meta fields (written by AURUM's `src/lib/distributor.ts`)

| Field | Legacy alias | Meaning |
|---|---|---|
| `aurum_provider` | `video_provider` | `"jwplayer"`, `"bunny"`, `"external"`, etc. |
| `aurum_iframe_url` | `iframe_url` | Full embeddable player URL (JWPlayer, or any provider AURUM already resolved server-side) — preferred when present |
| `aurum_video_url` | `video_url` | Direct/HLS source URL, used when no iframe URL is set |
| `aurum_thumbnail_url` | `thumbnail_url` | Poster image (falls back to it only if no WP Featured Image is set) |
| `aurum_preview_url` | `preview_url` | Hover-preview clip (not rendered by these templates — available via `aurum_get_video_meta()` if you want to add it) |
| `aurum_jwplayer_media_id` | `jwplayer_media_id` | JWPlayer media ID, for reference/debugging |

`inc/template-tags.php`'s `aurum_get_video_meta( $post_id )` reads the `aurum_*` key first and falls
back to the legacy unprefixed one, so either naming works.

## Yoast SEO integration

When a video is distributed, AURUM also sends Yoast SEO post meta through the WordPress REST API:

| Field | Meaning |
|---|---|
| `_yoast_wpseo_title` | SEO title, based on the AURUM title or per-site draft title |
| `_yoast_wpseo_metadesc` | SEO description, based on excerpt/content |
| `_yoast_wpseo_focuskw` | Focus keyphrase, preferring main category, tags, categories, then title |
| `_yoast_wpseo_opengraph-*` | Open Graph title/description/image |
| `_yoast_wpseo_twitter-*` | Twitter title/description/image |
| `_yoast_wpseo_primary_category` | Yoast primary category ID when a category is resolved |

These meta keys are registered in `inc/meta.php` with `show_in_rest => true`; keep this theme active
on destination sites that receive posts from AURUM.

## Video rendering logic (`aurum_render_video_player()`)

1. If an iframe URL is present → render it directly in a 16:9 `<iframe>`.
2. Else if a video URL is present → render a native `<video>` tag. If that URL ends in `.m3u8`,
   `hls.js` is loaded from a CDN (only on that page) and attached client-side — the same
   HLS-detection approach (native Safari playback vs. hls.js everywhere else) used in AURUM's own
   Next.js `VideoPlayer` component.
3. Otherwise, a plain "no video yet" message.

The `<!-- aurum-video -->` fallback embed that `distributor.ts` also injects directly into
`post_content` is stripped out on the single page (`aurum_strip_embedded_video_block()`) so it isn't
shown a second time underneath the theme's own player.

## Optional: silence IDE warnings for WordPress core functions

This theme's PHP files call WordPress core functions (`get_header()`, `wp_head()`, etc.) that your
editor won't recognize unless WordPress itself (or its stub definitions) are present in this project.
This is cosmetic only — it doesn't affect the theme on a real WordPress install. To silence it locally:

```bash
composer require --dev php-stubs/wordpress-stubs
```

## Testing checklist after install

1. In AURUM, upload/create a movie with a JWPlayer iframe, distribute it to this site — confirm the
   post's custom fields actually persisted (WP Admin → the post → Custom Fields panel, or
   `wp post meta list <id>` via WP-CLI) and the iframe plays on the single post page.
2. Repeat with a Bunny/`.m3u8` movie — confirm hls.js loads and the video plays.
3. Check the video isn't duplicated further down in the post content.
4. Check the homepage/category/tag/search grids render cards with thumbnails and pagination.
