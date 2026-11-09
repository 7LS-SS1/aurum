CREATE TABLE "WebsiteServiceRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "requestId" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "viewerId" TEXT NOT NULL,
 "details" JSONB NOT NULL,
 "quote" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'REQUESTED',
 "staffNote" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "WebsiteServiceRequest_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "WebsiteServiceRequest_status_check" CHECK ("status" IN ('REQUESTED','CONTACTED','QUOTED','CLOSED','CANCELLED'))
);
CREATE UNIQUE INDEX "WebsiteServiceRequest_requestId_key" ON "WebsiteServiceRequest"("requestId");
CREATE INDEX "WebsiteServiceRequest_viewerId_createdAt_idx" ON "WebsiteServiceRequest"("viewerId","createdAt");
CREATE INDEX "WebsiteServiceRequest_status_createdAt_idx" ON "WebsiteServiceRequest"("status","createdAt");
