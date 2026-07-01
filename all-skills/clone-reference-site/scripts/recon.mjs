#!/usr/bin/env node
/*
 * recon.mjs — headless snapshot of a live (often SPA) reference page.
 * Renders the URL with a real browser, then dumps everything you need to clone it:
 *   rendered.html  — post-hydration outerHTML (the real DOM)
 *   rendered.css   — every CSS rule from every stylesheet, concatenated
 *   assets.json    — network asset list (status + content-type) to download
 *   probe.json     — key computed styles (body bg / color / font)
 *   shot-desktop.png, shot-mobile.png
 * It ALSO re-renders with a mobile UA and reports whether the site ships a
 * separate mobile DOM (very common on betting/casino/SPA sites).
 *
 * Usage:
 *   npm i playwright            # one-time (installs chromium too)
 *   node recon.mjs "https://example.com/page" ./out
 *
 * If you use playwright-core with an external chromium, set:
 *   CHROMIUM=/path/to/chrome  node recon.mjs <url> <out>
 */
import { chromium } from 'playwright';   // or: import pkg from 'playwright-core'; const {chromium}=pkg;
import fs from 'fs';
import path from 'path';

const URL = process.argv[2];
const OUT = path.resolve(process.argv[3] || './out');
if (!URL) { console.error('usage: node recon.mjs <url> [outdir]'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MOBILE_UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const launchOpts = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, headless: true } : { headless: true };

const dumpCss = () => {
  let out = '';
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) out += r.cssText + '\n'; }
    catch (e) { out += `/* blocked: ${sheet.href} */\n`; }
  }
  return out;
};

const browser = await chromium.launch(launchOpts);

// ---------- desktop pass ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA });
const page = await ctx.newPage();
const assets = [];
page.on('response', r => assets.push({ url: r.url(), status: r.status(), ct: (r.headers()['content-type'] || '').split(';')[0] }));
console.log('→ desktop render', URL);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('  goto warn:', e.message));
await page.waitForTimeout(4000);

fs.writeFileSync(`${OUT}/rendered.html`, await page.content());
fs.writeFileSync(`${OUT}/rendered.css`, await page.evaluate(dumpCss));
fs.writeFileSync(`${OUT}/assets.json`, JSON.stringify(assets, null, 2));
const probe = await page.evaluate(() => {
  const g = s => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el);
    return { bg: c.backgroundColor, color: c.color, font: c.fontFamily }; };
  return { body: g('body'), app: g('#app, #root'), title: document.title, text: document.body.innerText.slice(0, 400) };
});
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${OUT}/shot-desktop.png`, fullPage: true });

// asset URL helper: image/font references in CSS
const cssImgs = [...new Set((fs.readFileSync(`${OUT}/rendered.css`, 'utf8')
  .match(/url\(["']?\/[^)"']+\.(?:png|jpe?g|webp|svg|gif|woff2?|avif)/g) || [])
  .map(s => s.replace(/url\(["']?/, '')))];
fs.writeFileSync(`${OUT}/asset-paths.json`, JSON.stringify(cssImgs, null, 2));

// ---------- mobile pass (detect separate mobile build) ----------
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: MOBILE_UA });
const mp = await mctx.newPage();
console.log('→ mobile render');
await mp.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('  goto warn:', e.message));
await mp.waitForTimeout(4000);
const mhtml = await mp.content();
fs.writeFileSync(`${OUT}/rendered-mobile.html`, mhtml);
fs.writeFileSync(`${OUT}/rendered-mobile.css`, await mp.evaluate(dumpCss));
await mp.screenshot({ path: `${OUT}/shot-mobile.png`, fullPage: true });

const desktopLen = fs.readFileSync(`${OUT}/rendered.html`, 'utf8').length;
const separateMobile = Math.abs(mhtml.length - desktopLen) / desktopLen > 0.4;

await browser.close();

console.log('\n=== RECON DONE ===');
console.log('out dir:', OUT);
console.log('desktop DOM bytes:', desktopLen, '| mobile DOM bytes:', mhtml.length);
console.log('body bg:', probe.body?.bg, '| font:', probe.body?.font);
console.log('css asset paths:', cssImgs.length, '(see asset-paths.json — download these into img/)');
console.log(separateMobile
  ? '⚠️  SEPARATE MOBILE BUILD detected — clone mobile as its own file + add a viewport/UA router.'
  : 'ℹ️  mobile looks like the same DOM (responsive via CSS).');
