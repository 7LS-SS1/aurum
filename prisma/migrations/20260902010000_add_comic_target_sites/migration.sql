-- CreateTable
CREATE TABLE "comic_target_sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "auth_type" "SiteAuthType" NOT NULL DEFAULT 'APP_PASSWORD',
    "wp_username" TEXT,
    "credential_enc" TEXT NOT NULL,
    "credential_iv" TEXT NOT NULL,
    "credential_tag" TEXT NOT NULL,
    "post_type" TEXT NOT NULL DEFAULT 'posts',
    "category_rest_base" TEXT NOT NULL DEFAULT 'categories',
    "tag_rest_base" TEXT NOT NULL DEFAULT 'tags',
    "default_status" TEXT NOT NULL DEFAULT 'publish',
    "comic_types" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "health_status" "SiteHealth" NOT NULL DEFAULT 'UNKNOWN',
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comic_target_sites_pkey" PRIMARY KEY ("id")
);
