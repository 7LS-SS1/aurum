# clone-reference-site (Claude Code skill)

Reproduce a live web page as a self-contained HTML clone — by pulling the **real**
CSS/fonts/assets first, instead of guessing. Includes a battle-tested workflow for
**SPA sites** (Vue/React) and sites that ship a **separate mobile build**.

## Install (per teammate)

Drop the `clone-reference-site/` folder into your Claude Code skills directory:

```bash
# user-level (all projects):
cp -R clone-reference-site ~/.claude/skills/

# or project-level:
cp -R clone-reference-site <your-project>/.claude/skills/
```

Claude Code auto-discovers it. Trigger by asking things like:
*"clone this page <url>"*, *"make an HTML page that looks like site X"*,
*"reproduce this site as static HTML"*.

The methodology lives in `SKILL.md`; Claude reads it automatically when the skill fires.

## Toolkit (in `scripts/`)

These make the SPA case actually work — a `curl` alone returns an empty shell.

| file | what it does |
|---|---|
| `recon.mjs` | Headless render of the URL (desktop **and** mobile UA). Dumps the real post-hydration DOM, the full computed CSS, the asset list, key colors, and screenshots. Tells you if the site has a **separate mobile build**. |
| `download-assets.sh` | Pulls every CSS-referenced image/font into `./img/`. |
| `build.py` | Template that turns the snapshot into one self-contained `index.html` (relink assets, strip tracking, un-freeze carousels, force scroll-reveal classes on). Read the comments — adjust the few per-site knobs. |

### Prerequisites for the scripts
```bash
npm i playwright        # installs a bundled chromium too
# (or: npm i playwright-core and set CHROMIUM=/path/to/chrome)
```

### Typical run
```bash
# 1. recon — render + dump everything
node scripts/recon.mjs "https://www.example.com/page" ./out

# 2. assets — download the real images/fonts
cd out && ../scripts/download-assets.sh "https://www.example.com"

# 3. build — assemble the self-contained clone (tweak knobs in build.py first)
python3 ../scripts/build.py
# -> out/index.html  (+ img/)

# 4. verify — re-render the local file, screenshot desktop + mobile, check 0 console errors
```

## Notes
- Tracking scripts (GA / chat widgets / CDN beacons) are stripped — they're not part of the design.
- Downloaded logos/images still carry the **source brand**. Re-brand before any production use.
- `recon.mjs` waits on `networkidle` + a few seconds; bump the timeout for heavy pages.
- The `build.py` knobs you'll most often touch: `APP_ROOT_OPEN`, `TRACKING_CUT`,
  `ASSET_DIRS`, and `REVEAL_FIXUPS` (the scroll-reveal gate, e.g. an `.imgshow` /
  `.aos-animate` ancestor that hides images until the section scrolls into view).
