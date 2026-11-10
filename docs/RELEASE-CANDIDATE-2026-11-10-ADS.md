# Video management, advertising and coupon release

Includes bulk taxonomy editing, the single-video management workspace, observed-traffic bandwidth scaling, scheduled percentage coupons in Bangkok time, and the AURUM Ads WordPress plugin with exclusive banner placements and three ordered video-ad positions.

## Validation and backup

- Full Vitest suite: 576 passed, one conditional integration test skipped.
- Next.js production build completed with database access isolated to an unreachable local test URL; two existing image optimization lint warnings remain.
- Advertising player sequence test passed: ended/skip advances, duplicate events ignored, main content loads last.
- Video Core 1.3.7 release ZIP regenerated from current source.
- Fresh project archive: `E:/aurum-backups/release-20261110-source/project-before-commit.tar.gz` (contains private local configuration; never publish).
- Fresh PostgreSQL custom-format backup: `E:/aurum-backups/cutover-2026-11-10T07-49-01-221Z/database.dump`; archive table of contents validated, SHA-256 stored alongside it. This was an online consistent dump, not a write freeze or a new restore rehearsal.
- Production database identity checked against the previously verified fingerprint. `prisma migrate deploy` completed successfully: all 37 migrations are present, no pending migrations. This release has no schema changes.

## Deployment gates and impact

Deployment is not established by this document. Verify the selected Coolify application, preserve current image/configuration and active worker jobs, pin the new commit, and check production routing/health and worker execution after rolling replacement. No records, media files, ownership, identifiers or embed URLs are intentionally rewritten by this release. Existing orders retain their saved quotations.

The WordPress Ads plugin requires per-site server-side keys, theme placement integration, reconciliation with existing advertising renderers and a single-site canary before wider activation. Deploying AURUM alone does not activate the plugin on customer websites. The fixed inventory includes three video slots; whole-page/whole-site package contents therefore include these positions at the existing configured package price. Review the package terms before opening sales. Stripe and email enablement are separate from this release.

Rollback application code to the previous compatible image while retaining the current schema and newly created customer records. Do not restore an older database dump over intervening orders without reconciliation. Do not cancel or replay in-flight jobs during rollback.
