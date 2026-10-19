CREATE TABLE "wordpress_plugins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "package_url" TEXT NOT NULL,
    "package_size" INTEGER,
    "checksum_sha256" TEXT NOT NULL,
    "requires_wordpress" TEXT,
    "tested_wordpress" TEXT,
    "requires_php" TEXT,
    "changelog" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wordpress_plugins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wordpress_plugins_slug_version_key" ON "wordpress_plugins"("slug", "version");
CREATE INDEX "wordpress_plugins_slug_is_active_idx" ON "wordpress_plugins"("slug", "is_active");
CREATE INDEX "wordpress_plugins_created_at_idx" ON "wordpress_plugins"("created_at");

ALTER TABLE "wordpress_plugins"
ADD CONSTRAINT "wordpress_plugins_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
