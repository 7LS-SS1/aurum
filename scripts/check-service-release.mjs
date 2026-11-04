// Read-only post-deployment smoke check. Never changes advertised prices.
import assert from "node:assert/strict";
const base = new URL(process.argv[2] || "http://localhost:3000");
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("Use HTTPS for a remote deployment");
}
const get = path => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15000) });
const page = await get("/services");
assert.equal(page.status, 200, "Public service page");
assert.match(await page.text(), /https:\/\/t\.me\//, "Contact link");
assert.equal((await get("/api/services")).status, 401, "Anonymous settings access must be denied");
const admin = await get("/admin/services");
assert.ok([302, 303, 307, 308].includes(admin.status), "Anonymous admin access must redirect to login");
assert.match(admin.headers.get("location") || "", /login|signin/, "Login redirect target");
console.log("SERVICE_RELEASE_READ_CHECK_OK");
