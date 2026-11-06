import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sourceSchema } from "./types";
export function sources() {
  const parsed = z
    .array(sourceSchema)
    .max(100)
    .parse(JSON.parse(process.env.MONITOR_SOURCES_JSON || "[]"));
  if (new Set(parsed.map((s) => s.id)).size !== parsed.length)
    throw new Error("Duplicate monitor source IDs");
  return parsed;
}
export function tokenMatches(token: string, hash: string) {
  if (token.length < 32 || token.length > 512) return false;
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    Buffer.from(hash, "hex"),
  );
}
