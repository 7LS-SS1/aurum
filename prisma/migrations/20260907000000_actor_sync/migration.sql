CREATE TABLE "actor_syncs" (
 "actor_id" TEXT NOT NULL REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "site_id" TEXT NOT NULL REFERENCES "target_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "remote_id" INTEGER NOT NULL,
 "payload_hash" TEXT NOT NULL,
 "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("actor_id", "site_id")
);
CREATE UNIQUE INDEX "actor_syncs_site_id_remote_id_key" ON "actor_syncs"("site_id", "remote_id");
