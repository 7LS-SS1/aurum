import { z } from "zod";
const list = z.array(z.string().trim().min(1).max(120)).max(50);
export const bulkTaxonomySchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  mainCategory: z.string().trim().min(1).max(120).optional(),
  categories: list.optional(), tags: list.optional(),
  mode: z.enum(["append", "replace", "remove"]),
}).strict().refine(v => v.mainCategory !== undefined || v.categories !== undefined || v.tags !== undefined, "เลือกข้อมูลที่ต้องการแก้ไข");
export function mergeTaxonomy(previous: unknown, incoming: string[], mode: "append" | "replace" | "remove") {
  const old = Array.isArray(previous) ? previous.filter((v): v is string => typeof v === "string") : [];
  const result = [...new Set(mode === "replace" ? incoming : mode === "remove" ? old.filter(v => !incoming.includes(v)) : [...old, ...incoming])];
  return list.parse(result);
}
