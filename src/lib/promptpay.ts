import { z } from "zod";

// Server-owned snapshot. No provider key, raw JWT or payment token is persisted here.
export const promptPaySchema = z.object({
  version: z.literal(1), provider: z.literal("2c2p"), environment: z.literal("sandbox"),
  merchantID: z.string(), invoiceNo: z.string().regex(/^[a-f0-9]{20}$/),
  amountSatang: z.number().int().positive().safe(), currency: z.literal("THB"),
  state: z.enum(["creating", "ready", "unknown", "received"]),
  createdAt: z.string().datetime(), checkoutUrl: z.string().nullable(),
  reference: z.string().nullable(), receivedAt: z.string().datetime().nullable(),
  providerPaidAt: z.string().datetime().nullable().optional(),
});
export type PromptPay = z.infer<typeof promptPaySchema>;
export function getPromptPay(quote: unknown): PromptPay | null {
  const value = quote && typeof quote === "object" && "promptpay" in quote ? quote.promptpay : null;
  const parsed = promptPaySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function hasPromptPay(quote: unknown) {
  return !!quote && typeof quote === "object" && "promptpay" in quote;
}
export function validSandboxCheckout(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "sandbox-pgw-ui.2c2p.com" && !url.username && !url.password && !url.port;
  } catch { return false; }
}
export function amountToSatang(value: unknown): number | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d{1,10}(?:\.\d{1,2}0{0,3})?$/.test(text)) return null;
  const [whole, decimal = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
  return Number.isSafeInteger(result) ? result : null;
}
