import type { Sample } from "./types";

/** Display scale only: observed traffic cannot establish a provider's link limit. */
export function bandwidthScale(history: Sample[], configuredMbps?: number) {
  if (configuredMbps && Number.isFinite(configuredMbps) && configuredMbps > 0)
    return { mbps: configuredMbps, estimated: false };
  let peak = 0;
  for (const sample of history) {
    for (const rate of [sample.rxBytesPerSecond, sample.txBytesPerSecond]) {
      if (rate !== null && Number.isFinite(rate) && rate > 0)
        peak = Math.max(peak, (rate * 8) / 1e6);
    }
  }
  if (!peak) return { mbps: undefined, estimated: true };
  const target = Math.max(1, peak * 1.25);
  const step = 10 ** Math.floor(Math.log10(target));
  const rounded = [1, 2, 5, 10].find((n) => n * step >= target)! * step;
  return { mbps: rounded, estimated: true };
}
