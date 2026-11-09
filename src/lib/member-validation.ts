import { z } from "zod";
export function safeMemberReturn(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u0020]/.test(value)) return "/account";
  try { const url = new URL(value, "https://member.invalid"); return url.origin === "https://member.invalid" && !url.pathname.startsWith("/admin") && !url.pathname.startsWith("/api") ? url.pathname + url.search : "/account"; } catch { return "/account"; }
}
export function normalizePhone(value: string) {
  const phone = value.trim().replace(/[\s()-]/g, "");
  return /^0[689]\d{8}$/.test(phone) ? "+66" + phone.slice(1) : phone;
}
export const phoneSchema = z.string().max(30).transform(normalizePhone).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "ระบุเบอร์มือถือ เช่น 0812345678 หรือ +66812345678"));
export const phoneAuthSchema = z.object({
  phone: phoneSchema,
  action: z.enum(["send", "verify"]),
  code: z.string().regex(/^\d{6}$/).optional(),
  displayName: z.string().trim().min(2).max(60).optional(),
}).strict();
