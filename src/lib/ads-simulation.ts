import { z } from "zod";

// Shared presentation contract. No payment credentials or usable payment payloads.
export const simulationSchema = z.object({
  mode: z.literal("simulation"), version: z.literal(1),
  phase: z.enum(["checkout", "submitted", "verified", "installing", "approval", "active"]),
  method: z.enum(["qr", "usdt_bep20", "usdt_trc20"]).nullable(),
  rateTHB: z.literal(35), amountTHB: z.number().int().nonnegative(),
  receipt: z.object({ id: z.string(), outcome: z.enum(["success", "mismatch", "failed"]), amountTHB: z.number().int(), submittedAt: z.string() }).nullable(),
});
export type Simulation = z.infer<typeof simulationSchema>;
export type SimulationOrder = { id: string; status: string; revision: number; amount: number; days: number; holdUntil: string | null; startsAt: string | null; endsAt: string | null; staffNote: string; quote: { items: string[] }; simulation: Simulation | null };
export function getSimulation(quote: unknown): Simulation | null {
  if (!quote || typeof quote !== "object" || !("simulation" in quote)) return null;
  const result = simulationSchema.safeParse(quote.simulation);
  return result.success ? result.data : null;
}
export const simulationMethods = { qr: "QR Code (จำลอง)", usdt_bep20: "USDT · BEP20 (จำลอง)", usdt_trc20: "USDT · TRC20 (จำลอง)" };
export const simulationPhases = { checkout: "รอชำระเงินจำลอง", submitted: "รอเจ้าหน้าที่ตรวจยอดจำลอง", verified: "ชำระเงินจำลองสำเร็จ · รอดำเนินการ", installing: "เจ้าหน้าที่กำลังติดตั้ง", approval: "ติดตั้งแล้ว · รออนุมัติ", active: "อนุมัติเริ่มบริการแล้ว" };
export function simulationLabel(status: string, simulation: Simulation | null) {
  return simulation && ["PAYMENT", "PAID", "ACTIVE"].includes(status) ? simulationPhases[simulation.phase] : null;
}
export function newSimulation(amountTHB: number): Simulation {
  return { mode: "simulation", version: 1, phase: "checkout", method: null, rateTHB: 35, amountTHB, receipt: null };
}
