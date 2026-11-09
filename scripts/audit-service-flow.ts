import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { refreshExpiryAlerts } from "../src/lib/ads-notifications";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/aurum_ads_test") throw Error("Isolated local DB only");
const db = new PrismaClient(), id = randomUUID();
async function main() {
  try {
    await db.adsOrder.create({ data: { id, requestId: randomUUID(), tokenHash: randomUUID(), requestHash: randomUUID(), customer: {}, quote: {}, slots: ["popup:1"], days: 30, amount: 1500, artworkUrl: "", targetUrl: "", status: "ACTIVE", startsAt: new Date(Date.now() - 28 * 86400000), endsAt: new Date(Date.now() + 2 * 86400000) } });
    await db.adsNotification.create({ data: { orderId: id, dedupeKey: `renewal-due:${id}`, kind: "EXPIRING", title: "Audit renewal approval reminder", message: "Earlier renewal approval was pending", status: "RESOLVED", resolvedAt: new Date() } });
    await refreshExpiryAlerts();
    const expiry = await db.adsNotification.count({ where: { orderId: id, dedupeKey: { startsWith: `expiry:${id}:` } } });
    if(expiry!==1)throw Error("Missing expiry alert after renewal reminder");
    console.log(JSON.stringify({ scenario: "renewed active order with earlier resolved renewal-due alert, expires in 2 days", expectedExpiryAlerts: 1, actualExpiryAlerts: expiry }));
  } finally {
    await db.auditLog.deleteMany({ where: { resourceType: "ads_order", resourceId: id } });
    await db.adsOrder.deleteMany({ where: { id } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
