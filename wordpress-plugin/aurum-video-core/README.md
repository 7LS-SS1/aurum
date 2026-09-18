# AURUM Video Core

## 1.3.0 — การจัดการเว็บไซต์ AURUM

เมนู **AURUM** ใน WordPress มีภาพรวม วิดีโอ โปรไฟล์เว็บไซต์ ประวัติรับข้อมูล
และนำเข้า/ส่งออก CSV ใช้สิทธิ์ผู้ดูแลเว็บไซต์ ส่วน Project AURUM ยังคงเป็นเจ้าของ
คิวส่งงาน การตรวจตัวตน และสถานะเผยแพร่ส่วนกลาง

- เว็บไซต์เดิมใช้โปรไฟล์ `auto` โดยไม่ย้ายโพสต์หรือเปลี่ยน URL
  เลือกโปรไฟล์ `video` สำหรับเว็บที่ต้องการชนิดโพสต์วิดีโอ Core จะลงทะเบียน
  เฉพาะชนิดโพสต์และ taxonomy ที่ยังไม่มีเจ้าของ
- ตั้งค่า Project ตาม REST base ที่แสดงบนหน้าภาพรวม Diagnostics รุ่นนี้
  แสดงโปรไฟล์จริงของทั้ง `post` และ `video` พร้อมหมวดหมู่และแท็ก
- ประวัติในเว็บเก็บ 200 เหตุการณ์ล่าสุด โดยเก็บชื่อฟิลด์และรหัสรายการ
  ไม่เก็บ URL เครื่องเล่น รหัสผ่าน หรือ token ประวัตินี้เป็นบันทึกช่วยตรวจสอบ
  และไม่ใช้แทนประวัติงานส่วนกลาง
- CSV ใช้ schema 1 ของ AURUM เท่านั้น ไม่ใช่ไฟล์ CSV ของ 7M Videos Core
  รองรับ UTF-8, 500 แถว / 2 MB และมี snapshot ลงลายเซ็นเฉพาะเว็บ
  ส่งออกทีละหน้าโดยใช้จำนวนรายการต่อหน้าเท่าเดิม
- แก้ชื่อ ข้อความย่อ `meta_description` คีย์เวิร์ด และ slug ของหมวดหมู่/แท็ก/นักแสดง
  ที่มีอยู่แล้ว คั่นหลาย slug ด้วย `|` โดยไม่แก้ตัวตนหรือ URL เครื่องเล่น
- `meta_description` ที่แก้จะบันทึกทั้งเนื้อหาวิดีโอและ Rank Math description
  แถวที่ไม่แก้จะถูกข้ามและรักษาเนื้อหา HTML เดิม คอลัมน์ที่ไม่มีรักษาค่าเดิม
  ช่องว่างที่แทนค่าเดิมจะล้างค่า
- ตรวจ Preview ก่อนบันทึก ตัวอย่างใช้ได้ 15 นาทีและเฉพาะผู้ที่อัปโหลด
  ระบบตรวจความขัดแย้งอีกครั้งก่อนบันทึกเป็นชุดละ 25 รายการ
  ถ้าข้อมูลเปลี่ยนหลัง Export ต้อง Export ใหม่ ไม่มีการเขียนทับโดยอัตโนมัติ
- การนำเข้าแต่ละแถวใช้ InnoDB transaction และย้อนคืนเมื่อบันทึกไม่สำเร็จ
  รายการที่บันทึกสำเร็จก่อนหน้าในไฟล์เดียวกันยังคงอยู่ จึงควรตรวจผลรายแถว
  หากคำขอบันทึกหยุดกลางทาง ให้ตรวจผลและ Export ใหม่ก่อนลองอีกครั้ง

ทดสอบฐานข้อมูลท้องถิ่นด้วย temporary drafts/terms และคืนค่า history หลังจบ:

```bash
php tests/management-integration.php auto
php tests/management-integration.php video
```

Build ของ Project รวมเฉพาะไฟล์ติดตั้ง bootstrap, includes, assets และ README
ไม่รวม tests หรือเอกสารพัฒนา

## 1.2.4 - AURUM theme compatibility

Supported consumer themes: 123AV, misiav, rakhee, tiktik, missav, aurum-video,
aurum-video-thai and aurum-video-avjb. Keep this plugin active for metadata,
actor synchronization, native playback and self-hosted HLS.

