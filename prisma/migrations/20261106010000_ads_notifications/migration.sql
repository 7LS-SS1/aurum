CREATE TABLE "ads_notifications" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NEW_ORDER','PAYMENT_ISSUE','CANCELLATION','EXPIRING','OTHER_ISSUE')),
  "source" TEXT NOT NULL DEFAULT 'SYSTEM' CHECK ("source" IN ('SYSTEM','CUSTOMER')),
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','RESOLVED')),
  "response" TEXT NOT NULL DEFAULT '',
  "readAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ads_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ads_notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ads_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ads_notifications_dedupeKey_key" ON "ads_notifications"("dedupeKey");
CREATE INDEX "ads_notifications_status_readAt_createdAt_idx" ON "ads_notifications"("status","readAt","createdAt");
CREATE INDEX "ads_notifications_orderId_createdAt_idx" ON "ads_notifications"("orderId","createdAt");
