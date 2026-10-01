-- CreateEnum
CREATE TYPE "ContentGenerationJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentGenerationItemStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentGenerationLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "content_generation_jobs" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ContentGenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "processed_items" INTEGER NOT NULL DEFAULT 0,
    "ready_items" INTEGER NOT NULL DEFAULT 0,
    "approved_items" INTEGER NOT NULL DEFAULT 0,
    "rejected_items" INTEGER NOT NULL DEFAULT 0,
    "failed_items" INTEGER NOT NULL DEFAULT 0,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "locked_by" TEXT,
    "locked_until" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "requested_by_id" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_generation_items" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "ContentGenerationItemStatus" NOT NULL DEFAULT 'QUEUED',
    "source_title" TEXT NOT NULL,
    "source_description" TEXT NOT NULL DEFAULT '',
    "source_categories" JSONB NOT NULL DEFAULT '[]',
    "source_tags" JSONB NOT NULL DEFAULT '[]',
    "source_actors" JSONB NOT NULL DEFAULT '[]',
    "source_fingerprint" TEXT NOT NULL,
    "generated_title_short" TEXT,
    "generated_title_long" TEXT,
    "generated_description_short" TEXT,
    "generated_description_long" TEXT,
    "focus_keyword" TEXT,
    "draft_title" TEXT,
    "draft_description" TEXT,
    "draft_focus_keyword" TEXT,
    "draft_fingerprint" TEXT,
    "approved_title_normalized" TEXT,
    "trend_keywords" JSONB NOT NULL DEFAULT '[]',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 4,
    "next_retry_at" TIMESTAMP(3),
    "error_message" TEXT,
    "generated_at" TIMESTAMP(3),
    "last_edited_by_id" TEXT,
    "last_edited_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_generation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_generation_job_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "item_id" TEXT,
    "level" "ContentGenerationLogLevel" NOT NULL DEFAULT 'INFO',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_generation_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_generation_jobs_idempotency_key_key" ON "content_generation_jobs"("idempotency_key");
CREATE INDEX "content_generation_jobs_status_created_at_idx" ON "content_generation_jobs"("status", "created_at");
CREATE INDEX "content_generation_jobs_locked_until_idx" ON "content_generation_jobs"("locked_until");
CREATE INDEX "content_generation_jobs_heartbeat_at_idx" ON "content_generation_jobs"("heartbeat_at");
CREATE UNIQUE INDEX "content_generation_items_idempotency_key_key" ON "content_generation_items"("idempotency_key");
CREATE UNIQUE INDEX "content_generation_items_job_id_movie_id_site_id_key" ON "content_generation_items"("job_id", "movie_id", "site_id");
CREATE UNIQUE INDEX "content_generation_items_site_id_approved_title_normalized_key" ON "content_generation_items"("site_id", "approved_title_normalized");
CREATE INDEX "content_generation_items_job_id_status_next_retry_at_idx" ON "content_generation_items"("job_id", "status", "next_retry_at");
CREATE INDEX "content_generation_items_movie_id_site_id_idx" ON "content_generation_items"("movie_id", "site_id");
CREATE INDEX "content_generation_items_site_id_draft_title_idx" ON "content_generation_items"("site_id", "draft_title");
CREATE INDEX "content_generation_job_logs_job_id_created_at_idx" ON "content_generation_job_logs"("job_id", "created_at");
CREATE INDEX "content_generation_job_logs_item_id_idx" ON "content_generation_job_logs"("item_id");

-- AddForeignKey
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_last_edited_by_id_fkey" FOREIGN KEY ("last_edited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_generation_items" ADD CONSTRAINT "content_generation_items_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_generation_job_logs" ADD CONSTRAINT "content_generation_job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "content_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_generation_job_logs" ADD CONSTRAINT "content_generation_job_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "content_generation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
