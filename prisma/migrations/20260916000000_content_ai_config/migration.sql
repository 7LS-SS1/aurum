CREATE TABLE "content_ai_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT NOT NULL,
  "apiKeyEnc" TEXT NOT NULL,
  "apiKeyIv" TEXT NOT NULL,
  "apiKeyTag" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_ai_config_pkey" PRIMARY KEY ("id")
);
