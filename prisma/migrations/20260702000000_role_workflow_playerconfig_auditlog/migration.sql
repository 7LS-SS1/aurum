-- AlterEnum: MovieStatus gains the review/approval workflow states and
-- renames DISTRIBUTING -> PUBLISHING. Existing DISTRIBUTING rows (if any) are
-- explicitly remapped rather than relying on a same-name text cast, which
-- would fail since the label no longer exists in the new type.
BEGIN;
CREATE TYPE "MovieStatus_new" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'IN_REVIEW', 'REJECTED', 'READY_FOR_APPROVAL', 'APPROVED', 'PUBLISHING', 'DONE', 'PARTIAL', 'FAILED', 'ARCHIVED');
ALTER TABLE "public"."movies" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "movies" ALTER COLUMN "status" TYPE "MovieStatus_new" USING (
  CASE "status"::text
    WHEN 'DISTRIBUTING' THEN 'PUBLISHING'
    ELSE "status"::text
  END
)::"MovieStatus_new";
ALTER TYPE "MovieStatus" RENAME TO "MovieStatus_old";
ALTER TYPE "MovieStatus_new" RENAME TO "MovieStatus";
DROP TYPE "public"."MovieStatus_old";
ALTER TABLE "movies" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterEnum: Role expands from ADMIN/EDITOR to the 5-role model.
-- ADMIN -> HEAD, EDITOR -> STAFF (confirmed data-migration mapping).
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('STAFF', 'SENIOR', 'MANAGER', 'HEAD', 'SYSTEM');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'HEAD'
    WHEN 'EDITOR' THEN 'STAFF'
    ELSE "role"::text
  END
)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';
COMMIT;

-- AlterTable
ALTER TABLE "movies" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "jwplayer_media_id" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewer_id" TEXT,
ADD COLUMN     "target_site_ids" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_role" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'JWPLAYER',
    "name" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "library_url" TEXT,
    "api_key_enc" TEXT NOT NULL,
    "api_key_iv" TEXT NOT NULL,
    "api_key_tag" TEXT NOT NULL,
    "api_secret_enc" TEXT,
    "api_secret_iv" TEXT,
    "api_secret_tag" TEXT,
    "default_poster_mode" TEXT NOT NULL DEFAULT 'auto',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "extra_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "movies_created_by_id_idx" ON "movies"("created_by_id");

-- AddForeignKey
ALTER TABLE "movies" ADD CONSTRAINT "movies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movies" ADD CONSTRAINT "movies_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
