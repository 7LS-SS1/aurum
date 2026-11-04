import { describe, expect, it } from "vitest";
import { readServicePageBody, servicePageOriginAllowed } from "./service-page-request";

describe("service page request boundary", () => {
  it("accepts configured HTTPS origin behind an internal HTTP proxy", () => {
    expect(servicePageOriginAllowed("https://aurum.example", "http://localhost:3000/api/services", "https://aurum.example")).toBe(true);
    expect(servicePageOriginAllowed("https://evil.example", "http://localhost:3000/api/services", "https://aurum.example")).toBe(false);
    expect(servicePageOriginAllowed(null, "http://localhost:3000", "https://aurum.example")).toBe(false);
    expect(servicePageOriginAllowed("http://localhost:3000", "http://localhost:3000/api/services", "https://aurum.example")).toBe(false);
  });
  it("supports local origins without AUTH_URL and rejects invalid configuration", () => {
    expect(servicePageOriginAllowed("http://localhost:3000", "http://localhost:3000/api/services", "")).toBe(true);
    expect(servicePageOriginAllowed("http://localhost:3000", "http://localhost:3000/api/services", "broken")).toBe(false);
  });
  it("parses Thai JSON and rejects malformed JSON", async () => {
    expect(await readServicePageBody(new Request("https://test.local", { method: "POST", body: '{"name":"บริการ"}' }))).toEqual({ name: "บริการ" });
    await expect(readServicePageBody(new Request("https://test.local", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400 });
  });
  it("bounds UTF-8 bytes even without Content-Length", async () => {
    await expect(readServicePageBody(new Request("https://test.local", { method: "POST", body: "ก".repeat(90_000) }))).rejects.toMatchObject({ status: 413 });
  });
});
