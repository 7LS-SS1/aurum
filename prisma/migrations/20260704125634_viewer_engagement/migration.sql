-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'DISLIKE');

-- AlterTable
ALTER TABLE "movies" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "viewers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewer_sessions" (
    "id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_reactions" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movie_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_laters" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_laters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viewers_email_key" ON "viewers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "viewer_sessions_token_hash_key" ON "viewer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "viewer_sessions_viewer_id_idx" ON "viewer_sessions"("viewer_id");

-- CreateIndex
CREATE INDEX "viewer_sessions_expires_at_idx" ON "viewer_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "movie_reactions_movie_id_type_idx" ON "movie_reactions"("movie_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "movie_reactions_movie_id_viewer_id_key" ON "movie_reactions"("movie_id", "viewer_id");

-- CreateIndex
CREATE INDEX "watch_laters_viewer_id_idx" ON "watch_laters"("viewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "watch_laters_movie_id_viewer_id_key" ON "watch_laters"("movie_id", "viewer_id");

-- CreateIndex
CREATE INDEX "comments_movie_id_created_at_idx" ON "comments"("movie_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_viewer_id_idx" ON "comments"("viewer_id");

-- AddForeignKey
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_reactions" ADD CONSTRAINT "movie_reactions_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_reactions" ADD CONSTRAINT "movie_reactions_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_laters" ADD CONSTRAINT "watch_laters_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_laters" ADD CONSTRAINT "watch_laters_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
