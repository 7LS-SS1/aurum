-- CreateEnum
CREATE TYPE "SourceAdapter" AS ENUM ('HTML_RECIPE', 'JSON_CATALOG', 'AUTO');

-- CreateEnum
CREATE TYPE "SourceControl" AS ENUM ('RUN', 'PAUSE', 'STOP');

-- CreateEnum
CREATE TYPE "SourcePageState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceItemState" AS ENUM ('PENDING', 'RESOLVING', 'DOWNLOADING', 'DONE', 'FAILED', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "video_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "allowedHosts" JSONB NOT NULL,
    "adapter" "SourceAdapter" NOT NULL,
    "recipe" JSONB NOT NULL,
    "recipeVersion" INTEGER NOT NULL DEFAULT 1,
    "control" "SourceControl" NOT NULL DEFAULT 'STOP',
    "stopVersion" INTEGER NOT NULL DEFAULT 0,
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "requestIntervalMs" INTEGER NOT NULL DEFAULT 1000,
    "maxPagesPerRun" INTEGER NOT NULL DEFAULT 10,
    "maxItemsTotal" INTEGER NOT NULL DEFAULT 1000,
    "maxFileBytes" BIGINT NOT NULL DEFAULT 4294967296,
    "mainCategory" TEXT NOT NULL,
    "defaultTags" JSONB NOT NULL DEFAULT '[]',
    "scanComplete" BOOLEAN NOT NULL DEFAULT false,
    "nextScanAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScanAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_pages" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "state" "SourcePageState" NOT NULL DEFAULT 'PENDING',
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "errorCode" TEXT,
    "claimToken" TEXT,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "coverUrl" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "categories" JSONB NOT NULL DEFAULT '[]',
    "state" "SourceItemState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "errorCode" TEXT,
    "bytes" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "movieId" TEXT,
    "claimToken" TEXT,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_events" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "itemId" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_leases" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanner_worker_status" (
    "id" TEXT NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "freeBytes" BIGINT,
    "totalBytes" BIGINT,

    CONSTRAINT "scanner_worker_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_sources_control_nextScanAt_idx" ON "video_sources"("control", "nextScanAt");

-- CreateIndex
CREATE INDEX "source_pages_sourceId_state_retryAt_idx" ON "source_pages"("sourceId", "state", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_pages_sourceId_url_key" ON "source_pages"("sourceId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "source_items_movieId_key" ON "source_items"("movieId");

-- CreateIndex
CREATE INDEX "source_items_sourceId_state_retryAt_idx" ON "source_items"("sourceId", "state", "retryAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_items_sourceId_externalId_key" ON "source_items"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "source_events_sourceId_at_idx" ON "source_events"("sourceId", "at");

-- AddForeignKey
ALTER TABLE "source_pages" ADD CONSTRAINT "source_pages_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "video_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "video_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "video_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
