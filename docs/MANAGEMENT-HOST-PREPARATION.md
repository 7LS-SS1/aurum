# Management host cutover (prepared, not enabled)

Set on the AURUM runtime only when DNS and HTTPS are ready:

```dotenv
MANAGEMENT_HOST_ENABLED=false
MANAGEMENT_APP_ORIGIN=https://system-management.aurum123.com
PUBLIC_APP_ORIGIN=https://aurum123.com
```

With the flag enabled, the management root rewrites to the existing protected `/admin` dashboard. Existing `/admin/...` deep links remain supported on the new host to preserve navigation, bookmarks and server actions. Public-host admin GET requests redirect to the fixed management origin. Admin POST requests on the former host return 409; users must sign in again on the new host. Customer routes, API endpoints, embeds and worker URLs are unchanged. This is hostname separation, not an additional authentication factor.

## Before cutover

1. Add DNS and the HTTPS domain to the existing Coolify application; verify TLS and routing before changing the flag. Do not remove the public domain.
2. Verify Auth.js `AUTH_URL` / trusted origin configuration points to the intended management origin; keep cookies host-only, preserve the auth secret, and do not share member/admin cookies via a parent-domain cookie. Verify credentials login, logout, CSRF and server actions on the new host.
3. Apply any Cloudflare Access policy to the management hostname only. Test automation separately; do not challenge or block public checkout callbacks, Stripe webhooks, embeds or monitor ingestion.
4. Enable the flag on staging first. Test anonymous `/` on management redirects to login; test each staff role, rejected unauthorized actions, deep links, uploads and payment administration. Test customer login/booking/checkout on the public host.
5. Roll out during a quiet period after a successful build and staging verification. Existing admin sessions must sign in again; a form open on the old host should be refreshed before submitting. Monitor 401/403/409/5xx and callback URLs.

## Impact and rollback

No database schema, record IDs, media, ownership, order state or payment calculation changes are part of this UI/host preparation. Database migration and worker draining are N/A: no schema or worker behavior changes. Existing backup/restore policy still applies before deployment; this change does not create or verify a backup. Keep the previous application image and environment values for rollback. Set `MANAGEMENT_HOST_ENABLED=false`, restore previous Auth.js origin and redeploy the previous image if needed. Leave public DNS and media URLs unchanged. Production DNS, TLS, live webhooks and cross-host login have not been verified by this document.

## UI notes

MUI 9.5.0 provides the shared theme and member panel. Registered-site screenshots are loaded from WordPress mShots using public homepage URLs only (no query, credentials or API keys). They are cached previews, not live uptime evidence. Upcoming business forms are explicitly non-persistent UI previews and are restricted to service managers.
