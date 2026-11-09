# Member frontend and order ownership

## Public UI

- Shared service/member header, navigation, footer, charcoal/gold palette, responsive spacing, form labels, keyboard focus and skip link.
- Rebuilt /register and /login with email/phone choices and safe internal return paths.
- /account provides member identity, owned orders, payment links, fulfillment reports and proof-based import of legacy orders.
- Catalog home/videos have a proper H1, consistent introduction, responsive cards, account navigation and empty states. Library, liked and watch keep existing media behavior and shared public controls.
- Website API commercial terms are preserved. Only the existing Ads Banner checkout creates online orders; Website API remains staff-assisted.

## Identities and sessions

Existing Viewer records/sessions are reused; staff NextAuth roles and customer sessions remain separate. Email signup uses the existing password login; email ownership verification is not implemented and must not be inferred from signup. Passwords are bcrypt-hashed; new passwords over bcrypt's 72-byte limit are rejected.

Phone signup/login uses a verified E.164 phone identity, with Thai mobile normalization. TWILIO_API_KEY, TWILIO_API_SECRET and TWILIO_VERIFY_SERVICE_SID enable the Twilio Verify adapter. It sends SMS only on user request, requires an approved check for the exact phone and never returns OTPs or creates accounts from an unverified phone. No provider configuration means 503 and no account creation. IP/phone/global request limits apply; configure shared Redis and trusted proxy handling plus provider spend/fraud limits before production enablement.

Provider contract checked against https://www.twilio.com/docs/verify/api and https://www.twilio.com/docs/verify/api/verification . Actual SMS delivery has not been tested. No email/SMS was sent during local tests.

## Order privacy

New orders require a member session and use its Viewer ID; request bodies cannot assign owners. Member order lists always filter by session owner. An attached order's bearer code alone no longer grants access. Legacy orders keep their IDs and unassigned ownership; import requires the existing secret code, is atomic, and cannot overwrite an owner. Matching names, email or phone never merges orders or accounts.

Contact email on an order is a contact field, not ownership proof. Provider checkout, WordPress installation and automated notifications retain their prior boundaries. Results are shown in the member dashboard.

## Migration and release

20261105002000_customer_accounts adds nullable unique verified-phone identities, permits email/password to be null for phone accounts, and adds nullable AdsOrder.viewerId with a restrictive FK. Existing email users, password hashes, sessions, media ownership, orders, quotes and IDs remain intact. No automatic backfill by email.

Take a full target-DB backup and verify restore separately. Apply the migration before deploying the new client/server code. It was applied only to the disposable localhost PostgreSQL database; the remote project DB was not changed. Worker draining is N/A: no media/job contract changes. Canary existing email login, new signup, phone provider configuration, customer order isolation, legacy claim, logout and staff login. Rollback app code with schema/data retained; do not delete phone accounts or revert order ownership columns. Preserve paid orders and reconciliation history.

## Validation

Production build completed successfully, including type checking and standalone packaging. Docker became unavailable during prerendering, so build-time catalog reads logged database connection errors; this build is not evidence of database-backed production readiness. The local HTTP and browser checks below ran earlier against the isolated test database.

TypeScript and targeted tests cover normalization, safe redirects, OTP proof/fail-closed behavior, sessions, prices and existing service controls. Guarded local HTTP scripts validate signup/session, different-member denial, staff separation, legacy import, order workflow, logout and ten public routes. Browser checks verify email signup to /account, OTP-disabled messaging, responsive member layout and navigation. Live media playback, production migration/deployment and real SMS remain unverified.
