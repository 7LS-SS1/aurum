import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authenticateAdsPlugin, mediaSignature, validMediaSignature, isServingAd, adFiles } from "./ads-plugin";
const site = "11111111-1111-4111-8111-111111111111";
beforeEach(() => vi.stubEnv("ADS_PLUGIN_KEYS", JSON.stringify({ [site]: "a".repeat(48) })));
afterEach(() => vi.unstubAllEnvs());
describe("ads plugin security and serving policy", () => {
 it("requires a per-site key", () => {
  expect(() => authenticateAdsPlugin(site, "Bearer " + "a".repeat(48))).not.toThrow();
  expect(() => authenticateAdsPlugin(site, "Bearer wrong")).toThrow();
  expect(() => authenticateAdsPlugin("22222222-2222-4222-8222-222222222222", "Bearer " + "a".repeat(48))).toThrow();
 });
 it("binds media links to site, order, file and expiry", () => {
  const expiry = Math.floor(Date.now()/1000)+600;
  const signature = mediaSignature(site, "order", "file", expiry);
  expect(validMediaSignature(site, "order", "file", expiry, signature)).toBe(true);
  expect(validMediaSignature(site, "other", "file", expiry, signature)).toBe(false);
  expect(validMediaSignature(site, "order", "other", expiry, signature)).toBe(false);
  expect(validMediaSignature(site, "order", "file", expiry-1000, signature)).toBe(false);
 });
 it("serves only started active contracts, with bounded grace", () => {
  const now = Date.now();
  const order = { status: "ACTIVE", startsAt: new Date(now-10000), endsAt: new Date(now+10000), quote: {} };
  expect(isServingAd(order, now)).toBe(true);
  for (const status of ["PAID", "PAYMENT", "REFUNDED", "SCHEDULED", "REMOVAL_REQUIRED"]) expect(isServingAd({...order,status}, now)).toBe(false);
  expect(isServingAd({...order, startsAt: new Date(now+1000)}, now)).toBe(false);
  expect(isServingAd({...order, endsAt: new Date(now-1)}, now)).toBe(false);
  expect(isServingAd({...order, status:"GRACE", endsAt: new Date(now-1000)}, now)).toBe(true);
  expect(isServingAd({...order, status:"GRACE", endsAt: new Date(now-73*3600000)}, now)).toBe(false);
 });
 it("prefers current artwork over original contract files", () => {
  expect(adFiles({ currentArtwork: [], quote: { attachments: [{bad:"legacy"}] } })).toEqual([]);
 });
});
