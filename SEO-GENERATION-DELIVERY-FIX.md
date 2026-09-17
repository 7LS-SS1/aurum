# SEO generation delivery fix

Date: 18 September 2026 (Asia/Bangkok)

## Verified problem

A read-only audit against the database configured by this checkout found 44 Distribution rows with `seo_generation_validation_failed`. The latest failures match the resync job shown by the user. The 20 inspected samples had no `remotePostId`. Source tracing confirms this error is thrown before WordPress creation; the absence of a stored ID alone does not prove that no matching post exists remotely.

The automatic new-video and resync paths both call `ensureSiteSeo()` before `createPost()`. Three generated responses that failed local validation caused the whole destination to fail even though SEO is supplemental to playback delivery. The old error discarded the final validation reason, leaving every cause as the same generic code.

## Change

- Preserve a bounded reason code after all three validation attempts. Generated text, prompts, API keys and provider bodies are never placed in the error or logs.
- Add string-length constraints to Structured Outputs for standard models. Fine-tuned model schemas remain compatible and use the same application validation after response.
- Send the previous reason as retry feedback so the next attempt can correct the relevant field.
- Automatic publish/resync treats only a recognized SEO validation result as optional enrichment. It keeps the invalid AI response out of MovieSiteDraft, publishes the original AURUM title/content/video identity, returns a warning, and records `published_with_warnings`.
- OpenAI connection, HTTP, quota/rate limit, incomplete response, refusal, source-change, WordPress identity and WordPress metadata-verification failures still fail closed.
- Manually requested SEO generation remains strict and now reports an actionable Thai message.
- A manual per-site draft bypasses automatic generation and retains editorial content.
- Automatic oversized tags are ignored when another usable keyword exists; if none exists, publication falls back with a review warning instead of storing bad SEO.

Existing failed rows are not altered by the audit or source change. After this application version is deployed, run resync again: the identity checks will reconcile existing AURUM posts first and only missing videos will be created. The 44 rows should change to success or another concrete, non-SEO-validation error; verify WordPress post IDs and the warning count before declaring completion.

## Validation

- 27 Vitest files / 321 tests passed.
- Focused SEO, distributor and resync suites: 83 tests passed.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- Next.js production build completed with exit 0. During page-data collection, database queries reported inability to reach `pooled.db.prisma.io:5432`; the build handled those reads and finished. This is not evidence of healthy database-backed runtime.
- The database audit was read-only. No Distribution, draft, job, movie or WordPress post was changed.
- Deployment, post-deploy resync and live WordPress creation remain separate from source validation.

## Diagnostic limit and deployment

The original log records only the generic validation code, so the exact rejected field for the historical 44 failures cannot be recovered from those logs. The new version records a safe field/reason code for future attempts. No live AI generation was invoked in this investigation.

This correction belongs to **Project AURUM**, not to the WordPress ZIP. Updating AURUM Video Core alone does not deploy this fix. Deploy the updated application and verify database connectivity before retrying the failed jobs. The WordPress identity and media read-back checks still determine whether publication actually succeeded.

Official reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). The JSON schema controls structure and supported length constraints; application validation still checks the original-title anchor, uniqueness and keyword presence. Refusals are handled separately and do not trigger the source-data fallback.

## Delivery status

- Source validation completed on 18 September 2026: focused suites 83/83, full suite 321/321, TypeScript, changed-file ESLint, `git diff --check`, and the Next.js production build passed.
- This change requires no Prisma migration and no WordPress plugin update.
- Production deployment and the post-deploy resync of the existing 44 failed rows remain operational steps; their results must be verified from the live job log and WordPress post IDs.
