# LocalWP Elementor Reference

## Known Local Site

- WordPress URL: `http://test1.local/`
- WP root: `D:\xampp\htdocs\localwp\test1\app\public`
- Workspace: `D:\xampp\htdocs\codex`
- Local plugin zip folder: `D:\xampp\htdocs\codex\plag-in`
- Elementor Pro zip used previously: `D:\xampp\htdocs\codex\plag-in\elementor-pro_4.0.4_nf.zip`

## WP-CLI Pattern

LocalWP needs its PHP/MySQL environment variables. A reliable pattern is:

```powershell
php -n `
  -d extension_dir='C:/Users/Service_IT_BK/AppData/Roaming/Local/lightning-services/php-8.2.29+0/bin/win64/ext' `
  -d extension=php_mysqli.dll `
  -d extension=php_pdo_mysql.dll `
  -d extension=php_curl.dll `
  -d extension=php_openssl.dll `
  -d extension=php_mbstring.dll `
  -d extension=php_zip.dll `
  -d extension=php_gd.dll `
  -d mysqli.default_port=10005 `
  -d pdo_mysql.default_port=10005 `
  'C:\Users\Service_IT_BK\AppData\Local\Programs\Local\resources\extraResources\bin\wp-cli\wp-cli.phar' `
  --path='D:\xampp\htdocs\localwp\test1\app\public' <wp args>
```

Useful commands:

```powershell
<wp> plugin install elementor --activate
<wp> plugin install 'D:\xampp\htdocs\codex\plag-in\elementor-pro_4.0.4_nf.zip' --force --activate
<wp> post create --post_type=page --post_status=publish --post_title='...'
<wp> option update page_on_front <page-id>
<wp> option update show_on_front page
<wp> elementor flush-css
<wp> cache flush
```

Prefer a temporary PHP file plus `wp eval-file` for complex Elementor metadata or custom CSS. PowerShell quoting around inline JSON/PHP is fragile.

## Writing Elementor Data

Use a PHP eval file that:

1. Creates or updates the page.
2. Calls `update_post_meta( $page_id, '_elementor_edit_mode', 'builder' )`.
3. Calls `update_post_meta( $page_id, '_wp_page_template', 'elementor_canvas' )` when a blank landing page is desired.
4. Writes `_elementor_data` as slashed JSON:

```php
update_post_meta(
    $page_id,
    '_elementor_data',
    wp_slash( wp_json_encode( $elements ) )
);
```

For custom CSS, update WordPress Additional CSS with `wp_update_custom_css_post(...)` instead of editing a theme file when the change is page-specific or design-only.

## Media Assets

Import local assets into WordPress before using them:

```powershell
<wp> media import 'D:\xampp\htdocs\codex\web-build\assets\image.png' --porcelain
```

Use the returned attachment ID and `wp_get_attachment_image_url(...)` or the resulting URL in Elementor widgets/CSS.

## Browser Validation

Use Playwright or Chromium after every substantial visual change. Clear proxy variables for LocalWP if needed, and use `curl.exe --noproxy "*"` for quick checks against `test1.local`.

Suggested checks:

```javascript
const text = await page.locator('body').innerText();
const badThai = text.includes('known mojibake artifact 1') || text.includes('known mojibake artifact 2');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const images = await page.locator('img').evaluateAll(imgs =>
  imgs.map(img => ({ src: img.currentSrc || img.src, w: img.naturalWidth, h: img.naturalHeight }))
);
```

Also verify computed styles for user-reported issues:

```javascript
const style = await page.locator('.target .elementor-heading-title').evaluate(el => {
  const s = getComputedStyle(el);
  return { color: s.color, borderColor: s.borderColor, background: s.backgroundImage || s.backgroundColor };
});
```

Save screenshots for desktop and mobile when design is the main deliverable.

## Unified Background CSS Pattern

Use this when the page looks like stacked image strips because each Elementor section repeats the same background image:

```css
body.page-id-XX {
  background:
    radial-gradient(circle at 18% 22%, rgba(255, 226, 123, .16), transparent 34rem),
    linear-gradient(105deg, rgba(0, 18, 10, .96), rgba(0, 34, 19, .88)),
    url('IMAGE_URL') center top / cover fixed no-repeat !important;
}
body.page-id-XX .elementor {
  background: transparent !important;
}
body.page-id-XX .section-a,
body.page-id-XX .section-b,
body.page-id-XX .section-c {
  background: transparent !important;
  background-image: none !important;
  overflow: visible !important;
}
body.page-id-XX .section-a:before,
body.page-id-XX .section-b:before,
body.page-id-XX .section-c:before {
  display: none !important;
  content: none !important;
}
```

Validation snippet:

```javascript
const sections = ['.section-a', '.section-b', '.section-c'].map(sel => {
  const el = document.querySelector(sel);
  const s = getComputedStyle(el);
  return { selector: sel, backgroundImage: s.backgroundImage, backgroundColor: s.backgroundColor };
});
const bodyHasBgImage = getComputedStyle(document.body).backgroundImage.includes('IMAGE_FILE_NAME');
```

Expected result: `bodyHasBgImage` is true and each section reports `backgroundImage: "none"`.

