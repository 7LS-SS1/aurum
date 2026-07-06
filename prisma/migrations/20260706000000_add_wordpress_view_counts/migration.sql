ALTER TABLE "movies" ADD COLUMN "wp_view_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "distributions"
ADD COLUMN "remote_view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "engagement_synced_at" TIMESTAMP(3);
