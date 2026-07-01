---
name: wp-lighthouse-audit
description: Lighthouse performance audit สำหรับ WordPress site (Hello Elementor / Astra + Elementor Pro + LiteSpeed Cache + Cloudflare บน Apache host) — รัน Lighthouse local กัน PSI quota หมด, parse JSON หา 5 insights หลัก, output ตาราง root cause + fix priority ที่ map ไป LSCache/Elementor action ใน admin ไม่ต้องแตะ theme code. Trigger เมื่อ "pagespeed / lighthouse / web vitals / LCP / Core Web Vitals / optimize WP / เว็บช้า / why slow site"
---

# WordPress Lighthouse Audit + Fix-Mapping (Windows)

รัน Lighthouse mobile+desktop → parse JSON → map insight ไป **LSCache/Elementor action ที่ flip ใน admin ได้เลย** ไม่ต้องแก้ theme code

Workflow นี้ตกผลึกจาก field audit จริงบน fleet WP ~250 domain (Hello Elementor + Elementor Pro + LSCache + Cloudflare บน Apache shared host) — root cause ที่เจอซ้ำ: hero image ไม่ optimize + no LCP preload + jQuery sync + Google Fonts หลาย family + cache TTL ขาด

## When to use

| Signal | Action |
|---|---|
| "เช็ค pagespeed / lighthouse / web vitals \<domain\>" | trigger |
| "ทำไมเว็บช้า / LCP สูง / optimize WP" | trigger |
| Single URL audit | trigger |
| Fleet-wide audit หลายสิบเว็บ | skip — ใช้ PowerShell loop + script แยก |
| PSI API key มี + quota ยังเหลือ | ใช้ API ก่อน เร็วกว่า; fallback local เมื่อ quota หมด |

## Prerequisites (Windows)

| Tool | Check | Install |
|---|---|---|
| **Google Chrome** | `Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"` | https://www.google.com/chrome/ |
| **Node.js + npx** | `node --version` (ต้องการ ≥ 18) | https://nodejs.org/ (LTS) |
| **Python 3** *(สำหรับ parse JSON)* | `py --version` | https://www.python.org/ (tick "Add to PATH") |
| **curl** | `curl --version` (Windows 10/11 มี built-in) | — |
| **เน็ตปกติ** | ไม่ผ่าน VPN/WARP (เลี่ยง routing ที่ทำให้ผลเพี้ยน) | — |

> Shell ที่ใช้: **PowerShell 5.1+** หรือ **PowerShell 7** (ไม่ต้องใช้ admin)
> ทุก path ในเอกสารใช้ `$env:TEMP` (= `C:\Users\<you>\AppData\Local\Temp` ปกติ)

## Stage 1 — Try PSI API first (เร็วกว่า ถ้าไม่หมด quota)

```powershell
curl.exe -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://<DOMAIN>/&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo" | Out-File -Encoding utf8 "$env:TEMP\psi-mobile.json"
```

> ใช้ `curl.exe` (ตัวจริงของ Windows 10+) ไม่ใช่ `curl` alias ของ PowerShell (ซึ่งจริง ๆ คือ `Invoke-WebRequest` ที่ syntax ต่าง)

- ถ้าไฟล์มี `"error": ... "Quota exceeded"` → ไป Stage 2 (local lighthouse)
- ถ้าได้ JSON ปกติ → parse `lighthouseResult.categories` + `lighthouseResult.audits` (เหมือน Stage 3)

## Stage 2 — Run lighthouse local (fallback)

> Chrome instance ชนกันได้ → รัน **sequential** ไม่ใช่ parallel

```powershell
$URL = "https://<DOMAIN>/"
$TAG = "before"
$CHROME = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"

# Mobile
npx -y lighthouse@latest $URL `
  --only-categories=performance,accessibility,best-practices,seo `
  --form-factor=mobile --throttling-method=simulate `
  --output=json --output-path="$env:TEMP\lh-$TAG-m.json" `
  --chrome-path="$CHROME" `
  --chrome-flags="--headless=new --no-sandbox" --quiet

