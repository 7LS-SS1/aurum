BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "service_page_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "config" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_page_config_pkey" PRIMARY KEY ("id")
);
COMMIT;
