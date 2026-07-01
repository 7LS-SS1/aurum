#!/usr/bin/env python3
"""
build.py — turn a headless SNAPSHOT (from recon.mjs) into a self-contained clone.

This is a TEMPLATE, not a magic button. Every site differs; read the comments and
adjust the few site-specific knobs (CUT markers, reveal classes, asset host).

What it does:
  1. extracts the rendered app DOM (#app / #root inner) from rendered.html
  2. strips frozen SPA carousel inline styles (Swiper translate3d / fixed widths)
  3. forces JS-gated scroll-reveal classes ON (so images aren't stuck at none)
  4. rewrites /img/ and /fonts/ asset URLs to a local img/ folder
  5. strips 3rd-party tracking scripts (added back by the page, not part of design)
  6. assembles one self-contained index.html (CSS + JS inline)

Run from the recon out dir:
  python3 build.py            # reads rendered.html + rendered.css -> writes index.html
"""
import re

# ---------- knobs (adjust per site) ----------
APP_ROOT_OPEN   = '<div class="app'          # marker where the real app content begins
TRACKING_CUT    = '<iframe data-product="web_widget"'  # first 3rd-party node to cut before (Zendesk/CF/etc); set None to keep all
ASSET_DIRS      = ('/img/', '/fonts/')       # absolute asset prefixes on the source -> rewritten to img/
REVEAL_FIXUPS   = [                          # (class-with-quotes-to-find, class-to-append) for scroll-reveal gates
    ('class="reg_advantageBG"', 'reg_advantageBG imgshow'),
]
# --------------------------------------------

html = open('rendered.html', encoding='utf-8').read()
css  = open('rendered.css',  encoding='utf-8').read()

# 1. extract app DOM (from app root open .. before first tracking node)
start = html.find(APP_ROOT_OPEN)
if start < 0:
    start = max(html.find('<div id="app"'), html.find('<div id="root"'))
if TRACKING_CUT and html.find(TRACKING_CUT) > 0:
    cut = html.rfind('<script', 0, html.find(TRACKING_CUT))  # also drop the script right before it
    if cut < start:
        cut = html.find(TRACKING_CUT)
else:
    cut = html.find('</body>')
app = html[start:cut]

# 2. strip frozen Swiper inline freeze styles (so carousels reflow / re-animate)
app = re.sub(r'(class="swiper-wrapper[^"]*")\s+style="[^"]*"', r'\1', app)
app = re.sub(r'<div([^>]*?)class="swiper-slide[^"]*"[^>]*?>',
             lambda m: re.sub(r'\s*style="[^"]*"', '', m.group(0)), app)
app = re.sub(r'\s*style="[^"]*translate3d[^"]*"', '', app)
app = re.sub(r'\s*style="transition-duration:[^"]*"', '', app)

# 3. force scroll-reveal classes ON (static clone shows imagery immediately)
for find, repl in REVEAL_FIXUPS:
    app = app.replace(find, f'class="{repl}"')

# 4. rewrite asset URLs (CSS + inline) to local img/
for d in ASSET_DIRS:
    local = 'img/'
    for q in ('url("', "url('", 'url('):
        css = css.replace(q + d, q + local).replace(q + d.lstrip('/'), q + local)
    app = app.replace(d, local)

# 4b. unpause CSS marquees if the page kept them paused for JS to start
css = css.replace('animation-play-state: paused', 'animation-play-state: running')

# 5. clone overrides — reflow carousels as CSS marquees + reduced-motion + hide loaders
css += '''
/* ---- clone overrides ---- */
.box_loading{ display:none!important; }
@media (prefers-reduced-motion: reduce){ *{ animation:none!important; } }
'''

# 6. optional: a tiny viewport/UA router (if you also built mobile.html)
ROUTER = '''<script>(function(){
  function isMobile(){return matchMedia('(max-width:768px)').matches||/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);}
  if(isMobile()){location.replace('mobile.html');return;}
  var t;addEventListener('resize',function(){clearTimeout(t);t=setTimeout(function(){if(isMobile())location.replace('mobile.html');},300);});
})();</script>'''  # delete this + the {ROUTER} below if you only ship desktop

out = f'''<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{re.search(r"<title>(.*?)</title>", html, re.S).group(1) if "<title>" in html else "clone"}</title>
{ROUTER}
<style>
{css}
</style>
</head>
<body>
<div id="app">{app}</div>
</body>
</html>
'''
open('index.html', 'w', encoding='utf-8').write(out)
print('wrote index.html', len(out), 'bytes')
