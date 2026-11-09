-- Keep inventory occupied until staff confirms the expired artwork is removed.
ALTER TABLE "ads_orders" DROP CONSTRAINT "ads_orders_status";
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_orders_status"
CHECK ("status" IN ('REVIEW','PAYMENT','PAID','ACTIVE','COMPLETED','REJECTED','EXPIRED','REFUND_REQUIRED','REFUNDED','REMOVAL_REQUIRED'));
