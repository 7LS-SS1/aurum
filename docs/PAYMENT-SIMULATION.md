# Payment simulation (local development only)

This implements a persisted rehearsal of booking → payment selection → staff verification → installation updates → approval → contract start. It never sends money, calls a payment provider, or installs ads on WordPress. QR is an unscannable placeholder. USDT has no recipient address; 35 THB/USDT is a fixed fictional demonstration rate. BEP20 is a proposed network label pending the owner's confirmation, not an enabled receiving network.

## Run

Use the existing isolated local PostgreSQL database `aurum_ads_test` on port 55439 (container `aurum-ads-check`). Stop the existing development server on port 3007 before starting:

```powershell
npm run dev:payments:demo
```

The launcher explicitly overrides the repository's normal database URL, disables real payment links, and rejects remote databases. It does not start PostgreSQL or apply migrations. Existing local customer/order migrations must already be installed. Do not run these tests or migrations against the default `.env` database.

1. Sign in as a member and open `/services/ads-banner/book`.
2. Select a website and slots, attach artwork, then confirm. The server calculates the price and reserves **simulation inventory** for 30 minutes.
3. The booking redirects to `/services/ads-banner/checkout/<order-id>`; select QR, USDT/BEP20, or USDT/TRC20.
4. Click the clearly labelled simulation button. The result is pending verification, not paid. Expand failure scenarios to simulate failure or a mismatched amount.
5. In `/admin/ads-orders`, expand the DEMO row. A manager checks the simulated receipt and confirms it or returns it for retry.
6. Record installation start, completion, and approval. Only approval writes the 30/90/180-day contract window. Staff notes and audit history are visible to the owner. Checkout polls while waiting; the account has a refresh action.
7. Cancel a simulated order from admin to free its test inventory. This is not a refund action and has no real-world financial effect.

Payment review must finish within the 30-minute reservation. Expired submissions cannot be approved; make a new demo booking. A failed/mismatched attempt can be retried within the original reservation, which is not extended by switching methods or retrying.

## Data and boundaries

- `AdsOrder.quote.simulation` is a versioned simulation state envelope. Existing quote pricing, attachments, website snapshot, IDs, ownership, amount units, and legacy payment flow are retained. No schema migration is added in this change.
- The `PAYMENT` and `PAID` statuses remain compatible with existing group filters; simulation phase supplies the detailed customer/admin labels.
- Simulated inventory competes only with other simulated orders. Legacy approval ignores simulated reservations. Database advisory locks serialize allocation and transitions; revision checks reject stale/concurrent actions.
- Simulation endpoints require an authenticated owner; admin transitions require MANAGER or higher and same-origin checks. Amount/outcome receipts are constructed server-side. Customer-supplied amounts and unknown network names are rejected.
- Real actions cannot be applied to simulated orders and simulated actions cannot be applied to real orders. A simulation receipt is never proof of actual payment. No Gateway/webhook/bank/blockchain integration is included.
- Simulation requires `ADS_PAYMENT_MODE=simulation` AND non-production `NODE_ENV`. In production the checkout returns 404 and simulation mutation endpoints refuse requests, even if the flag was accidentally copied.
- Test orders remain visible and explicitly labelled DEMO. Existing account summary counts include these records; they must not be treated as real revenue. Use only an isolated database for rehearsal.

## Validation and release boundary

- Run `npx vitest run src/lib/ads-simulation.test.ts src/lib/ads-booking.test.ts src/lib/ads-order-groups.test.ts`, targeted ESLint, and `npx tsc --noEmit`.
- With the local demo server running, run `scripts/test-payment-simulation.mjs` with DATABASE_URL explicitly pointing to the isolated database. The script rejects any other host/port/database, exercises real HTTP routes/uploads, and cleans only fixture IDs it created. `--keep-demo` retains one labelled fixture for UI testing.
- Schema/migration: N/A for this change; JSON state is additive. No migration or remote database writes were performed for this feature.
- Backup/restore: no production data is changed; prior to any later shared-environment rollout, snapshot the database and private upload volume and test restoration. Existing data being present does not make a deployment safe automatically.
- Canary: local rehearsal only; production activation is intentionally blocked. Real payment launch requires a separate approved provider integration and validation.
- Worker draining: N/A; no payment or installation background workers are introduced. Browser polling performs reads, with existing lazy status expiry on the server.
- Rollback: stop the demo server and restart without the simulation flag; keep test records, uploads, and audit history. Do not convert DEMO orders into real purchases. Older code cannot safely distinguish simulation records, so never run that code against this rehearsal database expecting real inventory figures.
- Deployment, bank settlement, blockchain confirmation, external notifications, real mobile devices, and actual WordPress installation are outside this simulation's validation.

## Local evidence (2026-11-05)

- TypeScript and targeted ESLint passed; 9 unit tests passed across simulation boundaries, quote pricing, and order groups.
- The HTTP integration script passed all assertions, including actual private-file upload, unauthorized/other-owner rejection, CSRF, mismatched amounts, duplicate/concurrent confirmation, expiry, account history, and a 90-day approval window.
- Browser checks verified checkout selection, pending receipt, staff confirmation, installation updates, and the customer's automatically updated approval/start/end display. A stalled browser automation tab prevented the final approval click; the same local fixture was approved through the authenticated HTTP route, then its final display was verified in the browser.
- The responsive stylesheet includes mobile layouts, but the browser viewport override continued reporting 1280 px. Mobile viewport/device rendering is not claimed as verified.
- Screenshots: `artifacts/payment-simulation-checkout.png`, `artifacts/payment-simulation-result.png`, `artifacts/payment-simulation-active.png`.
