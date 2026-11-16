import { z } from "zod";
import bs58check from "bs58check";
export const networks = z.enum(["bsc", "tron"]);
export type Network = z.infer<typeof networks>;
export const tronToken = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const tronAddress = z
  .string()
  .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/)
  .refine((v) => {
    if (v.length !== 34) return false;
    const bytes = bs58check.decodeUnsafe(v);
    return (
      bytes?.length === 21 &&
      bytes[0] === 65 &&
      bytes.slice(1).some((x) => x !== 0)
    );
  });
export function rpcAddress(value: string, network: Network) {
  if (network === "bsc") return value.toLowerCase();
  return (
    "0x" +
    Array.from(bs58check.decode(value).slice(1), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .refine((v) => !/^0x0{40}$/.test(v));
export const paymentRate = z.string().regex(/^[1-9]\d{0,4}(\.\d{1,4})?$/);
export const wallet = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    address: address.or(tronAddress),
    network: networks.default("bsc"),
    rate: paymentRate.or(z.literal("")),
    automaticRate: z.boolean().default(false),
    active: z.boolean(),
  })
  .strict()
  .refine(
    (w) =>
      (w.network === "tron" ? tronAddress : address).safeParse(w.address)
        .success,
    { path: ["address"], message: "Wrong network address" },
  )
  .refine((w) => w.automaticRate || w.rate !== "", {
    path: ["rate"],
    message: "Manual rate required",
  });
export const token = "0x55d398326f99059ff775485246999027b3197955";
export const invoice = z
  .object({
    network: networks.default("bsc"),
    to: address.or(tronAddress),
    from: address.or(tronAddress).nullable(),
    mobile: z.literal(true).optional(),
    rate: paymentRate,
    rateSource: z.enum(["manual", "bitkub"]).optional(),
    rateFetchedAt: z.string().datetime().optional(),
    units: z.string().regex(/^\d+$/),
    tag: z.string().regex(/^[a-f0-9]{32}$/),
    cursor: z.number().int(),
    expires: z.string(),
    hash: z.string().optional(),
    settled: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((i) => (i.mobile ? i.from === null : !!i.from), {
    message: "Invalid invoice payer",
  });
export type Invoice = z.infer<typeof invoice>;
export function unitsFor(baht: number, rate: string, network: Network = "bsc") {
  const [whole, fraction = ""] = rate.split(".");
  const divisor = BigInt(whole + fraction.padEnd(4, "0"));
  return (
    ((BigInt(baht) * 100_000_000n + divisor - 1n) / divisor) *
    (network === "tron" ? 100n : 100_000_000_000_000n)
  ).toString();
}
export function displayUnits(units: string, network: Network = "bsc") {
  const micros = BigInt(units) / (network === "tron" ? 1n : 1_000_000_000_000n);
  if (micros % 100n !== 0n)
    return (
      (micros / 1_000_000n).toString() +
      "." +
      (micros % 1_000_000n).toString().padStart(6, "0")
    );
  const scale = network === "tron" ? 100n : 100_000_000_000_000n;
  return (
    (BigInt(units) / scale / 10000n).toString() +
    "." +
    ((BigInt(units) / scale) % 10000n).toString().padStart(4, "0")
  );
}
export function transferData(
  i: Pick<Invoice, "to" | "units" | "tag"> & { network?: Network },
) {
  return (
    "0xa9059cbb" +
    rpcAddress(i.to, i.network ?? "bsc")
      .slice(2)
      .padStart(64, "0") +
    BigInt(i.units).toString(16).padStart(64, "0") +
    i.tag
  );
}
