-- CreateEnum
CREATE TYPE "SiteSyncJobStatus" AS ENUM ('QUEUED', 'SCANNING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SiteSyncLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "site_sync_jobs" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "status" "SiteSyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT NOT NULL DEFAULT 'queued',
    "total_movies" INTEGER NOT NULL DEFAULT 0,
    "scanned_movies" INTEGER NOT NULL DEFAULT 0,
    "matched_movies" INTEGER NOT NULL DEFAULT 0,
    "skipped_movies" INTEGER NOT NULL DEFAULT 0,
    "queued_movies" INTEGER NOT NULL DEFAULT 0,
    "processed_movies" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "active_site_id" TEXT,
    "locked_by" TEXT,
    "locked_until" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_sync_job_logs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "level" "SiteSyncLogLevel" NOT NULL DEFAULT 'INFO',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "movie_id" TEXT,
    "remote_post_id" TEXT,
    "remote_post_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_sync_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_sync_jobs_active_site_id_key" ON "site_sync_jobs"("active_site_id");

-- CreateIndex
CREATE INDEX "site_sync_jobs_site_id_idx" ON "site_sync_jobs"("site_id");

-- CreateIndex
CREATE INDEX "site_sync_jobs_status_idx" ON "site_sync_jobs"("status");

-- CreateIndex
CREATE INDEX "site_sync_jobs_heartbeat_at_idx" ON "site_sync_jobs"("heartbeat_at");

-- CreateIndex
CREATE INDEX "site_sync_jobs_locked_until_idx" ON "site_sync_jobs"("locked_until");

-- CreateIndex
CREATE INDEX "site_sync_job_logs_job_id_created_at_idx" ON "site_sync_job_logs"("job_id", "created_at");

-- AddForeignKey
ALTER TABLE "site_sync_jobs" ADD CONSTRAINT "site_sync_jobs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_sync_jobs" ADD CONSTRAINT "site_sync_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_sync_job_logs" ADD CONSTRAINT "site_sync_job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "site_sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
