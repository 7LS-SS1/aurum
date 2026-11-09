import { z } from "zod";
export const graceMs = 3 * 86400000;
export const renewalSchema = z.object({ mode: z.enum(["same", "change"]), previousEndsAt: z.string().datetime(), deadline: z.string().datetime(), artworkChanged:z.boolean().optional() });
export function unchangedRenewal(quote:unknown){const r=getRenewal(quote);return r?.mode==="same"&&!r.artworkChanged;}
export function getRenewal(quote: unknown) {
  if (!quote || typeof quote !== "object" || !("renewal" in quote)) return null;
  const parsed = renewalSchema.safeParse(quote.renewal);
  return parsed.success ? parsed.data : null;
}
export function renewalDeadline(endsAt: Date) { return new Date(endsAt.getTime() + graceMs); }
export function renewalWindow(quote: unknown, days: number, now = new Date()) {
  const renewal = getRenewal(quote);
  const startsAt = renewal ? new Date(renewal.previousEndsAt) : now;
  return { startsAt, endsAt: new Date(startsAt.getTime() + days * 86400000), status: startsAt > now ? "SCHEDULED" : "ACTIVE" };
}
export function renewalHold(quote: unknown, proposed: Date) {
  const renewal = getRenewal(quote);
  return renewal ? new Date(Math.min(proposed.getTime(), Date.parse(renewal.deadline))) : proposed;
}
export function withinRenewal(endsAt: Date | null, now = new Date()) { return !!endsAt && now < renewalDeadline(endsAt); }