# Desktop
npx -y lighthouse@latest $URL `
  --only-categories=performance,accessibility,best-practices,seo `
  --preset=desktop `
  --output=json --output-path="$env:TEMP\lh-$TAG-d.json" `
  --chrome-path="$CHROME" `
  --chrome-flags="--headless=new --no-sandbox" --quiet
```

**เวลา:** ~30-60 วินาที/รัน

> Backtick `` ` `` = PowerShell line continuation (เทียบเท่า `\` ของ bash)
> ถ้า Chrome ติดที่ path อื่น (เช่น user-install ที่ `$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe`) ปรับ `$CHROME` ตาม

## Stage 3 — Parse + extract 5 key insights

```powershell
py -c @"
import json, sys
d = json.load(open(r'$env:TEMP\lh-before-m.json', encoding='utf-8'))
a = d['audits']
cats = d['categories']

# 1. Scores
for k in ['performance', 'accessibility', 'best-practices', 'seo']:
    s = cats[k]['score']
    print(k, int(s*100) if s is not None else 'N/A')

# 2. Core Web Vitals
for m in ['first-contentful-paint', 'largest-contentful-paint',
          'total-blocking-time', 'cumulative-layout-shift', 'speed-index']:
    print(m, a[m].get('displayValue'))

# 3. The 5 critical insights (Lighthouse 12+)
for k in ['render-blocking-insight', 'image-delivery-insight',
          'lcp-discovery-insight', 'cache-insight', 'third-party-summary']:
    v = a.get(k, {})
    print(k, v.get('displayValue'), v.get('details', {}).get('items', [])[:5])
"@
```

> **Insight names เปลี่ยนตาม Lighthouse version** — เวอร์ชัน 12+ ใช้ `-insight` suffix; เวอร์ชันเก่าใช้ `render-blocking-resources`, `uses-optimized-images`, `uses-long-cache-ttl`, `uses-rel-preload`. ลอง key ทั้งคู่ถ้าไม่เจอ

### Alternative: Node-only parse (ถ้าไม่อยากติด Python)

```powershell
node -e @"
const d = require(process.env.TEMP + '\\lh-before-m.json');
const a = d.audits, cats = d.categories;
for (const k of ['performance','accessibility','best-practices','seo'])
  console.log(k, cats[k].score != null ? Math.round(cats[k].score*100) : 'N/A');
