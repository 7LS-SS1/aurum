# Attachment storage — 2026-11-09

## Configuration saved for the next release

- Production provider: `ADS_UPLOAD_STORAGE=r2`.
- Private bucket: `ADS_R2_BUCKET_NAME=aurum-attachments`.
- `ADS_R2_PRIVATE_CONFIRMED=true`. Newly created via S3 CreateBucket; no public domain or r2.dev access was enabled. Never enable public access on this bucket.
- Uses the existing server-only R2 account/access credentials. Existing public media buckets and URLs are unchanged.
- `ADS_UPLOAD_DIR=/data/ads-uploads` remains a legacy-read fallback; new uploads go to R2. Coolify directory mount remains configured, not yet applied to the running app.
- Preview `ADS_UPLOAD_STORAGE=local`, with Coolify's per-PR suffix on the directory mount. Do not point preview at production attachment storage.

## Behaviour

- Upload validation, IDs, owner checks, MIME/size checks and API routes are preserved. No schema migration is required for this change.
- Metadata is private in `attachments/v1/metadata/{id}.json`; bytes are under `attachments/v1/owners/{sha256(owner)}/{id}.bin`.
- Downloads use the authenticated application API. No public object URL is returned.
- Per-owner quota counts every R2 listing page and any legacy local metadata under the PostgreSQL advisory lock. Orphaned bytes count toward quota.
- Missing R2 metadata may fall back to legacy disk. Provider outages do not silently switch uploads to disk or masquerade as missing files.
- Ambiguous metadata write failures retain bytes to avoid deleting a potentially committed upload; reconcile orphaned objects explicitly instead of automatic deletion.
- Do not revert to old local-only code after accepting R2 uploads without a compatible reader or a verified export. Keep the bucket, credentials, objects and IDs on rollback.

## Evidence

- 71 test files / 537 tests passed after adding the adapter.
- TypeScript and changed-file lint passed.
- Real R2 round-trip through `saveAttachment`, `readAttachment`, `attachmentBytes` passed: validated PNG and byte-for-byte match. Only the isolated local DB was used for locking; test objects were cleaned up.
- Production container's existing R2 credentials also passed an isolated Put/Get/Delete probe against the new bucket; only generated readiness objects were touched and cleaned. Evidence: `artifacts/attachment-r2-server-probe.png`.
- R2 preflight checks passed for valid private configuration, public-media bucket rejection, missing privacy confirmation and missing credential; existing local preflight checks still pass.
- Private bucket creation and configuration do not deploy the app. Existing production container was not restarted; production DB and media were not modified.
- Previous full build/HTTP release checks predate this adapter. Before cutover build the release and run an authenticated upload/download canary with owner, another member and manager; inspect effective environment and mount.

Cloudflare documents that newly created buckets are private by default: https://developers.cloudflare.com/r2/buckets/public-buckets/
