ALTER TABLE "content_ai_config"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';

ALTER TABLE "content_ai_config"
  ADD CONSTRAINT "content_ai_config_provider_check" CHECK ("provider" IN ('openai', 'grok'));
