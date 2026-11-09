import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

// Run inside the candidate container with its intended runtime environment.
// Never print values: several of these settings are credentials.
const failures = [];
const required = (name, test) => { if (!test(process.env[name] || "")) failures.push(name); };
required("DATABASE_URL", value => { try { return ["postgres:", "postgresql:"].includes(new URL(value).protocol); } catch { return false; } });
required("AUTH_SECRET", value => value.length >= 32);
required("ENCRYPTION_KEY", value => /^[a-f\d]{64}$/i.test(value));
required("AUTH_URL", value => { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } });
let workerSecret = process.env.SERVICE_WORKER_SECRET || "";
if (!workerSecret && path.isAbsolute(process.env.SERVICE_WORKER_SECRET_FILE || "")) {
  try { workerSecret = (await readFile(process.env.SERVICE_WORKER_SECRET_FILE, "utf8")).trim(); } catch { /* fail closed */ }
}
if (workerSecret.length < 32 || workerSecret.length > 4096) failures.push("SERVICE_WORKER_SECRET_OR_FILE");
if (process.env.ADS_UPLOAD_STORAGE === "r2") {
  required("ADS_R2_BUCKET_NAME", value => Boolean(value) && ![process.env.R2_BUCKET_NAME, process.env.R2_DOUJIN_BUCKET_NAME].includes(value));
  required("ADS_R2_PRIVATE_CONFIRMED", value => value === "true");
  for (const key of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) required(key, Boolean);
} else {
  required("ADS_UPLOAD_STORAGE", value => !value || value === "local");
  required("ADS_UPLOAD_DIR", value => path.isAbsolute(value));
}
if (process.env.ADS_UPLOAD_DIR && path.isAbsolute(process.env.ADS_UPLOAD_DIR)) {
  try { await access(process.env.ADS_UPLOAD_DIR, constants.R_OK | constants.W_OK); }
  catch { failures.push("ADS_UPLOAD_DIR_ACCESS"); }
}
if (process.env.STRIPE_ENABLED === "true") failures.push("STRIPE_ENABLED: this release only supports isolated sandbox payments");
if (process.env.SERVICE_EMAIL_ENABLED === "true") {
  required("CF_EMAIL_ACCOUNT_ID", value => /^[a-f\d]{32}$/i.test(value));
  required("CF_EMAIL_API_TOKEN", value => Boolean(value.trim()));
  required("SERVICE_EMAIL_FROM", value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  required("SERVICE_PUBLIC_ORIGIN", value => {
    try { const u = new URL(value); return u.protocol === "https:" && u.pathname === "/" && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
  });
}
if (process.env.MANAGEMENT_HOST_ENABLED === "true") {
  for (const name of ["MANAGEMENT_APP_ORIGIN", "PUBLIC_APP_ORIGIN"]) required(name, value => {
    try { const u = new URL(value); return u.protocol === "https:" && u.pathname === "/" && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
  });
}
if (failures.length) { console.error("RELEASE_PREFLIGHT_BLOCKED", failures.join(", ")); process.exitCode = 1; }
else console.log("RELEASE_CONFIG_OK: separately verify persistent mount, scheduler heartbeat, backup, migration and HTTP canary before deploy");
