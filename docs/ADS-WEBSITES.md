# Website selection for advertising

Manage the advertising website catalog at `/admin/ads-banner`. Each entry has a stable UUID, display name, HTTPS URL and enabled flag. New entries start disabled. The booking page exposes enabled websites only, requires one website per order and clears selected slots when switching websites. Prices and inventory counts are currently shared across sites.

New orders validate the website server-side and store its ID/name/URL snapshot inside the existing quote JSON. Existing IDs, quotes, media and ownership are unchanged. Allocated slots conflict only within the same website; legacy orders without a website conservatively block those slots across all websites until staff resolve them. No automatic legacy assignment occurs. Configuration writes and order transitions share the inventory transaction lock.

No new schema migration is required for this change: configuration and quote JSON use existing columns. Existing account/order migrations remain prerequisites. Before release, back up the database/configuration and verify restore; canary disabled-site rejection, two-site slot isolation, staff approval and member order display. Workers need no draining because media/job contracts are unchanged. Rollback must disable new checkout first: old code does not understand website isolation. Retain order snapshots and reconcile existing paid campaigns before re-enabling sales.

Mobile preview and screens up to 600px show all eight main slots in one column, retaining their original slot identities. Desktop keeps left/right columns.

Local validation: TypeScript, 11 pricing/config tests, and `scripts/test-ads-websites.mjs` (guarded disposable DB) passed. Browser verified website choices and a single 260px grid column containing eight slots. Test site domains are fixtures only; no production catalog or database was changed, and no deployment or real charge occurred. The fixture script sets the local catalog used by the existing member/order HTTP scripts; run it first.
