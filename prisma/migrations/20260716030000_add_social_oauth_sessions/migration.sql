-- CreateTable
CREATE TABLE "social_oauth_sessions" (
    "id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "state_hash" TEXT NOT NULL,
    "site_id" TEXT,
    "actor_id" TEXT,
    "pages_enc" TEXT,
    "pages_iv" TEXT,
    "pages_tag" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_oauth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_oauth_sessions_state_hash_key" ON "social_oauth_sessions"("state_hash");

-- CreateIndex
CREATE INDEX "social_oauth_sessions_provider_idx" ON "social_oauth_sessions"("provider");

-- CreateIndex
CREATE INDEX "social_oauth_sessions_actor_id_idx" ON "social_oauth_sessions"("actor_id");

-- CreateIndex
CREATE INDEX "social_oauth_sessions_expires_at_idx" ON "social_oauth_sessions"("expires_at");
