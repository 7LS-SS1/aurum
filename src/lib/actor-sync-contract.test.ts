import { afterEach, describe, expect, it, vi } from "vitest";
import { WordPressClient } from "./wordpress-client";
import { actorPayload, actorFingerprint } from "./actor-sync-contract";
const payload = actorPayload({ id: "cactor1", name: "นักแสดง ทดสอบ", bio: "ประวัติ", profileImageUrl: "https://cdn.example.test/a.webp",
  age: 25, heightCm: null, weightKg: null, measurementBust: null, measurementWaist: null, measurementHip: null });
const remote = (p = payload, status = "created") => ({ remoteId: 10, payload: p, status });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const client = () => new WordPressClient({ baseUrl: "https://wp.example.test", authType: "APP_PASSWORD", username: "test", credential: "test-only" });
afterEach(() => vi.unstubAllGlobals());
describe("actor sync destination contract", () => {
  it.each([null, { found: false }])("creates a new actor after missing response %j", async missing => {
    const fetch = vi.fn().mockResolvedValueOnce(response(missing)).mockResolvedValueOnce(response(remote()));
    vi.stubGlobal("fetch", fetch);
    expect((await client().syncActor(payload)).status).toBe("created");
    expect(fetch.mock.calls[1]?.[1].method).toBe("PUT");
    expect(fetch.mock.calls[1]?.[0]).toContain("/actors/cactor1");
  });
  it("repeated pushes let the destination backfill its taxonomy term without uploading images", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(remote()))
      .mockResolvedValueOnce(response(remote(payload, "skipped")))
      .mockResolvedValueOnce(response(remote()))
      .mockResolvedValueOnce(response(remote(payload, "skipped")))
      .mockResolvedValueOnce(response(remote()))
      .mockResolvedValueOnce(response(remote(payload, "skipped")));
    vi.stubGlobal("fetch", fetch);
    for (let i = 0; i < 3; i++) expect((await client().syncActor(payload)).status).toBe("skipped");
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls.filter(call => call[1].method === "PUT")).toHaveLength(3);
    expect(fetch.mock.calls.every(call => !String(call[0]).includes("/media"))).toBe(true);
  });
  it.each(["https://cdn.example.test/new.webp", null])("replaces or removes an image: %s", async image => {
    const changed = { ...payload, profileImageUrl: image };
    const fetch = vi.fn().mockResolvedValueOnce(response(remote())).mockResolvedValueOnce(response(remote(changed, image ? "image_updated" : "image_removed")));
    vi.stubGlobal("fetch", fetch);
    expect((await client().syncActor(changed)).status).toBe(image ? "image_updated" : "image_removed");
    expect(fetch.mock.calls.some(call => call[0].includes("/media"))).toBe(false);
  });
  it("changes metadata without re-uploading the unchanged image", async () => {
    const changed = { ...payload, metadata: { ...payload.metadata, age: 26 } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(remote())).mockResolvedValueOnce(response(remote(changed, "updated"))));
    expect((await client().syncActor(changed)).status).toBe("updated");
  });
  it("does not treat a missing plugin as a missing actor", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ message: "No route" }, 404));
    vi.stubGlobal("fetch", fetch);
    await expect(client().syncActor(payload)).rejects.toThrow("No route");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a destination that silently drops metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(null)).mockResolvedValueOnce(response(remote({ ...payload, bio: "" }))));
    await expect(client().syncActor(payload)).rejects.toThrow("actor_verification_failed");
  });
  it("retries a lost PUT response against the same identity", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(null)).mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(response(remote(payload, "skipped")));
    vi.stubGlobal("fetch", fetch);
    expect((await client().syncActor(payload)).status).toBe("skipped");
    expect(fetch.mock.calls[1]?.[0]).toBe(fetch.mock.calls[2]?.[0]);
  });
  it("rejects mismatched identity and malformed remote results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(remote({ ...payload, externalId: "someone-else" }))));
    await expect(client().syncActor(payload)).rejects.toThrow("actor_identity_conflict");
  });
  it("fingerprint ignores property order but tracks all actor fields", () => {
    expect(actorFingerprint({ ...payload, metadata: { ...payload.metadata } })).toBe(actorFingerprint(payload));
    expect(actorFingerprint({ ...payload, name: "new" })).not.toBe(actorFingerprint(payload));
    expect(actorFingerprint({ ...payload, metadata: { ...payload.metadata, age: 26 } })).not.toBe(actorFingerprint(payload));
  });
});
