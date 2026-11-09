# Stripe Payments and Invoicing

AURUM supports one-time THB payments for quoted video services and existing Banner orders through Stripe hosted Checkout or hosted invoices. This implementation is **Sandbox only** and rejects live keys and live webhook events. No subscriptions, automatic tax calculation, automatic invoice emails or production fulfilment are enabled by this change.

The implementation follows the accepted Stripe integration guide `iguide_61ViFxRiYEDTAXvZy41BzMlPEznUB`: hosted payment collection, server-owned prices, explicit invoice finalization, metadata correlation and webhook reconciliation.

## Configuration

Use a dedicated test database. Never point Sandbox at the production database: a successful test payment changes Banner reservation and payment states in the connected database.

| Variable | Value |
| --- | --- |
| `STRIPE_ENABLED` | `false` by default; `true` enables new drafts, Checkout creation and invoice finalization |
| `STRIPE_RECONCILIATION_ENABLED` | `false` by default; opt in on the isolated Sandbox database to recover existing orders using the service worker, even when new payment creation is disabled |
| `STRIPE_ENVIRONMENT` | `sandbox` |
| `STRIPE_ACCOUNT_ID` | The Sandbox account ID matching the key |
| `STRIPE_SECRET_KEY` | Sandbox `rk_test_…` preferred, or `sk_test_…`; server only |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for the exact endpoint or local CLI listener |
| `STRIPE_PUBLIC_BASE_URL` | App origin without a path, e.g. `http://localhost:3317` or the HTTPS staging origin |
| `STRIPE_SANDBOX_DB_CONFIRMED` | Set `true` only after confirming the database contains test data |

Local `.env.local` takes precedence over `.env`. Both files are ignored by Git. Environment placeholders remain disabled. The test scripts override flags only inside their own processes.

The integration needs account read access; customers, Checkout Sessions, invoices and invoice items write access; and read access to invoice payments, PaymentIntents and charges. The Sandbox integration test additionally attaches a test PaymentMethod, pays a test invoice and refunds its own test payment. Do not give refund/write permissions to a production integration solely for this test script.

## Staff and customer flows

At `/admin/payments`, MANAGER or HEAD can create a draft:

- Video: choose the member ID, service description and agreed total in baht. This is an explicit quote, not an automatic charge for a service request or a subscription.
- Banner: enter an existing Banner order ID in `REVIEW`. The server takes its owner and amount from that order and prevents combining Stripe with manual or PromptPay billing.

Create the hosted Checkout link or prepare the draft invoice. Invoice drafts require a separate **ยืนยันออกใบแจ้งหนี้** action before a hosted payment link is available. AURUM does not call the invoice email-send API. Customers see only their own orders at `/account/payments`.

Checkout reservations last one hour; invoice terms last one day. Renewal deadlines may shorten them. Stripe settlement is checked against the exact account, customer, currency, total and AURUM metadata. A return URL never changes payment state.

Banner settlement becomes `PAYMENT_REVIEW` when the payment is timely and inventory remains available. Staff use **ตรวจรับยอด Banner** before continuing installation in the existing Banner workflow. Payment does not automatically install or activate ads. Late payments, refunds, credit notes, disputes and invoices manually marked paid without a successful PaymentIntent go to review; affected Banner orders require review before further service work.

## Webhook

Configure a **snapshot** webhook for the same Sandbox account:

```
/api/public/payments/stripe/webhook
```

For local development:

```powershell
stripe listen --forward-to localhost:3317/api/public/payments/stripe/webhook
```

