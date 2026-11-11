# AURUM Ads 1.1.0

WordPress plugin paired with AURUM's `/api/public/ads-plugin` endpoint. Requires the matching AURUM release; it does not import advertisements from other plugins automatically.

## Inventory contract

- Main banners: `home_top`, `home_bottom`, `video_top`, `video_bottom`, each with L1/R1 through L4/R4. Each individual slot is exclusive.
- Popup and Fixed left/right/bottom: one exclusive slot each (`:1`).
- One pre-player position with three independently bookable sequence slots: `video_ad:1`, `video_ad:2`, `video_ad:3`. End, skip or playback error advances to the next booked slot; main content loads last.
- AURUM remains authoritative for holds, payments, activation, renewals and removal. WordPress cannot overwrite a booked slot locally.
- REVIEW requests are not reservations. PAYMENT holds and the existing reserved statuses lock inventory. Activation is still a staff operation; installing this plugin does not charge customers or activate orders.
- Existing order IDs, attachment IDs, contract dates and stored quotes are unchanged. Legacy extra floating slots block the physical position; video slots over 3 block all three new slots until staff resolve them. Such old media is not automatically reassigned.
- Existing configured prices are retained. Review whole-page/whole-site package contents before launch: the new inventory includes all three video sequence positions. Do not advertise additional freebies without checking package terms.

## Pairing

1. Back up the project, database and current WordPress advertising settings. Audit existing active ads before changing plugins. This release has no Prisma migration.
2. Deploy the matching AURUM code to staging first. Add the HTTPS WordPress website to AURUM's advertising website catalog; obtain its Website ID (not the unrelated content TargetSite ID).
3. In AURUM, use Generate key / Copy on the website card. Paste that key into WordPress. Existing ADS_PLUGIN_KEYS secrets remain supported. Set SERVICE_PUBLIC_ORIGIN to the public HTTPS AURUM origin. Never expose keys to visitors.
4. Upload `aurum-ads-1.0.0.zip`, activate, open **AURUM Ads**, enter the AURUM origin, Website ID and matching key. Save and sync. A blank key input retains the existing key; keys are never rendered back into the form.
5. Configure real WordPress cron once per minute. WP-Cron alone is traffic-dependent. The manifest expires after 10 minutes; expired data stops displaying ads rather than claiming a slot is free. The public WP manifest refreshes banners every 30 seconds. AURUM's booking screen refreshes availability every 15 seconds and validates it again under a database advisory lock.
6. Map the four main banner zones into the theme using `[aurum_ads placement="home_top"]`, `home_bottom`, `video_top`, `video_bottom`. The eight slots are two columns on desktop and one on mobile. Popup/Fixed positions render via `wp_footer`.
7. Replace the main player markup in the theme with `[aurum_ads_player src="https://example.org/video.mp4"]` or `[aurum_ads_player iframe="https://example.org/embed/123"]`. The shortcode owns the deferred player; it does not attempt to intercept arbitrary third-party iframe players. Use an iframe from the existing AURUM player for HLS/provider-specific controls. Do not change existing content IDs/embed URLs. Integrate this shortcode once per primary player, never in thumbnail previews.
8. Migrate existing ad contracts into AURUM and disable the old banner/pre-roll renderer before enabling the same positions here. Do not run both renderers on the same placements. Shortcodes and theme integration must be validated per theme; installation alone cannot locate arbitrary theme positions.
9. Canary one site: verify active banner, reserved but not active slot, each video sequence position, skip/end, mobile layout, renewal and expiry, offline behavior, then expand to other websites.

## Security / delivery

The site key stays server-side. Media URLs carry a per-site/order/file HMAC and expire in 10 minutes; the media endpoint also checks current contract state, website, file assignment and owner. It supports single byte ranges for MP4. Files remain in existing attachment storage. The feed contains no customer contact information or payment secrets.

Display changes are eventually consistent (WP cron/cache plus front-end poll), while inventory allocation is checked immediately by AURUM. Contract cancellation cannot erase video bytes already buffered by a viewer. Arbitrary ads configured outside this plugin are not discoverable automatically: migrate those before opening inventory for sale.

## UI build and tests

Admin UI uses Tailwind CSS 4, locally compiled with prefix `aa:` and no global Preflight; no CDN script or runtime Node.js is required on WordPress. See [Tailwind CLI documentation](https://tailwindcss.com/docs/installation/tailwind-cli).

```sh
npm ci
npm run build
node tests/player.cjs
```

`tests/runtime.php` exercises real WordPress APIs using mocked AURUM HTTP responses and restores its options afterward. Adapt its `/tmp/aurum-ads.php` and WordPress paths for the test container. Do not run fixtures on production.

## Rollback

Deactivate this plugin and restore the previous theme integration and ad configuration. Preserve newly created AURUM orders and media; do not restore an old database dump over new customer transactions. Disable sales for affected websites until the previous inventory renderer and contract assignments are reconciled. No media download, deletion or re-encoding is part of installation or rollback.


## 1.1.0: automatic banners and per-website management

- Homepage top/bottom automatically mount inside the theme main container. Video top/bottom mount outside the primary player; preview cards are excluded. Existing AURUM shortcode zones are reused, not duplicated. Themes without a recognized main/player container still require a shortcode or theme integration.
- Popup/fixed zones continue using the footer. Automatic insertion does not replace another plugin's existing campaigns or hijack its pre-roll player. Disable overlapping legacy placements only after checking their active contracts.
- In AURUM: Website details → Ads Banner → Manage Ads (also available on each advertising website card). Customer reservations link to their original order workflow. Staff can upload an image/MP4 or specify its HTTPS URL, destination URL, start/end times and enable/disable a manual advertisement.
- Manual enabled/future advertisements reserve their slots until expiry or disablement. The same database lock serializes manual changes and bookings. Existing customer reservations cannot be overwritten; ambiguous conflicts serve no media.
- Generate/reveal/copy the website key from the AURUM card; the older ADS_PLUGIN_KEYS configuration remains supported. Keys are never sent to site visitors.
- No schema migration. Manual advertisements are versioned in ServicePageConfig under manual-ads:<website ID>, with audit records. Back up these records with the database. Before reverting the server to a pre-1.1.0 release, disable manual advertisements or pause bookings: older releases do not account for their reserved slots.
- Rollout: deploy the matching server, then install ZIP on one backed-up WordPress site; purge page cache and verify homepage + video page before broad rollout. Existing plugin configuration is preserved. This release does not auto-import legacy 7M Ads campaigns.
