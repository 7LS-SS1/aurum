import { describe, expect, it } from "vitest";
import { bandwidthScale } from "./bandwidth";
import { sampleSchema } from "./types";
const sample = (rx: number | null, tx: number | null) => sampleSchema.parse({
  timestamp: "2026-11-10T00:00:00Z", cpuPercent: null,
  memoryUsed: null, memoryTotal: null, diskUsed: null, diskTotal: null,
  rxBytes: null, txBytes: null, rxBytesPerSecond: rx, txBytesPerSecond: tx,
});
describe("automatic bandwidth display scale", () => {
  it("preserves an explicitly configured capacity even above capacity", () => {
    expect(bandwidthScale([sample(250e6, 0)], 100)).toEqual({ mbps: 100, estimated: false });
  });
  it("uses the larger direction, keeps window peaks and adds headroom", () => {
    expect(bandwidthScale([sample(125e3, 200e3), sample(100, 100)])).toEqual({ mbps: 2, estimated: true });
    expect(bandwidthScale([sample(125e6, 125e6)]).mbps).toBe(2000);
  });
  it("does not invent capacity from missing or idle traffic", () => {
    expect(bandwidthScale([]).mbps).toBeUndefined();
    expect(bandwidthScale([sample(null, null), sample(0, 0)]).mbps).toBeUndefined();
  });
  it("handles partial readings, small rates, and separate source windows", () => {
    expect(bandwidthScale([sample(null, 10)]).mbps).toBe(1);
    expect(bandwidthScale([sample(125e6, null)]).mbps).toBe(2000);
    expect(bandwidthScale([sample(null, 10)]).mbps).toBe(1);
  });
});
