-- Additive, backward-compatible: nullable column, no data loss, no rewrite of
-- existing actor_syncs rows. Existing rows keep term_id = NULL until the
-- actor is re-synced (Push again in /admin/actors), which backfills it.
ALTER TABLE "actor_syncs" ADD COLUMN "term_id" INTEGER;
