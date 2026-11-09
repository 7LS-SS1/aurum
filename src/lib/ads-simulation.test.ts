import { afterEach, describe, expect, it, vi } from "vitest";
import { getSimulation, newSimulation, simulationLabel } from "./ads-simulation";
import { requireSimulation, simulationEnabled } from "./ads-simulation-server";

afterEach(() => vi.unstubAllEnvs());
describe("payment simulation boundary", () => {
  it("is disabled by default and always disabled in production", () => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("ADS_PAYMENT_MODE", "");
    expect(simulationEnabled()).toBe(false); expect(() => requireSimulation()).toThrow();
    vi.stubEnv("ADS_PAYMENT_MODE", "simulation"); expect(simulationEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production"); expect(simulationEnabled()).toBe(false); expect(() => requireSimulation()).toThrow();
  });
  it("never classifies legacy quotes or malformed data as confirmed simulation", () => {
    expect(getSimulation({ items: [] })).toBeNull();
    expect(getSimulation({ simulation: { mode: "simulation" } })).toBeNull();
    const simulation = newSimulation(1500);
    expect(getSimulation({ simulation })).toEqual(simulation);
    expect(simulationLabel("EXPIRED", simulation)).toBeNull();
    expect(simulationLabel("PAYMENT", simulation)).toContain("จำลอง");
  });
});
