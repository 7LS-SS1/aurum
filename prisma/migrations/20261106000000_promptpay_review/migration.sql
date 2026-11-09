-- Add the verified-by-gateway queue without rewriting existing orders.
BEGIN;
ALTER TABLE "ads_orders" DROP CONSTRAINT "ads_orders_status";
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_orders_status"
CHECK ("status" IN ('REVIEW','PAYMENT','PAYMENT_REVIEW','PAID','ACTIVE','COMPLETED','REJECTED','EXPIRED','REFUND_REQUIRED','REFUNDED','REMOVAL_REQUIRED'));
COMMIT;
