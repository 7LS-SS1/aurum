CREATE TABLE "wordpress_themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "package_url" TEXT NOT NULL,
    "package_size" INTEGER,
    "screenshot_url" TEXT,
    "changelog" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wordpress_themes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wordpress_themes_slug_version_key" ON "wordpress_themes"("slug", "version");
CREATE INDEX "wordpress_themes_slug_is_active_idx" ON "wordpress_themes"("slug", "is_active");
CREATE INDEX "wordpress_themes_created_at_idx" ON "wordpress_themes"("created_at");

ALTER TABLE "wordpress_themes" ADD CONSTRAINT "wordpress_themes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
