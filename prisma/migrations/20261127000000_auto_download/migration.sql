CREATE TYPE "AutoDownloadStatus" AS ENUM ('QUEUED', 'DOWNLOADING', 'DONE', 'FAILED');

CREATE TABLE "auto_download_jobs" (
  "id" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "thumbnail_url" TEXT,
  "title" TEXT NOT NULL,
  "main_category" TEXT NOT NULL,
  "categories" JSONB NOT NULL DEFAULT '[]',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "status" "AutoDownloadStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "bytes" BIGINT,
  "movie_id" TEXT,
  "created_by_id" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auto_download_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_download_jobs_movie_id_key" ON "auto_download_jobs"("movie_id");
CREATE INDEX "auto_download_jobs_status_created_at_idx" ON "auto_download_jobs"("status", "created_at");