- REST metadata now enables custom-fields support on each supported post type.
- The AURUM actor taxonomy attaches after public REST post types register,
  including the video CPT.
- Theme ownership also prevents a duplicate player for marked legacy sources.
- WebM/Ogg sources use their own MIME types; iframe pages do not load HLS assets.
- Theme integration tests create temporary drafts for both post/video REST
  profiles, render real watch templates, verify metadata/actors/playback and
  remove all fixtures in finally. Run one PHP process per theme:

    WP_LOAD_PATH=/var/www/html/wp-load.php php tests/theme-integration.php 123av

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

## Ownership filters (1.2.0)

Exactly one component per page may own the player, the VideoObject, the video
sitemap and the explicit-content signal. AURUM assumes ownership by default and
stands down when another component answers one of these filters:

| Filter | Default | Ownership signal |
| --- | --- | --- |
| `aurum_video_core_theme_renders_player` | `false` | return true when the theme prints the primary player, so AURUM does not prepend one |
| `aurum_video_core_emit_schema` | `true` | another component emits the VideoObject |
| `aurum_video_core_enable_sitemap` | `true` | another component serves the video sitemap; AURUM stops rendering `/aurum-video-sitemap*.xml` and stops advertising it in robots.txt |
| `aurum_video_core_enable_rating_meta` | `true` | another component prints the `rating` meta tag |

`aurum_video_core_enable_sitemap` intentionally leaves the rewrite rules
registered, so switching ownership back does not need a rewrite flush. While it
is disabled those URLs return 410 Gone.

When a theme claims the player through `aurum_video_core_theme_renders_player`,
AURUM also stops enqueueing its player stylesheet and HLS script, since it prints
no player markup on that page. Themes that render a legacy source also own that
player. Integrated themes explicitly enqueue the plugin player assets when they
use its server-rendered player helper.

While `aurum_video_core_enable_sitemap` is false the sitemap routes stay
registered and answer **410 Gone**, not 404 and never a redirect. Returning
quietly would let WordPress resolve the still-matching route as a home query and
`redirect_canonical()` would 301 the URL to the front page - a soft 404 that
search engines keep following. 410 tells them to drop the address instead.


## 1.2.2 - Editable WordPress imports

Playback persistence is integrated into this same plugin. Marked legacy AURUM sources are saved to metadata before editorial replacement and before Gutenberg preloads metadata. Existing playback metadata remains authoritative. Title, slug, content, excerpt and Rank Math fields remain editable. Already missing sources require verified recovery from AURUM; no source is guessed. Regression coverage: tests/editor-integration.php (temporary local drafts only).


## 1.2.3 - Actor permalink consolidation

The `aurum_actor` CPT is registered with `rewrite => false`, so its only reachable
address is the internal query URL `?aurum_actor=<slug>`. That address is publicly
queryable and therefore indexable, competing with the real actor profile page.

1.2.3 stops exposing it:

- `post_type_link` returns the paired `aurum_video_actor` term URL, so
  `get_permalink()` on an actor record no longer prints the query URL.
- `template_redirect` answers `is_singular('aurum_actor')` with a 301 to that same
  term URL, so addresses already indexed are consolidated instead of left as
  duplicates.

The pairing is `_aurum_actor_id` on the post matched against `_aurum_actor_id` on
the term. An actor with no matching term keeps its original URL and is not
redirected. An ambiguous match (more than one term carrying the same external ID)
resolves to no URL, so nothing is redirected on a guess.

Two limits to be aware of before deploying this:

1. The redirect target is whatever `get_term_link()` returns for
   `aurum_video_actor`. That taxonomy is also `rewrite => false`, so on a bare site
   the destination is `?aurum_video_actor=<slug>`. The 123AV theme filters
   `term_link` to `/actres/{slug}/`, and that is what a site running that theme
   will serve. The quality of the destination therefore depends on the active
   theme, which is unusual for this plugin.
2. Unlike the player, the VideoObject, the video sitemap and the rating signal,
   this behaviour has **no ownership filter**. If another component should own
   actor URL consolidation, a filter has to be added first; there is currently no
   way for AURUM to stand down from it.

This is a URL change. Count the affected `aurum_actor` records and check what is
already indexed before deploying, the same way any other permalink change is
treated.
