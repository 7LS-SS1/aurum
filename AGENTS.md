# AGENTS.md

## Project Overview

This repository is a small static HTML site served from `d:\xampp\htdocs\codex`.

Current primary paths:
- `web-ai-gen/index.html`: Thai SEO landing page for World Cup 2026 betting content.
- `web-ai-gen/home-v2.html`: Thai black/gold UFA007 landing page.
- `web-build/buildweb-bacc16888.html`: Generated/static build artifact currently under review.
- `all-skills/`: Local skill collection for this workspace.
- `scripts/`: Local PowerShell helper scripts, including Hostinger All-in-One WP Migration backup scripts.
- `plag-in/`: Local plugin zip storage used by backup/deployment workflows.
- `backups-royal-01/`, `backups-royal-02/`, `backups-royal-03/`, `backups-wayback/`: Local download targets for backup artifacts.

There is no build system, package manager, framework, or git repository in this folder at the time this file was updated.

## Working Rules

- Treat this as a static site. Edit HTML/CSS/JS directly unless a build system is later added.
- Keep pages self-contained when possible. Existing CSS is inline inside each HTML file.
- Preserve Thai language content and SEO intent unless the user asks to rewrite it.
- Be careful with character encoding. These files contain Thai text that may display as mojibake in some terminals; verify encoding before doing broad text replacements.
- Avoid unrelated formatting churn in large HTML files. Make focused edits around the requested section.
- Do not remove existing meta tags, schema JSON-LD, canonical links, tracking snippets, CTAs, or image URLs unless asked.
- Maintain mobile-first behavior and responsive layout when changing styles.
- Treat `all-skills/` as the single local home for project-specific skill folders. Do not recreate skill folders at the repository root unless asked.

## Local Skills

Project skill folders currently live under `all-skills/`:
- `all-skills/clone-reference-site/`: Workflow and scripts for reproducing a live reference site as self-contained HTML.
- `all-skills/wp-lighthouse-audit/`: Workflow and script for WordPress/Lighthouse performance audits.

When reading or updating these skills, keep each skill's `SKILL.md`, `README.md`, and companion scripts together in its own subfolder.

## Validation

For simple content/style edits:
- Open the changed HTML in a browser or serve it locally from XAMPP when practical.
- Check desktop and mobile widths for obvious overlap, clipped text, broken sticky bars, and missing images.

For SEO/schema edits:
- Keep `title`, `description`, Open Graph/Twitter tags, canonical URL, and JSON-LD internally consistent.
- Validate JSON-LD syntax after editing script blocks.

## Hostinger SSH

Reusable SSH aliases configured on this machine:

```bash
ssh hostinger-royal-01
ssh hostinger-royal-02
ssh hostinger-royal-03
```

Known host details:
- `hostinger-royal-01`: `u536502882@156.67.213.55`, port `65002`, hostname `sg-nme-web1486.main-hosting.eu`
- `hostinger-royal-02`: `u358118170@187.127.126.74`, port `65002`, hostname `my-kul-web2096.main-hosting.eu`
- `hostinger-royal-03`: `u814325978@187.127.126.82`, port `65002`, hostname `my-kul-web2049.main-hosting.eu`

Remote web roots follow:

```text
~/domains/<domain>/public_html/
```

WP-CLI is available remotely at:

```text
/usr/local/bin/wp
```

When testing remote access, prefer a harmless command first:

```bash
ssh <host-alias> 'whoami && hostname && ls ~/domains | head -5'
```

If SSH to port `65002` times out, check whether Cloudflare WARP or another VPN is active; Hostinger may block WARP egress.

## WordPress Rewrite / Elementor 404 Troubleshooting

Lesson learned from `drinkbbyboy.com`: if the homepage works but pretty URLs such as `/about-us/`, `/wp-json/`, or Elementor preview return Hostinger's static 404 page, suspect rewrite handling before assuming Elementor is broken.

Quick checks:
- Compare `curl -sI https://<domain>/wp-json/` with `curl -sI "https://<domain>/?rest_route=/"`.
- If `/?rest_route=/` works but `/wp-json/` fails, WordPress is running but permalink rewrite is not being applied.
- SSH to the matching Hostinger alias and inspect `~/domains/<domain>/public_html/.htaccess`.
- Check `.htaccess` permissions; `600` can break rewrite handling. Normal public web root permission should be `644`.
- Before changing it, copy a timestamped backup, then run `chmod 644 .htaccess`.
- Flush rules with `/usr/local/bin/wp rewrite flush --hard`.
- Re-test `/wp-json/`, the affected page URL, and the Elementor page ID/slug.

For `drinkbbyboy.com`, the domain was on `hostinger-royal-02`. The fix was changing `.htaccess` from `600` to `644` and flushing rewrite rules.

## WordPress Backup Workflow

Use the Codex skill `hostinger-ai1wm-backup` for WordPress backup tasks.

Important lesson learned: All-in-One WP Migration's WP-CLI command (`wp ai1wm backup`) requires `All-in-One WP Migration Unlimited Extension`. The free plugin can create backups through WP Admin UI, but CLI backup returns:

```text
This feature is available in Unlimited Extension.
```

For automated CLI backups:
- Ensure `all-in-one-wp-migration` is installed and active.
- Install/activate the Unlimited Extension when needed from local zip:

```text
E:\plig in\plug in new\all-in-one-wp-migration-unlimited-extension-2.84n.zip
```

- Upload the zip to the target host, commonly `~/tmp/`, then run:

```bash
wp plugin install ~/tmp/all-in-one-wp-migration-unlimited-extension-2.84n.zip --force --activate
wp ai1wm backup
```

After each successful backup:
- Download the generated `.wpress` into the matching local backup folder, such as `backups-royal-01/`, `backups-royal-02/`, `backups-royal-03/`, or `backups-wayback/`.
- Verify local and remote byte sizes match.
- Delete only the exact `.wpress` file generated/downloaded from `wp-content/ai1wm-backups`.
- Remove temporary uploaded plugin zip from `~/tmp`.

Do not assume the UI backup capability means CLI backup will work; verify the Unlimited Extension is active for CLI automation.


