import { z } from "zod";
import { ApiError } from "@/lib/api-response";

export const MESSAGES = {
  INVALID_URL: "URL ต้องเป็น HTTPS และอยู่ในโฮสต์ที่อนุญาต",
  PRIVATE_ADDRESS: "ปฏิเสธปลายทางเครือข่ายภายใน",
  ROBOTS_DENIED: "ต้นทางไม่อนุญาตให้สแกนเส้นทางนี้",
  ROBOTS_UNAVAILABLE: "ตรวจสอบ robots.txt ไม่สำเร็จ",
  RATE_LIMITED: "ต้นทางจำกัดการเรียก กรุณาลองภายหลัง",
  SOURCE_HTTP: "ต้นทางตอบกลับไม่สำเร็จหรือจำเป็นต้องเข้าสู่ระบบ",
  UNSUPPORTED_PLAYER: "ไม่พบสื่อมาตรฐานที่รองรับ หรือสื่อมีการเข้ารหัส",
  AMBIGUOUS_MEDIA: "พบสื่อมากกว่าหนึ่งรายการ กรุณาระบุ recipe ให้ชัดเจน",
  INVALID_RECIPE: "recipe ไม่ถูกต้องหรือข้อมูลไม่ตรงรูปแบบ",
  AUTO_LINKS_NOT_FOUND: "ตรวจรูปแบบรายการอัตโนมัติไม่ได้ กรุณาตรวจแหล่งหรือระบุ HTML recipe",
  PAGINATION_UNPROVEN: "ไม่พบหน้าถัดไปหรือหลักฐานสิ้นสุดรายการ",
  PAGINATION_LOOP: "พบลิงก์หน้าถัดไปวนกลับหน้าที่สแกนแล้ว",
  ITEM_LIMIT: "จำนวนรายการถึงขีดจำกัดของแหล่งแล้ว",
  TOO_LARGE: "ข้อมูลหรือไฟล์มีขนาดเกินขีดจำกัด",
  INVALID_MEDIA: "ไฟล์ไม่มี video stream หรือระยะเวลาไม่ถูกต้อง",
  MEDIA_TOOL: "ffmpeg/ffprobe ไม่พร้อมหรือประมวลผลไฟล์ไม่สำเร็จ",
  STOPPED: "หยุดงานและคืนรายการเข้าคิวแล้ว",
  TIMEOUT: "หมดเวลารอบประมวลผล",
  BUSY: "ระบบกำลังประมวลผล กรุณาลองอีกครั้ง",
  INTERNAL: "ประมวลผลไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าและลองใหม่",
} as const;
export type ErrorCode = keyof typeof MESSAGES;
export class ScannerError extends ApiError {
  constructor(public code: ErrorCode, status = 422, public retryAfter?: Date) { super(`${code}: ${MESSAGES[code]}`, status); }
}
export function scannerError(error: unknown): ScannerError {
  return error instanceof ScannerError ? error : new ScannerError("INTERNAL", 500);
}

export function allowedUrl(raw: string, hosts: string[], base?: string) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !hosts.includes(url.hostname.toLowerCase()) || url.href.length > 2048) throw 0;
    url.hash = "";
    return url.toString();
  } catch { throw new ScannerError("INVALID_URL"); }
}
export function redactedUrl(raw: string) {
  try { const u = new URL(raw); return `${u.origin}${u.pathname}${u.search ? "?[hidden]" : ""}`; } catch { return "[URL]"; }
}

const field = z.string().trim().min(1).max(500);
export const recipeSchema = z.object({
  videoLinks: field.optional(), items: field.optional(), id: field.optional(), pageUrl: field.optional(),
  next: field, terminal: field, title: field,
  description: field.optional(), media: field.optional(), mediaUrl: field.optional(),
  iframe: field.optional(), cover: field.optional(), coverUrl: field.optional(),
  tags: field.optional(), categories: field.optional(), ads: field.optional(),
}).strict();
export type Recipe = z.infer<typeof recipeSchema>;
export const standardCatalogRecipe: Recipe = {
  items: "items", id: "id", pageUrl: "sourceUrl", title: "title", description: "description",
  mediaUrl: "mediaUrl", coverUrl: "coverUrl", tags: "tags", categories: "categories", next: "next", terminal: "terminal",
};
export const sourceSchema = z.object({
  name: z.string().trim().min(1).max(160), baseUrl: z.string().url().max(2048),
  allowedHosts: z.array(z.string().trim().transform((host) => {
    if (/[\s:/\\@?#%]/.test(host)) return host;
    try { return new URL(`https://${host}`).hostname.toLowerCase(); } catch { return host; }
  }).pipe(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).max(253))).max(30).default([]),
  adapter: z.enum(["AUTO", "HTML_RECIPE", "JSON_CATALOG"]).default("AUTO"), recipe: recipeSchema.optional(),
  scanIntervalMinutes: z.number().int().min(0).max(43200).optional(),
  requestIntervalMs: z.number().int().min(1000).max(60000).default(1000),
  maxPagesPerRun: z.number().int().min(1).max(100).default(10),
  maxItemsTotal: z.number().int().min(1).max(100000).default(1000),
  maxFileBytes: z.number().int().min(1024).max(20 * 1024 ** 3).default(4 * 1024 ** 3),
  mainCategory: z.string().trim().min(1).max(120),
  defaultTags: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
}).strict().transform((input) => ({ ...input,
  allowedHosts: [...new Set([new URL(input.baseUrl).hostname, ...input.allowedHosts])],
  scanIntervalMinutes: input.scanIntervalMinutes ?? (input.adapter === "AUTO" ? 0 : 60),
})).superRefine((input, ctx) => {
  try { allowedUrl(input.baseUrl, input.allowedHosts); } catch { ctx.addIssue({ code: "custom", path: ["baseUrl"], message: MESSAGES.INVALID_URL }); }
  if (input.adapter === "HTML_RECIPE" && !input.recipe) ctx.addIssue({ code: "custom", path: ["recipe"], message: MESSAGES.INVALID_RECIPE });
});
export const itemStateSchema = z.enum(["PENDING", "RESOLVING", "DOWNLOADING", "DONE", "FAILED", "UNSUPPORTED"]);
export type SourceInput = z.infer<typeof sourceSchema>;
export function retryAt(attempt: number, now = Date.now()) { return new Date(now + 30_000 * 2 ** Math.max(0, attempt - 1)); }
export function scanIsDue(source: { scanComplete: boolean; scanIntervalMinutes: number; nextScanAt: Date }, now = new Date()) {
  return source.nextScanAt <= now && (!source.scanComplete || source.scanIntervalMinutes > 0);
}
export function mayStart(source: { control: string; deletedAt: Date | null }) {
  return source.control === "RUN" && !source.deletedAt;
}
export function mayContinue(source: { control: string; deletedAt: Date | null; stopVersion: number }, version: number) {
  return source.control !== "STOP" && !source.deletedAt && source.stopVersion === version;
}
