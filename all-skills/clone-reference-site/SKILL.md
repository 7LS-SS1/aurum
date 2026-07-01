---
name: clone-reference-site
description: Reproduce a web page as self-contained HTML from a live reference site — pull the real CSS/assets before building, never guess. Auto-trigger on "clone this site / make a page like <url> / reproduce/copy this site / build HTML from this reference / make it look like site X".
---

# /clone-reference-site — reproduce a page from a live reference, right the first time

The #1 failure mode when asked to "build a page like this site" is **guessing** — wrong colors, wrong font, emoji icons, generic static layout. This skill forces you to **look at the real thing first**, then build fidelity + craft + verification in one pass.

> 🔑 Iron rule: **never build from memory** — every color/font/image value must come from the real reference you actually fetched.

## When to use
| Signal | Action |
|---|---|
| "reference is this site <url>" / "make it like site X" | ✅ full 6-step workflow |
| "design a landing/html page" (with a ref) | ✅ |
| clone a whole WordPress install (theme + plugins + DB) | ❌ wrong tool — that's a WP migration job |
| reproduce an Elementor/page-builder native export 1:1 | ❌ wrong tool — use the builder's native import |
| brand-new design with no reference | ❌ this skill needs a ref; do a design pass instead |

## Workflow — 6 steps (don't skip)

### STEP 1 — RECON the real thing (most important; always before writing code)
```bash
curl -sL -A "Mozilla/5.0 ... Chrome/120 Safari/537.36" "<URL>" -o /tmp/ref.html
```
Pull out:
- **Palette** — grep `<style>` blocks + CSS vars (`--*-color*`, `background-color:#`, body/html bg). WP themes often expose `--ast-global-color-*` / `--wp--preset--color--*`.
- **Button signature** — `grep -oE 'linear-gradient\([^)]*\)'` (CTA/gold buttons usually have a specific gradient — keep it verbatim).
- **Fonts** — `<link ...fonts.googleapis>` / `font-family` — read the actual family, don't assume Inter/Prompt.
- **Page structure** — `grep -oE '<h[1-3][^>]*>'` for real section order.
- **Real assets** — `grep -oE '/[^" ]*\.(webp|jpg|png|svg)'` then `curl` the logo/hero/cards/icons into `img/`. Real assets are what make it look "official".

> ⚠️ **If the page is a SPA** (`curl` returns an empty `<div id="app">` / `#root` shell, content rendered by Vue/React) — `curl` is not enough. Use the **headless snapshot** technique below (`scripts/recon.mjs`). This is the common case for modern sites.

### STEP 2 — COLOR exactly (the thing reviewers catch most)
- Use the color values from STEP 1 **verbatim** — don't round them.
- **Backgrounds must match tone**: black ≠ navy. If ref bg is `#131217` / `#0f1015` / `#020202` (near-black) use a neutral dark, **never** slate-navy `#0f172a` for panels (it reads blue and gets caught immediately).
- Respect dominance: e.g. 85% black + a gold accent — not every color at equal weight.

### STEP 3 — Real assets + SVG (no emoji)
- Use the real logo/hero/card images you downloaded (keep them in `img/`).
- ❌ **emoji as icons looks amateur / AI-generated** → build an inline SVG `<symbol>` sprite instead, everywhere (menu, category cards, buttons).
- Flag any asset that carries the source brand (e.g. logo with the ref's domain baked in → production must remake it).

### STEP 4 — Layout by industry (not a generic landing)
- Order sections by the convention of that industry (e.g. betting = games/promos first, push SEO prose to the bottom, dense cards).
- Keep the header tidy: equal control heights, 3 aligned zones (logo left · search center · auth right).

### STEP 5 — Motion / signature interactions (avoid "static & generic")
Add 3–5 signature interactions for that industry (not cluttered — 1–2 key motions per viewport):
- running ticker/marquee · count-up on big numbers · live feed · card shine + 3D tilt · scroll-reveal (IntersectionObserver) · button shimmer · ambient gradient/grain.
- ⚠️ every motion needs `@media (prefers-reduced-motion: reduce){...}` to switch it off.

### STEP 6 — VERIFY desktop + mobile (don't claim done early)
- Serve via a real server or `file://` and screenshot **full-page desktop + mobile**.
- Check: true black (not navy), images loaded, no horizontal scroll, buttons ≥44px tap target.
- Mobile should have a bottom nav / hamburger if the ref does.
- Confirm JS motion actually runs (read back a moving element's transform, check console = 0 errors) before saying "done".

## Output
A single self-contained HTML file (CSS + JS inline) + an `img/` folder of real assets, plus a note flagging any asset that must be re-branded before production.

## Project Cleanup Notes
- Remove placeholder article/list headings such as `หัวข้อสำคัญ` from cloned Thai SEO article sections; keep the list content unless the user asks to remove the whole block.

---

## SPA snapshot technique (when `curl` only returns a shell)

Modern sites (Vue/React SPA) render client-side, and **often serve a completely different DOM for mobile** (detected by JS user-agent, not just CSS media queries). Handle it like this:

1. **Render headless** with a real browser (`scripts/recon.mjs`) at desktop width + desktop UA → dump the post-hydration `outerHTML`, the full computed CSS (concatenate every `document.styleSheets` rule), the network asset list, and screenshots.
2. **Render again with a mobile UA + mobile viewport** → if the DOM is materially different (different classes, much smaller HTML), the site has a **separate mobile build**. Clone it as a second file and switch between them with a tiny viewport/UA router script.
3. **Snapshot → self-contained**: take the rendered `#app` inner HTML + the dumped CSS, rewrite every `/img/…` and `/fonts/…` URL to a local `img/…`, strip tracking/3rd-party scripts (GA, Zendesk, Cloudflare beacon), inline the font, and re-add motion (marquees/carousels) that the original drove with JS.
4. **Watch for JS-gated reveals**: a `background-image` may be gated behind a class the site adds on scroll (e.g. an `.imgshow` / `.aos-animate` ancestor for scroll-reveal). In a static clone those never fire, so the image silently stays `none`. If a known asset isn't showing, check the computed style — if it's `none` while the CSS rule exists, find the gating ancestor class and add it permanently to the static DOM.

See `scripts/` for working `recon.mjs` (headless dump) and `build.py` (snapshot → self-contained template) from a real job.

## Anti-patterns
- ❌ building from memory / guessing colors — **always fetch and read the real CSS first** (the #1 cause of rework).
- ❌ navy `#0f172a` standing in for black — dark bg must be neutral, not bluish.
- ❌ emoji as icons · placeholder/gradient instead of the real image the ref actually provides.
- ❌ guessed font (Inter/Prompt) when the ref uses something else.
- ❌ generic centered-hero + 3-card + CTA layout for an industry that has its own pattern.
- ❌ a static page with no motion = "looks like every other template".
- ❌ claiming "done" before verifying desktop + mobile + that the JS actually runs.
- ❌ for an SPA: cloning only the desktop DOM and assuming CSS makes it responsive — check the real mobile build first.
