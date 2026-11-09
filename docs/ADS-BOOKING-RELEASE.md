# Advertising orders — implementation and release gates

> Current operational extension: see [SERVICE-OPERATIONS-SETUP.md](SERVICE-OPERATIONS-SETUP.md) and [PROMPTPAY-SETUP.md](PROMPTPAY-SETUP.md). This document records the initial booking release; its historical no-account/no-webhook/no-worker statements below are superseded by those guides. Do not run `test-ads-orders-http.mjs`: it contains legacy broad cleanup. Use the guarded current service-operations/renewal/notification/PromptPay tests.

## Scope

Customer route: /services/ads-banner/book. Admin: /admin/ads-orders.
Customers choose any combination of slots on homepage/video pages, Fixed, Popup and Video Ads, or a bundle, then review the combined total and submit contact/artwork details. Checkout and tracking share the order view. Staff checks and installs artwork AFTER payment, then reports results through the customer order page.

Main inventory is 32 slots: homepage top/bottom and video top/bottom each have L1–L4 and R1–R4. Extra inventory defaults to one per Popup/Fixed-left/Fixed-right/Fixed-bottom/Video Ads position; operators must confirm actual counts in /admin/ads-banner before opening payment. Capacity is configurable up to eight per extra position. Capacity changes are rejected while allocated orders exist.

Whole-site discounts use the approved 30/90/180-day totals. Other placements and bundles multiply their 30-day rate by 1/3/6, without applying whole-site discounts. Server quotes are authoritative; changed amounts require a new customer confirmation. Stored quotes and prices remain unchanged after ordering.

## Payment boundary — not an automatic Gateway integration

No merchant account or approved payment provider has been supplied. Live payment is OFF by default. No real payment was processed. No provider-specific webhook or automatic checkout-session API is implemented or implied.

The implemented bridge accepts a staff-created, order-specific HTTPS hosted payment link only when ADS_PAYMENTS_ENABLED=true and its exact hostname is in the comma-separated ADS_PAYMENT_HOSTS allowlist. It is a manual fallback, not evidence that a merchant has been approved. Secrets/card details are never entered into this app.

Before enabling: obtain provider approval for the actual website/business, confirm currencies/refunds/limits, configure permitted checkout hosts, and complete a sandbox purchase/refund with that provider. Staff must reconcile provider settlement amount and unique transaction reference before marking paid. A browser return or screenshot is not payment proof. The next provider-specific adapter must create sessions using stored order ID/THB amount, verify signed webhooks, compare currency and amount, enforce unique payment events, handle delayed events/retries/refunds and never trust client-reported success.

Until configured, orders are stored in REVIEW (customer label: waiting for payment availability), with no inventory hold and no charge. This is the explicit remaining boundary to the requested fully automatic checkout flow.

## Allocation and fulfillment

- REVIEW → PAYMENT: staff opens a verified hosted payment link, atomically reserves all selected slots for 24 hours.
- PAYMENT → PAID: staff reconciles actual settlement. Payment does not start the advertising clock.
- PAID → ACTIVE: only after artwork review and installation; timestamps are server-generated, expiry exactly 30/90/180 × 24 hours later.
- Expired payment holds are released. Money received after expiry is routed to REFUND_REQUIRED, never activated.
- Expired campaigns now enter a 72-hour GRACE period with artwork and inventory retained. Timely paid renewals retain that hold while awaiting approval; otherwise they move to REMOVAL_REQUIRED after grace. Staff confirms removal before inventory is released. See ADS-RENEWALS.md.
- Failed paid artwork/fulfillment follows REFUND_REQUIRED → REFUNDED after actual refund and removal. This app does not execute financial refunds or modify the WordPress plugin.
- State transitions are transactional and audited. PostgreSQL advisory locking serializes allocations across instances; stale revisions and slot conflicts return 409.
- Customers access their order using a random 256-bit bearer code, stored only as a hash in DB. The browser retains the code in sessionStorage and allows manual entry; no customer account or automatic email/Telegram notification is implemented. Staff reports are visible when the customer refreshes status.

## Data and deployment

Two migrations create ads_orders and allow the removal-pending status. No existing media IDs, ownership, API/embed URLs, subscription settings or WordPress records are modified. The existing settings table uses its separate ads-banner row. API writes are MANAGER+ with trusted-origin and size checks; customer writes are bounded and rate-limited using the existing limiter. In production, configure the shared limiter and trusted proxy headers.

1. Back up the target database, including settings, orders, users and audit logs; verify restore on a separate database.
2. Check the intended target DATABASE_URL without exposing credentials. Run prisma migrate deploy, then prisma generate during build.
3. Deploy with live payment OFF. Keep existing settings/worker deployments intact; worker draining is N/A because no worker/media job contract changes.
4. Canary customer selection/summary, manager access, quote integrity, conflicts, status reports and draft-promotion privacy.
5. Confirm actual extra-slot counts, approved payment provider, fees/tax display and operating refund procedure before payment enablement.
6. Rollback: disable payment and new bookings at the ingress, restore prior application release while retaining ads_orders and audit data. Do not drop tables or restore an old backup over new paid orders. Reconcile outstanding payments and installed campaigns before reopening.

## Local verification

Unit tests cover slot counts, multi-format totals, bundle prices, bad slots and exact approval-day arithmetic. The guarded scripts/test-ads-orders-http.mjs runs only against localhost aurum_ads_test and creates test accounts/orders; it must never target production. It covers real credential login, role/origin gates, retries, concurrent allocation, amount mismatch, stale revisions, payment/activation timing, removal, late-payment refund and audit persistence.

Browser validation on the isolated local server confirmed selecting homepage + Popup + Video Ads yields 22,500 THB and advances to the summary. Narrow viewport content did not overflow (375 CSS pixels reported). No external checkout, automatic webhook, live WordPress installation or production deployment was tested.

All 28 migrations applied successfully to disposable PostgreSQL 17. A pg_dump restore into a separate local database retained order records. The real project DATABASE_URL points to a remote database and was not migrated. Isolated test-server startup must explicitly blank UPSTASH_REDIS_REST_URL/TOKEN to avoid sharing the normal environment's request-limit counters.
