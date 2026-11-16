import { ApiError } from "./api-response";
import { paymentRate } from "./usdt";
import { z } from "zod";

type Price = { rate: string; fetchedAt: string };
const ticker = z
  .array(z.object({ symbol: z.literal("USDT_THB"), last: paymentRate }))
  .length(1);
let latest: Price | undefined;
let pending: Promise<Price> | undefined;
async function fetchPrice(): Promise<Price> {
  try {
    const res = await fetch(
      "https://api.bitkub.com/api/v3/market/ticker?sym=USDT_THB",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) throw Error();
    const [row] = ticker.parse(await res.json());
    latest = { rate: row!.last, fetchedAt: new Date().toISOString() };
    return latest;
  } catch {
    throw new ApiError("usdt_rate_unavailable", 503);
  }
}
export function marketPrice(): Promise<Price> {
  if (latest && Date.now() - Date.parse(latest.fetchedAt) < 15000)
    return Promise.resolve(latest);
  pending ??= fetchPrice().finally(() => {
    pending = undefined;
  });
  return pending;
}
