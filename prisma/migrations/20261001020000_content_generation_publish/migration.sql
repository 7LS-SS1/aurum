CREATE TYPE "ContentGenerationPublishStatus" AS ENUM ('NOT_PUBLISHED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

ALTER TABLE "content_generation_items"
  ADD COLUMN "publish_status" "ContentGenerationPublishStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
  ADD COLUMN "publish_error" TEXT,
  ADD COLUMN "publish_attempted_at" TIMESTAMP(3),
  ADD COLUMN "published_by_id" TEXT,
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "published_post_id" TEXT,
  ADD COLUMN "published_post_url" TEXT;

CREATE INDEX "content_generation_items_job_id_publish_status_idx"
  ON "content_generation_items"("job_id", "publish_status");

ALTER TABLE "content_generation_items"
  ADD CONSTRAINT "content_generation_items_published_by_id_fkey"
  FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
