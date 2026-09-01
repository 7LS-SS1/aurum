-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "height_cm" INTEGER,
    "weight_kg" INTEGER,
    "measurement_bust" TEXT,
    "measurement_waist" TEXT,
    "measurement_hip" TEXT,
    "bio" TEXT,
    "profile_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MovieToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MovieToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ActorToMovie" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ActorToMovie_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "_MovieToTag_B_index" ON "_MovieToTag"("B");

-- CreateIndex
CREATE INDEX "_ActorToMovie_B_index" ON "_ActorToMovie"("B");

-- AddForeignKey
ALTER TABLE "_MovieToTag" ADD CONSTRAINT "_MovieToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MovieToTag" ADD CONSTRAINT "_MovieToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActorToMovie" ADD CONSTRAINT "_ActorToMovie_A_fkey" FOREIGN KEY ("A") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ActorToMovie" ADD CONSTRAINT "_ActorToMovie_B_fkey" FOREIGN KEY ("B") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: backfill the "tags" table from every distinct string already
-- present in movies.tags (Json array), then link each movie to its tags via
-- the implicit join table, before the old Json column is dropped below.
INSERT INTO "tags" ("id", "name", "created_at")
SELECT gen_random_uuid()::text, distinct_tag.value, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT jsonb_array_elements_text(tags) AS value FROM "movies" WHERE tags IS NOT NULL) AS distinct_tag
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "_MovieToTag" ("A", "B")
SELECT DISTINCT m.id, t.id
FROM "movies" m, jsonb_array_elements_text(m.tags) AS tag_value
JOIN "tags" t ON t.name = tag_value
WHERE m.tags IS NOT NULL;

-- AlterTable
ALTER TABLE "movies" DROP COLUMN "tags";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_movie_id_fkey";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_viewer_id_fkey";

-- DropTable
DROP TABLE "comments";
