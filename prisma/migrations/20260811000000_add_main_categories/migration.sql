-- CreateTable
CREATE TABLE "main_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "main_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_categories_name_key" ON "main_categories"("name");

-- AlterTable
ALTER TABLE "target_sites" ADD COLUMN "main_categories" JSONB NOT NULL DEFAULT '[]';

-- Seed the two main categories the upload wizard requires today. Fixed ids
-- (not gen_random_uuid()) so this migration is deterministic/idempotent-safe
-- across environments, matching the seed-site-demo/seed-movie-demo pattern
-- used in prisma/seed.ts.
INSERT INTO "main_categories" ("id", "name") VALUES
    ('main-category-clip-leak', 'คลิปหลุด'),
    ('main-category-av', 'AV')
ON CONFLICT ("name") DO NOTHING;
