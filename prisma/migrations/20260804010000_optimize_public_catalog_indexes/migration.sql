CREATE INDEX "movies_status_created_at_idx" ON "movies"("status", "created_at" DESC);
CREATE INDEX "movies_status_main_category_created_at_idx" ON "movies"("status", "main_category", "created_at" DESC);
CREATE INDEX "movies_status_updated_at_idx" ON "movies"("status", "updated_at" DESC);
