# Manual bank-transfer release notes

Branch: codex/release-20261109-services

## Data and compatibility
- No Prisma schema migration. Account, ledger and duplicate-reference records use namespaced ServicePageConfig rows; AdsOrder.quote stores the transfer state.
- Existing order IDs, financial records, media and Stripe/PromptPay transactions remain intact. New manual transfers cannot also start a gateway payment.
- Uploading evidence does not confirm payment. Staff must reconcile actual bank funds, amount, date and bank transaction reference. Image hashing detects identical bytes, not altered duplicate slips.
- Closing an account disables new selections immediately. Evidence for prior transfers remains reviewable. After 30 days the worker removes bank identity and private QR data; ledger and order history remain. Purging processes one due account per execution and retries storage failures.
- The ledger represents entries recorded in AURUM; it is not an automatically imported bank statement. Manual entries do not transfer money or mark orders paid.
- USDT network cards are informational and disabled; no wallet or crypto payment integration exists.

## Deployment gates
1. Back up the production database (including ServicePageConfig and AdsOrder) and verify the restore destination. Preserve private attachment storage.
2. Deploy web and service worker from the same revision. No migration command is needed. Existing worker schedule must remain active for expiry and account purging.
3. Verify private QR/slip upload and owner-only access in the target environment. Never place financial evidence in the public media library.
4. Add the intended receiving account and verify its number, name and QR manually. Run a controlled order through selection, evidence submission, staff reconciliation and ledger entry before general use.
5. Verify closed accounts cannot be selected and worker executions succeed. Unit tests cover the 30-day boundary; production scheduler and R2 deletion are not established by those tests.
6. Before rollback, stop new manual-transfer orders and review/drain pending transfers. Keep all records and attachments; an older application may not expose their review UI. Do not roll back the database by discarding financial records.

## Validation scope
Automated tests cover state transitions, access checks, duplicate evidence/reference rejection, stale revisions, expiry/refund routing and account purging. Local mocked-browser previews cover checkout and account creation. Actual bank reconciliation, production R2, database concurrency and live scheduled execution require deployment verification.

## Local runtime verification (2026-11-11)
- Isolated PostgreSQL container: aurum-bank-local-20261111, loopback port 55448, database aurum_bank_local. No production database copy or credentials are used.
- App: http://localhost:3323. Start with `node scripts/dev-bank-local.mjs`; schema setup is `node scripts/dev-bank-local.mjs schema` and HTTP regression is `node scripts/dev-bank-local.mjs test`.
- Launcher blanks application environment-file settings and disables gateways, outbound email and R2; evidence is stored in artifacts/bank-local-uploads. This launcher is local-only, never a deployment entrypoint.
- HTTP tests passed against actual PostgreSQL: login, private QR upload/access, account creation, order creation, transfer selection, evidence submission, concurrent confirmation (one success and one conflict, exactly one income entry), manual expense and immediate closed-account rejection.
- Browser verification passed for admin/customer sign-in, account details, transfer account selection, file chooser upload and submission. Customer showed PAYMENT_REVIEW and admin listed the same slip. That second order remains pending for hands-on review.
- Evidence: artifacts/bank-local-result.json and artifacts/bank-local-review.jpg. Test files say NOT PAYMENT; no actual funds moved.
- Production R2, live scheduler and bank reconciliation remain unverified. The 30-day purge boundary is unit-tested, not elapsed-time tested in production.
