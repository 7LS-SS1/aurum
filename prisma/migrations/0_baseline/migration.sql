-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."DistributionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."MovieStatus" AS ENUM ('DRAFT', 'DISTRIBUTING', 'DONE', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "public"."SiteAuthType" AS ENUM ('APP_PASSWORD', 'JWT');

-- CreateEnum
CREATE TYPE "public"."SiteHealth" AS ENUM ('OK', 'ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "public"."distributions" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "status" "public"."DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "remote_post_id" TEXT,
    "remote_post_url" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "distributed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."movie_site_drafts" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT,
    "excerpt" TEXT,
    "content" TEXT,
    "categories" JSONB,
    "tags" JSONB,
    "extra_meta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movie_site_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."movies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "excerpt" TEXT,
    "content" TEXT,
    "main_category" TEXT,
    "categories" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "thumbnail_url" TEXT,
    "video_url" TEXT,
    "video_provider" TEXT,
    "extra_meta" JSONB NOT NULL DEFAULT '{}',
    "status" "public"."MovieStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."target_sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "auth_type" "public"."SiteAuthType" NOT NULL DEFAULT 'APP_PASSWORD',
    "wp_username" TEXT,
    "credential_enc" TEXT NOT NULL,
    "credential_iv" TEXT NOT NULL,
    "credential_tag" TEXT NOT NULL,
    "post_type" TEXT NOT NULL DEFAULT 'posts',
    "category_rest_base" TEXT NOT NULL DEFAULT 'categories',
    "tag_rest_base" TEXT NOT NULL DEFAULT 'tags',
    "default_status" TEXT NOT NULL DEFAULT 'publish',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "health_status" "public"."SiteHealth" NOT NULL DEFAULT 'UNKNOWN',
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "target_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'EDITOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributions_movie_id_idx" ON "public"."distributions"("movie_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "distributions_movie_id_site_id_key" ON "public"."distributions"("movie_id" ASC, "site_id" ASC);

-- CreateIndex
CREATE INDEX "distributions_site_id_idx" ON "public"."distributions"("site_id" ASC);

-- CreateIndex
CREATE INDEX "distributions_status_idx" ON "public"."distributions"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "movie_site_drafts_movie_id_site_id_key" ON "public"."movie_site_drafts"("movie_id" ASC, "site_id" ASC);

-- CreateIndex
CREATE INDEX "movies_created_at_idx" ON "public"."movies"("created_at" ASC);

-- CreateIndex
CREATE INDEX "movies_main_category_idx" ON "public"."movies"("main_category" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "movies_slug_key" ON "public"."movies"("slug" ASC);

-- CreateIndex
CREATE INDEX "movies_status_idx" ON "public"."movies"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."distributions" ADD CONSTRAINT "distributions_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."distributions" ADD CONSTRAINT "distributions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."movie_site_drafts" ADD CONSTRAINT "movie_site_drafts_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."movie_site_drafts" ADD CONSTRAINT "movie_site_drafts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

