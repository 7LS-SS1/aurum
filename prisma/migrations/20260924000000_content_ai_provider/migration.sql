ALTER TABLE "content_ai_config"
  ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'openai';

ALTER TABLE "content_ai_config"
  DROP CONSTRAINT IF EXISTS "content_ai_config_provider_check";

ALTER TABLE "content_ai_config"
  ADD CONSTRAINT "content_ai_config_provider_check" CHECK ("provider" IN ('openai', 'grok'));
