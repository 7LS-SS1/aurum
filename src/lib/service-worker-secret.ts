import { readFileSync } from "node:fs";
import path from "node:path";

export function serviceWorkerSecret(): string {
  const configured = process.env.SERVICE_WORKER_SECRET;
  if (configured) return configured;
  const file = process.env.SERVICE_WORKER_SECRET_FILE;
  if (!file || !path.isAbsolute(file)) return "";
  try {
    const value = readFileSync(file, "utf8").trim();
    return value.length <= 4096 ? value : "";
  } catch { return ""; }
}
