ALTER TABLE "ads_orders" ADD COLUMN "fulfillmentStage" TEXT NOT NULL DEFAULT 'queued', ADD COLUMN "assignedTo" TEXT, ADD COLUMN "assignedName" TEXT, ADD COLUMN "dueAt" TIMESTAMP(3), ADD COLUMN "installationProof" JSONB, ADD COLUMN "currentArtwork" JSONB, ADD COLUMN "refundAmount" INTEGER, ADD COLUMN "refundReference" TEXT, ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_fulfillment_stage" CHECK ("fulfillmentStage" IN ('queued','installing','review','approved'));
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_refund_amount" CHECK ("refundAmount" IS NULL OR ("refundAmount" >= 0 AND "refundAmount" <= "amount"));
CREATE UNIQUE INDEX "ads_orders_refundReference_key" ON "ads_orders"("refundReference");
CREATE INDEX "ads_orders_fulfillmentStage_dueAt_idx" ON "ads_orders"("fulfillmentStage", "dueAt");
ALTER TABLE "viewers" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE TABLE "ads_ticket_messages" (
 "id" TEXT PRIMARY KEY, "ticketId" TEXT NOT NULL REFERENCES "ads_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "requestId" TEXT NOT NULL UNIQUE, "role" TEXT NOT NULL, "authorId" TEXT NOT NULL, "message" TEXT NOT NULL, "files" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ads_ticket_messages_ticketId_createdAt_idx" ON "ads_ticket_messages"("ticketId", "createdAt");
CREATE TABLE "ads_artwork_requests" (
 "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "ads_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestId" TEXT NOT NULL UNIQUE, "slot" TEXT NOT NULL, "fileId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "targetUrl" TEXT NOT NULL, "note" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','APPROVED','INSTALLED','REJECTED')), "response" TEXT NOT NULL DEFAULT '', "proofUrl" TEXT,
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ads_artwork_requests_orderId_status_idx" ON "ads_artwork_requests"("orderId", "status");
CREATE UNIQUE INDEX "ads_artwork_one_pending_slot" ON "ads_artwork_requests"("orderId", "slot") WHERE "status" IN ('OPEN','APPROVED');
CREATE TABLE "customer_notices" (
 "id" TEXT PRIMARY KEY, "viewerId" TEXT NOT NULL REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "dedupeKey" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL, "message" TEXT NOT NULL, "href" TEXT NOT NULL, "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "customer_notices_viewerId_createdAt_idx" ON "customer_notices"("viewerId", "createdAt");
CREATE TABLE "account_actions" (
 "id" TEXT PRIMARY KEY, "viewerId" TEXT NOT NULL REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "tokenHash" TEXT NOT NULL UNIQUE, "purpose" TEXT NOT NULL, "email" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "account_actions_viewerId_purpose_expiresAt_idx" ON "account_actions"("viewerId", "purpose", "expiresAt");
CREATE TABLE "service_mail" (
 "id" TEXT PRIMARY KEY, "dedupeKey" TEXT NOT NULL UNIQUE, "payload" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leasedAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sentAt" TIMESTAMP(3)
);
CREATE INDEX "service_mail_status_availableAt_idx" ON "service_mail"("status", "availableAt");
CREATE TABLE "service_worker_runs" (
 "id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "details" JSONB NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "service_worker_runs_startedAt_idx" ON "service_worker_runs"("startedAt");