for (const m of ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'])
  console.log(m, a[m].displayValue);
for (const k of ['render-blocking-insight','image-delivery-insight','lcp-discovery-insight','cache-insight','third-party-summary']) {
  const v = a[k] || {};
  console.log(k, v.displayValue, JSON.stringify((v.details?.items || []).slice(0,5)));
}
"@
```

## Common root cause patterns (WP + Hello Elementor / Astra + LSCache stack)

| # | Pattern | Insight key | Typical savings | LCP impact |
|---|---|---|---|---|
| 1 | Hero image PNG ไม่ optimize | `image-delivery-insight` | 500-800 KB | -2~3s |
| 2 | No LCP preload (`<link rel="preload" as="image">`) | `lcp-discovery-insight` score=0 | — | -1~2s |
| 3 | jQuery sync render-blocking | `render-blocking-insight` | 1.5-2s | -1.8s FCP |
| 4 | Google Fonts หลาย family (4+ families) | `render-blocking-insight` | 0.5-1s | -800ms |
| 5 | Cache TTL ขาด (LSCache default ต่ำ + image ไม่มี `Cache-Control: max-age=long`) | `cache-insight` | 50-200 KiB | repeat-visit only |

## Fix-mapping table (root cause → action, ไม่ต้องแก้ code)

| Root cause | Fix path | Verify |
|---|---|---|
| Hero image > 100 KB | LSCache → **Image Optimization** → Send Optimization Request → Auto Request Cron + WebP Replacement = ON | Re-run lighthouse |
| No LCP preload | Elementor Pro → Site Settings → **Performance** (ถ้าเวอร์ชันรองรับ) หรือ snippet plugin: `<link rel="preload" as="image" href="...">` ใน `<head>` | View source หา `rel="preload"` |
| jQuery sync | LSCache → **Page Optimization → JS Settings** → JS Defer Mode = `Deferred` (ระวัง jQuery dependency พังธีม → ใส่ jQuery ใน Excluded ถ้าจำเป็น) | Network tab → jQuery มี `defer` |
| 4+ Google Fonts families | Elementor → Site Settings → **Global Fonts** → ตัดเหลือ 1-2 family + LSCache → Page Optimization → **CSS Settings** → Load CSS Asynchronously = ON | view-source: count `fonts.googleapis.com` |
| Cache TTL ขาด | LSCache → **Cache → TTL** → Default Public Cache TTL = 604800 (7d) + CF → Caching → Browser Cache TTL = 1 month | `curl.exe -I <url>` → `cache-control: max-age=` |

> **Always after change:** `wp litespeed-purge all` (รันบน server ผ่าน SSH/WP-CLI) — ถ้าไม่ purge = verify หลอกตา

## Output format

```markdown
## PageSpeed Results — <domain>

| Strategy | Perf | A11y | Best | SEO |
|---|---|---|---|---|
| Mobile  | XX | XX | 100 | 100 |
| Desktop | XX | XX | 100 | 100 |

## Core Web Vitals
| Metric | Mobile | Desktop |
|---|---|---|
| FCP | ... | ... |
| LCP | ... | ... |
| TBT | ... | ... |
| CLS | ... | ... |
| SI  | ... | ... |

## Root cause (mapped to common patterns)
| # | Pattern | Evidence | Fix path |

## Fix priority
1. <highest impact first>
2. ...
```

## Gotchas (field-tested, ทุกข้อเคยทำพังจริง)

### G1: LSCache lazy + 1×1 GIF placeholder → CLS 0.33

Flip `media-lazy=1` เฉย ๆ ทำให้ LSCache ใส่ `<img src="data:image/gif;base64,...1x1">` เป็น placeholder → browser คำนวณ aspect ratio ผิด → ตอนภาพจริงโหลด **CLS 0.33** (poor)

**Fix:** flip คู่กันเสมอ → `media-placeholder_resp=1` (responsive SVG placeholder ที่มี `viewBox` ตรง dimension ภาพ) → CLS กลับ 0

### G2: CSS async ไม่ทำงานถ้าไม่มี Domain Key

`optm-css_async=1` ทำให้ CSS load async แต่ **Critical CSS gen ต้อง QUIC.cloud queue** (ต้อง init Domain Key ก่อน) → ถ้าเปิด CSS async โดยไม่มี Domain Key = FCP/LCP **แย่ลง** เพราะ CSS โหลดช้าและ CCSS ไม่ inline

**Fix order:** ทำ Domain Key (`wp litespeed-online init` + ต้อง set `server_ip` ก่อน — ใช้ `ifconfig.me` IPv4) → enable CSS async ทีหลัง

### G3: Apache (non-LiteSpeed Web Server) → LSCache webp rewrite ไม่ auto

LSCache plugin generate `*.png.webp` file สำเร็จ แต่ **Apache mod_rewrite ไม่ swap** ให้อัตโนมัติ (เฉพาะ LSWS ทำได้). HTML ยัง `<img src=".png">` + response ยัง `image/png`

**Fix:** inject Apache rewrite rule ใน `.htaccess` ก่อน `# BEGIN LSCACHE`:

```apache
# BEGIN WEBP_REWRITE
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP_ACCEPT} image/webp
  RewriteCond %{REQUEST_FILENAME} (.+)\.(png|jpe?g)$
  RewriteCond %{REQUEST_FILENAME}.webp -f
  RewriteRule (.+)\.(png|jpe?g)$ $0.webp [T=image/webp,E=WEBP_SERVED:1,L]
</IfModule>
<IfModule mod_headers.c>
  Header append Vary Accept env=WEBP_SERVED
</IfModule>
AddType image/webp .webp
# END WEBP_REWRITE
```

### G4: Cloudflare cache lock = .htaccess change ไม่มีผลทันที

ถ้ามี Cloudflare proxy + cache TTL ~7 days. แม้ origin serve webp ถูกแล้ว → **CF ยัง serve cached PNG 8+ ชม.** จน expire — Lighthouse จะเห็น PNG เก่า

**Verify (PowerShell):**
```powershell
curl.exe -sI -H "Accept: image/webp,image/*" "<url>"
```
ถ้า `cf-cache-status: HIT` + `content-type: image/png` = ติด CF cache

**Fix:** purge CF cache (manual ใน dashboard หรือ API). Lighthouse run แรกหลัง purge = noisy (all MISS, cold cache) → ต้อง median 3 runs ใหม่จะเชื่อ

### G5: Lighthouse single-run variance สูงสำหรับ TBT/FCP/SI

LCP + bytes = ค่อนข้าง stable; TBT/FCP/SI variance ±30% ได้ใน 3 runs ติดกัน

**Fix:** median of 3 runs สำหรับ final comparison; ถ้า single run เห็น "regress" แต่ LCP/bytes ดีขึ้น = ไม่ต้องตกใจ rerun ก่อนตัดสินใจ revert

### G6: Dequeue Elementor Global Fonts ต้อง hook `wp_print_styles` ไม่ใช่ `wp_enqueue_scripts`

```php
add_action('wp_print_styles', function () {
    wp_dequeue_style('elementor-gf-roboto');
    wp_deregister_style('elementor-gf-roboto'); // ทั้งคู่ ไม่งั้น re-enqueue ได้
}, 100);
```

`wp_enqueue_scripts` priority 999 ยังเร็วเกินไป Elementor enqueue Google Fonts ที่ hook อื่น

### G7: `media-lazy_uri_exc` ไม่ match URL ที่มีอักษร non-ASCII (เช่นภาษาไทย)

LSCache เก็บ pattern เป็น literal string แต่ compare กับ URL ที่ encode `%E0%B9%81...` → ไม่ match ตลอด. **ใช้ filter แทน:**

```php
add_filter('litespeed_media_lazy_img_excludes', function ($excludes) {
    $excludes[] = 'hero-banner-2026';  // substring match — encoded จะ check ทั้งคู่
    return $excludes;
});
add_filter('litespeed_media_lazy_img_cls_excludes', function ($excludes) {
    $excludes[] = 'attachment-large';  // หรือ exclude by class
    return $excludes;
});
```

### G8: LSCache 7.8+ **ลบ option** `optm-css_combine` / `optm-js_combine`

HTTP/2 multiplex ทำให้ combine ไม่จำเป็น + ขัด critical CSS. ถ้าเรียกได้ `Error: ID not exist`. **อย่า rely on combine** — ใช้ minify (`optm-{html,css,js}_min`) + UCSS แทน

### G9: Imagick recompress ภาพ q=50 ลด 40% ฟรี — ไม่ต้องรอ QUIC.cloud

ถ้า server ไม่มี `cwebp` CLI แต่มี Imagick PHP ext → script ลด LCP image ได้ทันที:

```php
$im = new Imagick($png);
$im->setImageFormat('webp');
$im->setImageCompressionQuality(50);     // 80→50 ลด ~40%
$im->setOption('webp:method', '6');      // slowest = smallest
$im->stripImage();
file_put_contents($png . '.webp', $im->getImageBlob());
```

ผลลัพธ์ field test: hero PNG 65 KB → 39 KB (-40%)

### G10: LCP image ที่ตั้ง preload **ก็ยังถูก lazy-load** ได้ ถ้าไม่ exclude

แม้ใส่ `<link rel="preload" as="image">` ใน head แต่ LSCache ใส่ `data-lazyloaded="1"` ใน `<img>` → browser โหลดสองครั้ง (preload + actual swap) → LCP ไม่ลด

**Fix:** ใช้ G7 filter exclude LCP URI substring + double-check `data-lazyloaded` หายจาก HTML

### G11: Lab Mobile (Lighthouse `--throttling-method=simulate`) cap ~75-80 บน Hello Elementor stack

`simulate` = math model + slow 4G (1638/768 + RTT 562ms) + 4x CPU throttle. Hello Elementor + Elementor Pro บน shared host = stack hard-cap ที่ simulate ราว 75-80 ใน lab

**Reality check ด้วย `--throttling-method=devtools`** (real Chrome throttle) — แตกต่าง +15-20 perf points. ถ้า devtools median ≥ 90 = user จริงน่าจะ green ใน CrUX 28-day p75 แม้ simulate < 90

### G12: Warm-up CF cache 3-5 hits ก่อน audit ลด variance

LCP + bytes ค่อนข้าง stable; TBT/FCP/SI volatile. ที่ apparent "regression" ใน 1 run อาจเป็น noise — rerun 2-3 ครั้งก่อนตัดสิน revert

**Warm-up (PowerShell):**
```powershell
1..5 | ForEach-Object { curl.exe -s -o $null "https://<DOMAIN>/" }
```
ยิง same URL 3-5 ครั้ง (ไม่ใช้ `?cb=` bypass) ก่อน audit จริง — ลด variance จาก CF MISS

### G13 (Windows-only): PowerShell `curl` ≠ `curl.exe`

`curl` ใน PowerShell เป็น alias ของ `Invoke-WebRequest` (syntax คนละแบบ — `-H` ใช้ไม่ได้, output เป็น object ไม่ใช่ raw)

**ใช้ `curl.exe` ตลอด** ในทุก command (รวมถึงใน script) ไม่งั้น flag เพี้ยน

### G14 (Windows-only): Path ที่มี space ต้อง quote / escape

Chrome path มี space (`Program Files`) → ใส่ใน `--chrome-path` ต้อง quote: `--chrome-path="$CHROME"` ไม่งั้น lighthouse จะ parse path ขาดครึ่ง → spawn Chrome ผิดที่

### G15: Google Fonts can survive inside LSCache optimized CSS

Field cases: `islandhousebonita.com` and `hometownpizzawdm.com`.

Symptom: HTML/source checks show no `fonts.googleapis.com` or `fonts.gstatic.com`, but Lighthouse mobile network still downloads Roboto, Kanit, IBM Plex, or other Google font `.woff2` files. Mobile FCP/LCP can stay in the 50-70 range while desktop may be near green.

Cause: stale LSCache optimized CSS files under `wp-content/litespeed/css/` can preserve `@font-face` blocks even after `optm-ggfonts_rm=1` or Elementor font changes. Checking only HTML is not enough.

First-pass fix:

1. Inspect Lighthouse network top requests for `fonts.gstatic.com`.
2. Add/update an MU plugin that removes Google font styles at `wp_print_styles` priority 1000 and filters `style_loader_src` for `fonts.googleapis.com`.
3. Delete stale optimized CSS: `find wp-content/litespeed/css -type f -delete`.
4. Run `/usr/local/bin/wp litespeed-purge all`.
5. Warm the URL 2-3 times and confirm Lighthouse network has no Google font requests.

Minimal MU-plugin pattern:

```php
add_action('wp_print_styles', function () {
    foreach (wp_styles()->registered as $handle => $style) {
        $src = is_string($style->src) ? $style->src : '';
        if (strpos($src, 'fonts.googleapis.com') !== false || strpos($handle, 'elementor-gf-') === 0) {
            wp_dequeue_style($handle);
            wp_deregister_style($handle);
        }
    }
}, 1000);

add_filter('style_loader_src', function ($src) {
    return is_string($src) && strpos($src, 'fonts.googleapis.com') !== false ? false : $src;
}, 1000);
```

Expected result from field cases: mobile moved from about 57-69 to 93-96, desktop to 98-100 after purge/warm.

### G16: LSCache Guest Mode can create same-URL redirect waste

Field cases: `islandhousebonita.com`, `hometownpizzawdm.com`.

Symptom: Lighthouse `redirects` audit reports 1-2s wasted on the same URL even when testing the final `https://domain/` URL. Scores may look artificially bad despite cache hits.

Fix: disable Guest Mode and Guest Optimization unless the site specifically needs them:

```bash
/usr/local/bin/wp litespeed-option set guest 0
/usr/local/bin/wp litespeed-option set guest_optm 0
/usr/local/bin/wp litespeed-purge all
```

Re-test `redirects`; it should score 1 / no displayValue.

### G17: Do not enable UCSS/CSS async blindly on this stack

Field case: `islandhousebonita.com`.

Symptom: enabling `optm-css_async=1`, `optm-ucss=1`, or related CCSS/UCSS settings can regress mobile badly if generated CSS is not ready or not applied correctly. Example: mobile dropped to about 64 with LCP about 7s.

Rule: if desktop is okay but mobile is poor, check font requests and stale optimized CSS first. Only use UCSS/CSS async after verifying QUIC.cloud/domain services are healthy and after a before/after Lighthouse run. Revert quickly if FCP/LCP regress.

## Anti-patterns

- **เดา root cause** จาก score เฉย ๆ ไม่ดู insight items — savings ms = ground truth
- **แก้ code theme/plugin** ทั้งที่ LSCache flip ได้ — fleet ใหญ่ = maintenance nightmare
- **รัน lighthouse parallel** หลาย Chrome instance — ผลเพี้ยน เพราะ CPU/network contention
- **เชื่อ Lighthouse Mobile** 100% — simulator ใช้ slow 4G + 4x CPU throttle; ผลจริงในประเทศที่ 4G/5G เร็วอาจดีกว่า แต่ "relative ranking" ระหว่างเว็บยังใช้ได้
- **Optimize หน้า home หน้าเดียว** ทั้งที่ traffic เข้า `/category/*` หรือ `/single-post/*` มากกว่า — ถามก่อนว่า audit URL ไหน
- **ลืม purge LSCache** หลังแก้ → verify หลอกตา
- **PSI API anonymous quota** ไม่ใช่ unlimited — daily quota หมดเร็ว → fallback local
- **Flip media-lazy เดี่ยว ๆ** = CLS แตก → ต้องคู่ `media-placeholder_resp=1` เสมอ (G1)
- **Flip CSS async ก่อน Domain Key** = ผล regress (G2)
- **คิดว่า LSCache webp rewrite auto บน Apache** = serve PNG ตลอด (G3 — ต้อง .htaccess)
- **เชื่อ Lighthouse run แรกหลัง CF purge** = noisy → median 3 (G5)
- **ใช้ `curl` แทน `curl.exe` บน PowerShell** = flag เพี้ยนเงียบ ๆ (G13)

## Typical workflow (15-20 min/site)

```powershell
# 1. Audit before
.\audit.ps1 -Url "https://site.com/" -Tag "before"

# 2. Apply LSCache baseline (Domain Key + image opt + JS defer + cache TTL) — ผ่าน WP admin/SSH
# 3. CF manual purge ใน dashboard
# 4. Audit after
.\audit.ps1 -Url "https://site.com/" -Tag "after"

# 5. Compare ด้วย Python/Node parser
```

## `audit.ps1` — median of 3 runs สำหรับ mobile + desktop

```powershell
# audit.ps1
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Tag,
  [int]$Runs = 3
)

$ErrorActionPreference = "Stop"
$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (!(Test-Path $Chrome)) {
  $Chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
}
if (!(Test-Path $Chrome)) {
  Write-Error "Chrome not found. Install from https://www.google.com/chrome/"
}

$OutDir = "$env:TEMP\lh-$Tag"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

foreach ($ff in @("mobile", "desktop")) {
  for ($i = 1; $i -le $Runs; $i++) {
    Write-Host "→ $ff run $i/$Runs"
    $preset = if ($ff -eq "mobile") {
      @("--form-factor=mobile", "--throttling-method=simulate")
    } else {
      @("--preset=desktop")
    }
    npx -y lighthouse@latest $Url `
      --only-categories=performance,accessibility,best-practices,seo `
      @preset `
      --output=json --output-path="$OutDir\$ff-$i.json" `
      --chrome-path="$Chrome" `
      --chrome-flags="--headless=new --no-sandbox" --quiet
  }
}

Write-Host "`n✅ Done. Files in: $OutDir"
Write-Host "Next: parse with Python/Node (see Stage 3) and compute median."
```

### Run

```powershell
# Save as audit.ps1 then:
.\audit.ps1 -Url "https://site.com/" -Tag "before"
.\audit.ps1 -Url "https://site.com/" -Tag "after"
```

> ถ้า PowerShell บล็อก script (`execution policy`) ครั้งแรก:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```
> (ไม่ต้อง admin — scope = CurrentUser)
