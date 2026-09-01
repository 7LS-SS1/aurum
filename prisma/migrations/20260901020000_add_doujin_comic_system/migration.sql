-- CreateEnum
CREATE TYPE "ComicType" AS ENUM ('MANGA', 'DOUJIN');

-- CreateEnum
CREATE TYPE "ComicStatus" AS ENUM ('ONGOING', 'COMPLETED', 'HIATUS');

-- CreateTable
CREATE TABLE "comic_series" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comic_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "alt_titles" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "author_name" TEXT,
    "comic_type" "ComicType" NOT NULL DEFAULT 'DOUJIN',
    "status" "ComicStatus" NOT NULL DEFAULT 'ONGOING',
    "is_one_shot" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "cover_object_key" TEXT,
    "series_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comic_chapters" (
    "id" TEXT NOT NULL,
    "comic_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comic_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comic_chapter_images" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comic_chapter_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comic_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comic_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comic_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comic_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ComicToComicCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ComicToComicCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ComicToComicTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ComicToComicTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "comic_series_slug_key" ON "comic_series"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "comics_slug_key" ON "comics"("slug");

-- CreateIndex
CREATE INDEX "comics_comic_type_idx" ON "comics"("comic_type");

-- CreateIndex
CREATE INDEX "comics_status_idx" ON "comics"("status");

-- CreateIndex
CREATE INDEX "comics_series_id_idx" ON "comics"("series_id");

-- CreateIndex
CREATE INDEX "comics_created_at_idx" ON "comics"("created_at");

-- CreateIndex
CREATE INDEX "comic_chapters_comic_id_idx" ON "comic_chapters"("comic_id");

-- CreateIndex
CREATE INDEX "comic_chapter_images_chapter_id_sort_order_idx" ON "comic_chapter_images"("chapter_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "comic_categories_name_key" ON "comic_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "comic_tags_name_key" ON "comic_tags"("name");

-- CreateIndex
CREATE INDEX "_ComicToComicCategory_B_index" ON "_ComicToComicCategory"("B");

-- CreateIndex
CREATE INDEX "_ComicToComicTag_B_index" ON "_ComicToComicTag"("B");

-- AddForeignKey
ALTER TABLE "comics" ADD CONSTRAINT "comics_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "comic_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comics" ADD CONSTRAINT "comics_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comic_chapters" ADD CONSTRAINT "comic_chapters_comic_id_fkey" FOREIGN KEY ("comic_id") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comic_chapter_images" ADD CONSTRAINT "comic_chapter_images_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "comic_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComicToComicCategory" ADD CONSTRAINT "_ComicToComicCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComicToComicCategory" ADD CONSTRAINT "_ComicToComicCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "comic_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComicToComicTag" ADD CONSTRAINT "_ComicToComicTag_A_fkey" FOREIGN KEY ("A") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ComicToComicTag" ADD CONSTRAINT "_ComicToComicTag_B_fkey" FOREIGN KEY ("B") REFERENCES "comic_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

