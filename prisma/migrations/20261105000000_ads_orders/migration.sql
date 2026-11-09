CREATE TABLE "ads_orders" (
  "id" TEXT PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "requestId" TEXT NOT NULL UNIQUE,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REVIEW',
  "customer" JSONB NOT NULL,
  "quote" JSONB NOT NULL,
  "slots" TEXT[] NOT NULL,
  "days" INTEGER NOT NULL CHECK ("days" IN (30,90,180)),
  "amount" INTEGER NOT NULL CHECK ("amount" >= 0),
  "artworkUrl" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "staffNote" TEXT NOT NULL DEFAULT '',
  "paymentUrl" TEXT,
  "paymentReference" TEXT UNIQUE,
  "holdUntil" TIMESTAMP(3),
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ads_orders_status" CHECK ("status" IN ('REVIEW','PAYMENT','PAID','ACTIVE','COMPLETED','REJECTED','EXPIRED','REFUND_REQUIRED','REFUNDED'))
);
CREATE INDEX "ads_orders_status_idx" ON "ads_orders" ("status");
CREATE INDEX "ads_orders_createdAt_idx" ON "ads_orders" ("createdAt");
