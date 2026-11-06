import { describe, it, expect } from "vitest";
import {
  evaluate,
  sourceSchema,
  sampleSchema,
  values,
  type Sample,
} from "./types";
import { tokenMatches } from "./config";
import { createHash } from "node:crypto";
const source = sourceSchema.parse({
  id: "host",
  label: "Host",
  scope: "host",
  tokenHash: "a".repeat(64),
});
const start = Date.parse("2026-11-06T00:00:00Z");
function sample(i: number, cpu: number | null): Sample {
  return {
    timestamp: new Date(start + i * 15000).toISOString(),
    cpuPercent: cpu,
    memoryUsed: null,
    memoryTotal: null,
    diskUsed: null,
    diskTotal: null,
    rxBytesPerSecond: null,
    txBytesPerSecond: null,
    rxBytes: null,
    txBytes: null,
  };
}
describe("monitor alert rules", () => {
  it("requires three sustained samples, not a spike", () => {
    expect(
      evaluate(
        source,
        [sample(0, 95), sample(1, 30), sample(2, 95)],
        start + 30000,
      ),
    ).toEqual([]);
    expect(
      evaluate(
        source,
        [sample(0, 95), sample(1, 96), sample(2, 97)],
        start + 30000,
      )[0]?.status,
    ).toBe("active");
  });
  it("requires two samples below hysteresis to recover", () => {
    const h = [
      sample(0, 95),
      sample(1, 95),
      sample(2, 95),
      sample(3, 81),
      sample(4, 79),
    ];
    expect(evaluate(source, h, start + 60000)[0]?.status).toBe("active");
    expect(
      evaluate(source, [...h, sample(5, 78)], start + 75000)[0]?.status,
    ).toBe("recovered");
  });
  it("unknown does not mean zero or recover an incident", () => {
    const h = [
      sample(0, 95),
      sample(1, 95),
      sample(2, 95),
      sample(3, null),
      sample(4, null),
    ];
    expect(evaluate(source, h, start + 60000)[0]?.status).toBe("active");
    expect(values(sample(0, null)).memory).toBeNull();
  });
  it("gaps reset confirmation and stale source raises offline", () => {
    expect(
      evaluate(
        source,
        [sample(0, 95), sample(1, 95), sample(10, 95)],
        start + 150000,
      ),
    ).toEqual([]);
    expect(evaluate(source, [sample(0, 10)], start + 91000)[0]?.metric).toBe(
      "offline",
    );
  });
  it("capacity needed for bandwidth alerts, no doubling duplex", () => {
    const s = {
      ...sample(0, 10),
      rxBytesPerSecond: 10000000,
      txBytesPerSecond: 10000000,
    };
    expect(values(s).bandwidth).toBeNull();
    expect(values(s, 100).bandwidth).toBe(80);
  });
  it("rejects invalid capacities and impossible measurements", () => {
    expect(
      sampleSchema.safeParse({
        ...sample(0, 10),
        memoryUsed: 20,
        memoryTotal: 10,
      }).success,
    ).toBe(false);
    expect(sampleSchema.safeParse({ ...sample(0, 101) }).success).toBe(false);
  });
  it("only accepts matching strong scoped token", () => {
    const token = "s".repeat(48),
      hash = createHash("sha256").update(token).digest("hex");
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches("t".repeat(48), hash)).toBe(false);
    expect(tokenMatches("short", hash)).toBe(false);
  });
});
