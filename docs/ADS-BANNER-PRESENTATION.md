# Ads Banner presentation

Route: `/services/ads-banner`. Local implementation; no deployment or database migration.
This page sells advertising inventory on our websites, separately from Website API and customer-owned WordPress plugin subscriptions. Advertising defaults live in ads-page-defaults.json; saved settings use the separate ads-banner record in service_page_config. The existing default record and its admin controls are unchanged. Contact: https://t.me/thaitubevideo.

## Admin content and promotions

- /admin/ads-banner: MANAGER and HEAD can edit page copy, benefits, category prices, bundles, contact and promotion posts.
- Promotions support title, plain text terms, optional HTTPS/local image URL, draft/published state and deletion. New posts appear first. Changes become effective only after saving; drafts never render publicly.
- /api/ads-banner checks role, trusted origin, bounded request size, strict schema, revision conflicts and transactional audit logging.
- No new schema migration: existing service_page_config table is required. Missing table disables admin writes; database errors do not silently replace saved prices.
- Existing records, media, API/embed contracts and workers are unchanged; worker draining is not needed for this settings-only change.
- Before production rollout, retain normal database backup including settings/audit tables. Canary: verify public prices, manager save, draft visibility, publish/unpublish, and a stale revision rejection. Rollback application code while retaining both settings records; do not delete the existing default record. No production deployment or settings write was performed here.
- Local validation: TypeScript passed; 16 targeted schema, store, request and public-render tests passed. Public route returned HTTP 200; anonymous API GET/PUT returned 401. Authenticated browser saves and real database write/restart persistence for this new record were not exercised.
The WordPress plugin is not modified. This page presents inventory and routes booking inquiries to staff; it does not reserve inventory.

## Verified capability source

WordPress plugin `retrotube-banner-add-on`, local version 2.3.2:
- `retrotube-banner-add-on.php:get_positions()` defines eight banner placements.
- `readme.txt` documents device controls, popup frequency, pre-player banners and pre-roll compatibility.
- `includes/class-retrotube-video-ads-admin.php` confirms configurable skip delay.
The illustration is conceptual. The interactive schematic and downloadable SVG map use the actual eight keys. The four inline placements show left/right columns. Video pre-roll is priced separately from banner slots.
No impressions, revenue, traffic or customer claims are invented. Exclusive 30 days, Desktop/Mobile support, free Artwork changes throughout the month and first-booked placement selection are user-supplied benefits.

## Advertising rates confirmed by user — 2026-11-05

- Homepage top 1,500/slot; bottom 1,000/slot; bundle 10,000/month.
- Video top 4,000/slot; bottom 2,500/slot; pre-player video 15,000/video; bundle 41,000/month.
- Every-page Popup 6,000; fixed left/right 3,000/slot; fixed bottom 4,500/slot; bundle 27,000/month.
- Whole website: 1 month 78,000; 3 months 210,600 (10% off); 6 months 374,400 (20% off). All amounts THB.
- User's repeated Homepage Top/Bottom labels under Video Page are rendered as Video Top/Bottom, above/below the video.
- Bundle slot counts are not inferred from totals. Staff confirms inventory and included slots before booking.
- Original generation prompts below are retained as asset provenance; the text-free artwork is reused for the corrected advertising offer.

## Assets and generation prompts

Built-in image_gen was used (not the CLI). Original PNGs copied into `public/images/ads-banner/`.
The SVG map is deterministic source artwork, not AI-generated. Images contain no sales copy or prices; all offers remain accessible HTML.

### hero.png
Create a premium wide landscape 3:2 editorial product hero illustration for AURUM Ads Banner, a WordPress advertising placement management service. Deep near-black charcoal background, champagne gold illuminated accents, sophisticated photorealistic 3D product rendering. A floating large desktop browser and a smaller elegant mobile browser in an architectural studio, showing an abstract video magazine website with neutral landscape photography thumbnails (mountains, sea, architecture; no people), a central video player with simple play triangle. Highlight advertising rectangles in rich gold: horizontal top banner, banner below video, two slim floating side placements and a slim bottom floating placement with tiny square close marks. Visually plausible clear hierarchy, refined metallic frames, soft studio shadows, restrained glow, generous negative space, tactile high-end aesthetic, not neon cyberpunk. NO text, NO words, NO lettering, NO logos, NO numbers, NO financial charts. This is a conceptual marketing illustration, not a technical placement diagram. Single coherent scene, beautiful crisp web-ready imagery.

### promotion.png
Create one premium square promotional campaign artwork for AURUM's WordPress banner advertising management service. Charcoal black and warm champagne gold brand palette, sophisticated luxury editorial still life. Three elegant floating rounded rectangular golden advertising panels orbit a sculptural glossy black play-button tile, an open minimalist gold gift ribbon curls gently around the base, subtle abstract desktop and phone frames behind. Clear single focal point, rich material details, controlled studio light, strong legibility at thumbnail size, abundant clean dark negative space in upper left for optional later website heading. Theme: welcoming first-month promotion for banner and video ad tools. No percentages or invented claims. Absolutely NO text, NO words, NO letters, NO numbers, NO logos, NO money, NO coins, NO charts, NO people. Sleek restrained composition, realistic polished 3D rendering, not neon or cartoon.

## Initial presentation verification — 2026-11-05

TypeScript and git diff whitespace checks passed. Both service routes and all three static assets returned HTTP 200. Browser accessibility checks confirmed page content, configured prices, Popup selection and the Mobile schematic toggle. Screenshot capture and later browser DOM inspection timed out, so full visual and narrow-viewport browser QA remain unverified. No deployment, migration, plugin mutation or production settings write was performed.

## Advertising-offer correction verification — 2026-11-05

The corrected route returned HTTP 200 with all 14 supplied price amounts and without the old first-month/plugin offer copy. TypeScript and git diff whitespace validation passed. No database, migration, plugin, production settings or deployment changes were needed. Browser visual verification for this copy/pricing revision remains unverified.
