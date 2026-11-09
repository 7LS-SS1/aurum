CREATE TABLE "site_analytics" (
 "site_id" TEXT PRIMARY KEY,
 "snapshot" JSONB,
 "search" JSONB,
 "attempted_at" TIMESTAMP(3),
 "synced_at" TIMESTAMP(3),
 "search_synced_at" TIMESTAMP(3),
 "error" TEXT,
 "search_error" TEXT,
 CONSTRAINT "site_analytics_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
