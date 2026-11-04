import { z } from "zod";
import defaults from "./service-page-defaults.json";

const shortText = z.string().trim().min(1).max(200);
const price = z.number().int().min(0).max(10_000_000);
const copyShape = Object.fromEntries(Object.keys(defaults.copy).map(key => [key, z.string().trim().min(1).max(5000)])) as Record<keyof typeof defaults.copy, z.ZodString>;
export const servicePageSchema = z.object({
  telegram: z.string().url().refine(value => /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}$/.test(value), "ใช้ลิงก์ https://t.me/username เท่านั้น"),
  hosting: price,
  contractMonths: z.number().int().min(1).max(60),
  plans: z.array(z.object({ name: shortText, intro: shortText, first: price, monthly: price, enabled: z.boolean() }).strict()).length(3).refine(plans => plans.some(plan => plan.enabled), "ต้องเปิดอย่างน้อยหนึ่งแพ็กเกจ"),
  ads: z.array(z.object({ name: shortText, text: shortText, first: price, monthly: price, enabled: z.boolean() }).strict()).length(2),
  copy: z.object(copyShape).strict(),
}).strict();
export type ServicePageConfig = z.infer<typeof servicePageSchema>;
export const defaultServicePage = servicePageSchema.parse(defaults);
export const servicePageUpdateSchema = z.object({ revision: z.number().int().min(0), config: servicePageSchema }).strict();
export function renderServiceText(value: string, months: number) {
  return value.replaceAll("{contractMonths}", String(months));
}
