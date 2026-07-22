-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('FACEBOOK', 'X', 'INSTAGRAM', 'TELEGRAM', 'LINE', 'TIKTOK');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "display_name" TEXT NOT NULL,
    "target_ref" TEXT,
    "credential_enc" TEXT NOT NULL,
    "credential_iv" TEXT NOT NULL,
    "credential_tag" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_logs" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "social_account_id" TEXT NOT NULL,
    "distribution_id" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'PENDING',
    "remote_post_id" TEXT,
    "remote_post_url" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_post_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_accounts_site_id_idx" ON "social_accounts"("site_id");

-- CreateIndex
CREATE INDEX "social_accounts_provider_idx" ON "social_accounts"("provider");

-- CreateIndex
CREATE INDEX "social_post_logs_movie_id_idx" ON "social_post_logs"("movie_id");

-- CreateIndex
CREATE INDEX "social_post_logs_site_id_idx" ON "social_post_logs"("site_id");

-- CreateIndex
CREATE INDEX "social_post_logs_social_account_id_idx" ON "social_post_logs"("social_account_id");

-- CreateIndex
CREATE INDEX "social_post_logs_status_idx" ON "social_post_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_logs_movie_id_social_account_id_key" ON "social_post_logs"("movie_id", "social_account_id");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_logs" ADD CONSTRAINT "social_post_logs_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_logs" ADD CONSTRAINT "social_post_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_logs" ADD CONSTRAINT "social_post_logs_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_logs" ADD CONSTRAINT "social_post_logs_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
