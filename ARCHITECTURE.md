# Actor Push completion

The approved scope is actor synchronization on top of commit 3f593ad. MANAGER and HEAD may push; other roles may not. Preserve the existing video workflow and the user's plugin Author change (7LS).

Use the actor external CUID as identity, a per-site remote-ID mapping, server-side credentials, transaction locks and a destination lock. Compare the actual remote payload before writing. Replace or clear the external image URL without creating duplicate attachments. All six measurement/age fields, name, bio, identity and slug participate in comparison.

The destination contract is GET/PUT /wp-json/aurum-video-core/v1/actors/{externalId}. A compatible theme bridge can implement it without a plugin. The bundled optional plugin v1.1.0 provides an independent aurum_actor directory. It does not silently adopt unrelated legacy actor taxonomies by name; those require an explicit adapter/mapping in the WordPress project.

Before a batch, check destination capability and the local mapping schema. Process actors sequentially with per-item status and durable audit intent/outcome. Preserve finished results, support retrying failed actors and stopping queued actors, and block list navigation during a running batch. Request confirmation for 10 or more actors.

Validation: role tests, independent failures, repeated pushes, image changes/removal, malformed destination replies, audit storage failures, concurrent locks and missing migration. Verify actual WordPress HTTP behavior and rendered UI with test fixtures where runtime tools permit. Never blindly retry real video publication as part of this task.

## Actor taxonomy and append-only mode

The `aurum_actor` CPT remains the profile record. AURUM additionally owns the non-rewriting, REST-enabled `aurum_video_actor` taxonomy on WordPress core `post`; video distribution attaches the returned term IDs. This taxonomy must remain independent of the third-party `video_actor` taxonomy. The 123av theme may read both for backward compatibility.

Regular selected/all synchronization calls the idempotent PUT even when the profile payload matches, because PUT is responsible for creating or backfilling the taxonomy term. The separate `create_only` mode is intentionally append-only: if GET finds the external actor identity, no PUT occurs and neither destination content nor local mapping hashes are updated.
