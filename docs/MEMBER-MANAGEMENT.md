# Member management release

`/admin/members` and `/api/members` require MANAGER or HEAD. Customer accounts remain separate from staff accounts. Lists are paginated; detail shows linked advertising orders and their existing audit timeline. Email verification is explicitly unavailable, not inferred from registration. Internal notes never enter public profile responses.

Suspension invalidates existing sessions and blocks new email/phone sessions. It does not cancel, delete, refund, or alter orders/contracts. Updates require an explanation, enforce revision checks, and atomically write the account change and audit event. No account deletion or password editing is provided.

## Release gates

- Apply additive migration `20261105010000_member_management` before running the new application and regenerate Prisma Client. Defaults preserve all existing customers as active; IDs, ownership, orders and media remain unchanged.
- Back up the production database and verify restoration into an isolated database before release. Neither backup nor production migration is performed by this change.
- Canary: test MANAGER access, STAFF denial, search, order history, and suspension/reactivation using a dedicated test customer. Confirm paid orders and running distribution jobs remain unchanged.
- Worker draining: no worker protocol or queue changes; no draining required for this UI/member change. Do not stop existing distribution jobs during release.
- Rollback: keep additive columns/data. Application rollback to an older version loses suspension enforcement; do not roll back authentication code while suspended accounts must remain blocked. Fix forward or keep member access unavailable until enforcement is restored.
- Target-site controls reuse existing create, health, category, sync, and activation APIs. No site credentials, destination IDs or embed/API contracts are migrated. No remote WordPress/Bunny mutations are needed to validate layout and filtering.
