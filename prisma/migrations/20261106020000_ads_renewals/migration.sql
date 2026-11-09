ALTER TABLE "ads_orders" ADD COLUMN "renewalOfId" TEXT;
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_orders_renewalOfId_fkey" FOREIGN KEY ("renewalOfId") REFERENCES "ads_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ads_orders_renewalOfId_idx" ON "ads_orders"("renewalOfId");
-- Abandoned unpaid attempts may be retried; a paid/approved cycle has one successor.
CREATE UNIQUE INDEX "ads_orders_one_renewal" ON "ads_orders"("renewalOfId")
WHERE "renewalOfId" IS NOT NULL AND "status" NOT IN ('REJECTED','EXPIRED','REFUNDED');
ALTER TABLE "ads_orders" DROP CONSTRAINT "ads_orders_status";
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_orders_status" CHECK ("status" IN ('REVIEW','PAYMENT','PAYMENT_REVIEW','PAID','ACTIVE','SCHEDULED','GRACE','COMPLETED','REJECTED','EXPIRED','REFUND_REQUIRED','REFUNDED','REMOVAL_REQUIRED'));
