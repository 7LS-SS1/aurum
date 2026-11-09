# Management host readiness — 2026-11-09

Target: `https://system-management.aurum123.com`, public site `https://aurum123.com`.

Source routing and origin validation tests passed (2 files, 11 tests). Management root rewrites to `/admin`; public admin GET/HEAD redirect to the configured management host; credential-bearing POST is rejected rather than forwarded. Unknown hosts and public APIs are not redirected. This does not prove cross-host authentication in production.

DNS lookup on the current workstation returned NXDOMAIN. Do not enable `MANAGEMENT_HOST_ENABLED` until DNS, TLS and authentication canary pass. No production routing, DNS, database or deployment was changed during this check.

## Required configuration

```dotenv
MANAGEMENT_HOST_ENABLED=false
MANAGEMENT_APP_ORIGIN=https://system-management.aurum123.com
PUBLIC_APP_ORIGIN=https://aurum123.com
```

Add the management DNS record to the verified production ingress and add the HTTPS hostname to the existing Coolify application. Preserve existing domains, mounts, environment and database. Do not change AUTH_URL blindly: verify the candidate's Auth.js callback, CSRF, login/logout and host-only session cookies on both hosts first. No shared parent-domain cookie is required by this routing patch.

After TLS is valid, test the candidate with the flag enabled: management `/`, deep admin links, staff login/logout, role restrictions, public member login, write Origin validation and legacy `/admin` redirects. Keep public API/embed/playback unchanged. DNS/TLS alone do not establish readiness.

Before combined release: capture current domain/env configuration, refresh backups, drain writes and workers, run reviewed migrations and canary. This host-only setup has no new schema migration. Roll back by disabling the flag and restoring prior routing/image compatible with the schema; do not restore old DB data over new transactions.

Email remains disabled pending sender/provider confirmation; the supplied Gmail address has not been assumed to be an approved sender or test recipient.
