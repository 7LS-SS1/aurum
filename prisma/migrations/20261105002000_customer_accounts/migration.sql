ALTER TABLE "viewers" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "viewers" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "viewers" ADD COLUMN "phone" TEXT, ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "viewers_phone_key" ON "viewers"("phone");
ALTER TABLE "viewers" ADD CONSTRAINT "viewers_identity" CHECK ("email" IS NOT NULL OR ("phone" IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL));
ALTER TABLE "ads_orders" ADD COLUMN "viewerId" TEXT;
ALTER TABLE "ads_orders" ADD CONSTRAINT "ads_orders_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ads_orders_viewerId_createdAt_idx" ON "ads_orders"("viewerId","createdAt");
