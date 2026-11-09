# Staff order detail workflow

The list at `/admin/ads-orders` links to `/admin/ads-orders/[id]`. Search and status filters are retained in the back link. Member administration links directly to the same detail page.

The detail page contains customer and site information, per-slot artwork links, contract dates, the next staff action, and an expanded audit history. Exceptions are separated from the normal action. Customer-visible notes are labelled explicitly. Confirmation is inline, and each submission uses the existing revision check and server-side transition validation.

Simulation follows the existing verified → installing → approval → active phases. Payment remains separate from service activation; the start/end dates are written only on activation. Existing live orders retain their original review → payment → installation/approval flow; this change does not add a real payment integration or automatic WordPress installation.

Step completion is based on stored audit events and contract timestamps. Legacy records with missing events are labelled as unknown instead of inventing completion dates. Cancelled, expired and refund orders have no active normal step. Existing history is preserved.

## Access and data

- The page checks `service:manage`; `GET /api/ads-orders/[id]` requires MANAGER or higher. Anonymous and member-only sessions cannot read the staff data.
- The API reads the exact ID independently of list pagination, omits request/token hashes and the request ID, and sends `private, no-store`.
- It uses the existing expiration/transaction mechanism. Reading may perform the existing due-payment/service expiry transitions and record their audit events.
- No schema/migration, IDs, ownership, attachments, embed/API contracts or worker changes. Worker draining is not applicable to this UI/API read addition. Existing PUT contracts are unchanged.

## Validation and release boundaries

- Targeted unit checks cover missing legacy history, stopped orders, evidence timestamps, approval gating and payment action availability.
- The isolated local HTTP suite additionally checks single-order authorization, malformed/missing IDs, private fields, cache headers and completed workflow history, together with the existing payment simulation transitions.
- Local verification on 2026-11-06: TypeScript and targeted ESLint passed; 14 tests across workflow/simulation/booking/group suites passed; `test-payment-simulation.mjs` passed. Browser verification used a separate owned fixture: receive work → submit for review → activate, confirmed form reset between steps, all five completion markers, audit notes, and start/end dates exactly 30 days apart. No browser console errors observed. Narrow mobile viewport and production are not verified.
- Use only `127.0.0.1:55439/aurum_ads_test` for this integration script. The default project database is remote and must not be used for fixtures.
- No deployment or production payment checks were performed. Before release, verify the route, staff permissions, attachment access and a controlled nonfinancial order on staging. Take/verify the normal database backup and restore procedure before any production rollout: staff actions still modify records even though no schema changes are required.
- Roll back by reverting these route/UI changes while retaining all orders and audit records. Keep the existing simulation-compatible backend; do not downgrade to code that treats simulation orders as real payments. Production canary: open a known order, compare dates/history, and verify the list/back filters before widening rollout.
