CREATE TABLE "stripe_orders" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "viewerId" TEXT NOT NULL, "kind" TEXT NOT NULL, "sourceKey" TEXT NOT NULL,
 "bannerOrderId" TEXT, "title" TEXT NOT NULL, "amountSatang" INTEGER NOT NULL,
 "mode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "accountId" TEXT NOT NULL,
 "customerId" TEXT, "remoteId" TEXT, "paymentIntentId" TEXT, "url" TEXT, "invoicePdf" TEXT,
 "expiresAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "paidAt" TIMESTAMP(3), "lastCheckedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "stripe_orders_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "stripe_orders_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "stripe_orders_bannerOrderId_fkey" FOREIGN KEY ("bannerOrderId") REFERENCES "ads_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "stripe_order_amount" CHECK ("amountSatang" > 0),
 CONSTRAINT "stripe_order_kind" CHECK ("kind" IN ('VIDEO','BANNER')),
 CONSTRAINT "stripe_order_mode" CHECK ("mode" IN ('CHECKOUT','INVOICE')),
 CONSTRAINT "stripe_order_status" CHECK ("status" IN ('DRAFT','CREATING','OPEN','PAID','REVIEW','EXPIRED','VOID','REFUNDED'))
);
CREATE UNIQUE INDEX "stripe_orders_requestId_key" ON "stripe_orders"("requestId");
CREATE UNIQUE INDEX "stripe_orders_sourceKey_key" ON "stripe_orders"("sourceKey");
CREATE UNIQUE INDEX "stripe_orders_bannerOrderId_key" ON "stripe_orders"("bannerOrderId");
CREATE UNIQUE INDEX "stripe_orders_remoteId_key" ON "stripe_orders"("remoteId");
CREATE INDEX "stripe_orders_viewerId_createdAt_idx" ON "stripe_orders"("viewerId","createdAt");
CREATE INDEX "stripe_orders_status_updatedAt_idx" ON "stripe_orders"("status","updatedAt");
CREATE TABLE "stripe_events" ("id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL, "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
