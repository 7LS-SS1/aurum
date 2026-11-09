import { z } from "zod";
import defaults from "./ads-page-defaults.json";

const text = z.string().trim().min(1).max(5000);
const price = z.number().int().min(0).max(10_000_000);
const copyShape = Object.fromEntries(Object.keys(defaults.copy).map(key => [key, text])) as Record<keyof typeof defaults.copy, typeof text>;
export const adsPageSchema = z.object({
  coupons: z.array(z.object({code:z.string().trim().regex(/^[A-Z0-9_-]{3,30}$/),percent:z.number().int().min(1).max(90),startsAt:z.string().datetime(),endsAt:z.string().datetime(),maxUses:z.number().int().min(1).max(100000),enabled:z.boolean()}).strict().refine(c=>Date.parse(c.endsAt)>Date.parse(c.startsAt),"วันสิ้นสุดต้องอยู่หลังวันเริ่ม")).max(50).refine(rows=>new Set(rows.map(c=>c.code)).size===rows.length,"รหัสส่วนลดซ้ำ").default([]),
  websites: z.array(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(100), url: z.string().url().max(500).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "ใช้ URL HTTPS"), enabled: z.boolean() }).strict()).max(100).refine(sites => new Set(sites.map(site => site.id)).size === sites.length, "รหัสเว็บไซต์ซ้ำ").default([]),
  inventoryCounts: z.object({
    popup: z.number().int().min(1).max(8),
    fixed_left: z.number().int().min(1).max(8),
    fixed_right: z.number().int().min(1).max(8),
    fixed_bottom: z.number().int().min(1).max(8),
    video_ad: z.number().int().min(1).max(8),
  }).strict().default({ popup: 1, fixed_left: 1, fixed_right: 1, fixed_bottom: 1, video_ad: 1 }),
  telegram: z.string().regex(/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/),
  copy: z.object(copyShape).strict(),
  benefits: z.array(z.tuple([text, text, text])).length(4),
  groups: z.array(z.object({
    title: text, subtitle: text, total: price, bundle: text,
    rows: z.array(z.tuple([text, text, price, text])).min(1).max(10),
  }).strict()).length(3),
  packages: z.array(z.object({
    months: z.number().int().min(1).max(60), price,
    discount: z.number().int().min(0).max(100),
  }).strict()).length(3),
  promotions: z.array(z.object({
    id: z.string().uuid(), title: z.string().trim().min(1).max(200),
    body: text, imageUrl: z.string().max(2000).refine(value => value === "" || /^https:\/\/[^\s]+$/.test(value) || /^\/images\/[A-Za-z0-9_./-]+$/.test(value), "ใช้ URL รูปภาพ HTTPS หรือ /images/ เท่านั้น"),
    published: z.boolean(),
  }).strict()).max(30).refine(posts => new Set(posts.map(post => post.id)).size === posts.length, "รหัสโปรโมชั่นซ้ำ"),
}).strict();
export type AdsPageConfig = z.infer<typeof adsPageSchema>;
export const defaultAdsPage = adsPageSchema.parse(defaults);
export const adsPageUpdateSchema = z.object({ revision: z.number().int().min(0), config: adsPageSchema }).strict();
