-- DropForeignKey
ALTER TABLE "social_accounts" DROP CONSTRAINT "social_accounts_site_id_fkey";

-- DropForeignKey
ALTER TABLE "social_post_logs" DROP CONSTRAINT "social_post_logs_distribution_id_fkey";

-- DropForeignKey
ALTER TABLE "social_post_logs" DROP CONSTRAINT "social_post_logs_movie_id_fkey";

-- DropForeignKey
ALTER TABLE "social_post_logs" DROP CONSTRAINT "social_post_logs_site_id_fkey";

-- DropForeignKey
ALTER TABLE "social_post_logs" DROP CONSTRAINT "social_post_logs_social_account_id_fkey";

-- DropTable
DROP TABLE "social_accounts";

-- DropTable
DROP TABLE "social_oauth_sessions";

-- DropTable
DROP TABLE "social_post_logs";

-- DropEnum
DROP TYPE "SocialPostStatus";

-- DropEnum
DROP TYPE "SocialProvider";
