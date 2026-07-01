---
name: wp-elementor-landing-page
description: Build and refine WordPress landing pages with Elementor in this workspace. Use when the user asks to create, redesign, style, inspect, or troubleshoot a WordPress/Elementor landing page, especially on a LocalWP site, with Elementor/Elementor Pro installed from local plugin zips, custom CSS, Thai-language content, generated or uploaded visual assets, and browser validation before delivery.
---

# WP Elementor Landing Page

## Overview

Use this skill to create real WordPress pages with Elementor, not standalone HTML mockups. Prefer WP-CLI for installation, page creation, Elementor metadata, media import, CSS updates, and cache/CSS flushing; then inspect the rendered site in a browser before reporting completion.

For the current LocalWP setup and known command patterns, read [references/localwp-elementor.md](references/localwp-elementor.md).

## Workflow

1. Confirm the target WordPress URL and path. For this workspace, the known local site is usually `http://test1.local/` at `D:\xampp\htdocs\localwp\test1\app\public`.
2. Install and activate Elementor. Use WordPress.org for `elementor` when needed and use the local `plag-in/` folder for paid/local zips such as Elementor Pro.
3. Create or update a WordPress page through WP-CLI. Set it as the front page only when requested or clearly implied.
4. Store the layout as Elementor data (`_elementor_data`, `_elementor_edit_mode`, `_elementor_version`) and use `elementor_canvas` or an appropriate Elementor template.
5. Add rich visual design through Elementor sections/widgets plus WordPress Additional CSS. Do not deliver a local `web-build/*.html` file as the implementation.
6. Preserve readable Thai text. If terminal output looks like mojibake, verify in browser/DOM instead of rewriting Thai blindly.
7. Flush Elementor CSS and WordPress cache after updating Elementor data or custom CSS.
8. Validate the rendered page with Chromium/Playwright at desktop and mobile widths. Check images, fonts/readability, Thai encoding, horizontal overflow, visible backgrounds, and key computed styles.
9. In the final response, state the WordPress URL, what changed, and what browser checks passed.

## Elementor Implementation Notes

- Build a real page object and Elementor structure instead of saving static HTML.
- Use stable custom classes on sections/widgets so later CSS refinements can target exact areas, for example `wc26-hero`, `wc26-card`, `wc26-section`, or a project-specific prefix.
- Keep Elementor JSON valid. Use PHP arrays and `wp_slash( wp_json_encode(...) )` when writing metadata through WP-CLI.
- Import local/generated images into the WordPress Media Library and reference attachment IDs/URLs in Elementor image widgets or CSS backgrounds.
- Put broad styling and pseudo-elements in WordPress Additional CSS because Elementor widget controls do not cover every visual effect.
- Use `!important` sparingly for overrides where Elementor inline/generated styles win, especially colors on heading widgets.

## Visual Standards

- Use an actual visual asset for landing pages. For sports/event pages, include stadium, pitch, player, crowd, or trophy-style imagery rather than abstract decoration alone.
- Make the first viewport communicate the subject immediately.
- Use a clear theme palette and apply it consistently to headings, badges, cards, buttons, and backgrounds.
- For Thai pages, ensure the chosen font stack renders Thai legibly. Browser validation matters more than terminal output.
- Check desktop and mobile screenshots before handoff; do not assume CSS looks correct from code alone.


## Unified Background Rule

When multiple Elementor sections use the same photo background, do not repeat the image on every section. Put the photo on a shared parent surface such as `body.page-id-XX` or a single wrapper, then make the child sections transparent. Repeated `background-image` on stacked sections can create visible horizontal bands or a layered look.

- Apply the stadium/photo background once with `background-size: cover` and a dark theme overlay.
- Set related content sections to `background: transparent !important` and `background-image: none !important`.
- Keep cards readable with glass/dark overlays, borders, and backdrop blur instead of opaque section backgrounds.
- Verify with `getComputedStyle` that child sections no longer have their own background images.

## Common Validation Checks

- Page loads at the requested URL with HTTP 200.
- Elementor layout is visible on the public page, not only in a static file.
- Thai text has no visible mojibake artifacts in the DOM.
- Main images have nonzero natural dimensions and are not broken.
- `document.documentElement.scrollWidth <= window.innerWidth + 1`.
- Important requested colors are verified with `getComputedStyle`, especially after Elementor style overrides.
- Desktop and mobile screenshots are saved under a workspace folder such as `playwright-shots/` when useful.