Authenticate the CLI to the same Sandbox first. Save the listener's signing secret privately in the local environment and restart the app. A CLI signing secret differs from a Dashboard endpoint's secret. Follow [Stripe webhook configuration](https://docs.stripe.com/webhooks).

Subscribe to:

```
checkout.session.completed
payment_intent.succeeded
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.voided
invoice.marked_uncollectible
credit_note.created
charge.refunded
charge.dispute.created
refund.updated
refund.failed
```

The handler verifies the original request bytes and timestamp before processing, bounds the body to 1 MiB, rejects live/Connect events and reconciles against Stripe rather than trusting event totals. Event receipts are stored after processing; retries are safe under the shared inventory lock. The invoice verifier inspects [InvoicePayment records](https://docs.stripe.com/api/invoice-payment/list) to distinguish captured payments from manual status changes.

## Recovery

Use **ตรวจสถานะกับ Stripe** for an existing order when webhook delivery is delayed. Retry creation on the same local order after a temporary failure. An uncertain creation older than 23 hours requires an operator to locate its existing Stripe object and reconcile it; do not create a replacement charge. Provider idempotency records are not permanent.

This version does not issue refunds from AURUM. Issue the refund in the Stripe Sandbox Dashboard, then reconcile the existing order. Only a complete set of successful THB refunds matching the captured amount can produce REFUNDED; pending, partial, failed or disputed refunds remain in REVIEW. Banner inventory remains REFUND_REQUIRED until a manager confirms artwork removal using the payment panel. This action checks Stripe again and records the operator, refund amount, reference and closure time before releasing inventory. It does not initiate a refund.

The service worker now supports Stripe recovery when STRIPE_RECONCILIATION_ENABLED=true. Configure SERVICE_WORKER_SECRET and invoke the existing services:worker scheduler every five minutes on staging. A persisted cursor scans five records per run, wraps to include old paid orders for missed refunds, continues after individual failures, and marks the worker DEGRADED when checks fail. Banner failures appear in admin notifications; VIDEO failures appear in the worker result and payment review state. For large backlogs the scan interval is longer than five minutes; inspect worker heartbeats and increase capacity deliberately. This source change does not install a scheduler on the server.

Checkout settlement time comes from a verified paid Checkout event or payment_intent.succeeded event. Recovery searches at most 300 events from Stripe; Stripe retains events for 30 days. If no matching evidence exists, the order is left unchanged and requires investigation rather than guessing a time. Existing recorded paidAt values are preserved. A delayed payment can recover an expired Banner only when its timestamp is within the original hold and no competing reservation exists.

Overdue open invoices with no recorded payment are voided at Stripe before releasing inventory. A concurrent successful payment is re-read and reconciled. Failure to confirm closure retains the reservation. Overdue draft invoices remain drafts at Stripe (auto_advance=false) and cannot be finalized by AURUM. Locally expired payment URLs are hidden; Stripe-associated inventory is not released merely because the local clock passed the hold deadline.

No schema migration is needed for these recovery changes. Keep existing ledger IDs and audit records. For rollback, disable STRIPE_RECONCILIATION_ENABLED to stop the new scheduled recovery while retaining webhook processing and operator reconciliation. Do not downgrade to code that releases Stripe reservations solely by local timeout. The deployment still requires target database verification, backup/restore rehearsal, staged callback delivery and an in-flight-payment rollout plan. R2/media and publishing workers are unchanged.

## Local verification

All migration and integration checks use a dedicated PostgreSQL container bound to `127.0.0.1:55441` and database `aurum_stripe_test`. The scripts refuse other hosts, ports and database names.

The local verification container is named `aurum-stripe-check`. Its records are preserved. Keep it running while the local payment preview is in use; restart it with `docker start aurum-stripe-check` if it has been stopped.

```powershell
$env:DATABASE_URL='postgresql://postgres:aurum_local_test_only@127.0.0.1:55441/aurum_stripe_test'
npx prisma migrate deploy
npx tsx scripts/test-stripe-sandbox.ts
```

The Sandbox test creates clearly labelled test customers, Checkout Sessions and invoices. It uses `pm_card_visa`, refunds its own captured test payment, closes unpaid open test objects and retains database audit records. It does not send email or use production data.

For HTTP checks, start the app on port 3317 with the same isolated database, `AUTH_URL=http://localhost:3317`, `STRIPE_PUBLIC_BASE_URL=http://localhost:3317`, `STRIPE_ENABLED=true`, `STRIPE_SANDBOX_DB_CONFIRMED=true` and `STRIPE_WEBHOOK_SECRET=whsec_local_http_test`. Run `node scripts/test-stripe-http.mjs`. That signing secret is a synthetic test fixture, not a deployed endpoint secret.

After `npm run build`, run `npx tsx scripts/test-stripe-delivery.ts` with the same guarded `DATABASE_URL` to test actual delivery. It starts a Stripe CLI listener and the standalone app, captures the signing secret in memory, verifies externally finalized and voided Sandbox invoices update the local ledger, and stops its own child processes afterward. It does not modify `.env` or `.env.local`. On Windows it discovers the npm CLI shim under `%APPDATA%`; set `STRIPE_CLI_SHIM` to an alternative local shim path when needed.

Verified locally on 7 November 2026:

- Production build, TypeScript checks and targeted lint passed. The existing Banner page retains a Next.js `<img>` lint warning.
- Stripe policy/signature tests passed (9 tests), together with the existing targeted Banner, PromptPay and renewal tests (21 tests).
- `STRIPE_SANDBOX_INTEGRATION_OK`: actual Sandbox Checkout creation/concurrent retry, owner checks, expiry, invoice test-card capture, duplicate event handling, staff Banner acceptance, refund blocking and rejection of manual marked-paid invoices.
- `STRIPE_HTTP_OK`: roles, ownership, origin checks, server-owned price validation, SSR pages and valid/invalid raw-body signatures.
- `STRIPE_REAL_WEBHOOK_DELIVERY_OK`: actual Stripe CLI forwarding into the standalone production build for `invoice.finalized` and `invoice.voided`. The temporary listener secret was kept in memory and the listener was stopped.
- Admin form submission and layout were checked in a browser at desktop and a narrow 500-pixel viewport without horizontal overflow.

These checks do not establish a deployed webhook, production readiness or permission to accept live payments. A real deployed endpoint needs its own signing secret and deployment verification.

Recovery changes verified on 7 November 2026: the full unit suite passed 473 tests before final follow-ups; the final targeted payment/workflow suite passed 29 tests. Actual Sandbox integration verified concurrent webhook deduplication, retained inventory while an invoice remains payable, completed refunds with staff closure, and overdue invoice voiding. Browser HTTP checks rejected member refund-closure actions and manager closure without removal confirmation.

Follow-up verification on 8 November 2026: a fresh standalone production build passed, including TypeScript checks. Real Stripe CLI webhooks updated the ledger on that build. With the listener stopped, the scheduler recovered a separately finalized invoice, persisted its cursor, wrapped on the next run, and voided the overdue invoice without duplicating an order. This used a fresh `aurum_stripe_recovery_test` database on the same loopback-only test container, with all migrations applied there. Missing/invalid worker authorization returned 401. Five scheduler tests verify failure reporting, including HTTP-200 degraded runs. Targeted lint and TypeScript passed. The Docker runner now includes `scripts/service-worker.mjs`; it previously omitted the scheduler entry point. No production migration, remote staging deployment or real charge was performed.

The recovery harness is `npx tsx scripts/test-stripe-delivery.ts --recovery`. It refuses any database except `127.0.0.1:55441/aurum_stripe_recovery_test` and refuses existing Stripe/Banner orders. It creates test invoices, retains evidence and cannot be rerun against the populated database without provisioning a fresh test environment. It does not clear an existing database automatically.

The Linux Docker builder also passed all 480 tests across 62 files, release dependency checks, TypeScript validation and the Next.js production build. The build had no database credentials: prerender queries logged missing `DATABASE_URL`, but all 122 pages were generated. Existing warnings remain for NextAuth/jose Edge runtime imports and the Banner page's `<img>` element. These warnings are not a substitute for staging login and content checks.

The completed image `aurum-stripe-sandbox:review-20261108` passed `scripts/test-stripe-image.mjs` with Docker networking disabled: production health response, packaged scheduler, runnable Prisma CLI, 401 responses for unauthenticated payment/worker requests, no `.env.local`, and no tracker `ip` package in the web runtime. Result: `STRIPE_IMAGE_SMOKE_OK`. Image ID: `sha256:d46dcb711b4da17c6960fb01da9715b8ec791505e80a06fb9569e14184033f62`. This is a locally built candidate, not a deployed release.

## Release boundaries

The additive migration creates `stripe_orders` and `stripe_events`, indexes and restrictive foreign keys. It does not delete existing orders, modify media IDs, move R2 files or alter embed URLs. The wider checkout contains other unreleased payment/member migrations; this migration must not be cherry-picked without its dependencies.

Before staging, rehearse migrations and restoration from a backup of the intended baseline, verify role access, and confirm one video and one Banner payment end to end. Verify externally delivered webhooks and recovery after interrupted requests. No production migration, deployment, restore rehearsal or live charge is covered by the local tests.

For rollback, set `STRIPE_ENABLED=false` to stop new payments while retaining the compatible webhook and reconciliation code for payments already in flight. Keep ledger tables and event receipts. Do not drop payment tables or roll back to a release that cannot reconcile existing Stripe orders. Inventory fulfilment remains staff-controlled. Existing publishing/transcoding workers are outside this change and must not be restarted or drained as part of the payment rollout without their own deployment review.

Before live support is implemented, obtain Stripe's confirmation for the actual business activities, including the video distribution and Banner use cases, and complete account activation. Live support needs a separate account/environment boundary, production webhook configuration, monitoring and scheduled recovery, refund operations, production migration/backup gates and a controlled first-payment rollout. Changing a Sandbox key to a live key is intentionally insufficient.

## Dependency audit

The 8 November review still reports two high-severity entries in one dependency chain (`bittorrent-tracker@11.2.3` → `ip@2.0.1`). [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) lists no patched `ip` release. The installed tracker uses `ip.toString` in its UDP parser, does not call the affected `isPublic`, and AURUM's tracker disables UDP. This limits the identified exposure but does not remove the vulnerable package or make the audit clean. The latest published tracker still depends on it. No major downgrade, unverified fork, forced override or audit suppression was applied. The freshly built standalone web bundle contains neither package. Keep this as an unresolved tracker dependency finding and reassess when changing tracker transports/dependencies or releasing the separate tracker image.

See [Stripe staging setup](STRIPE-STAGING.md) for the account checks and the remaining remote setup.
