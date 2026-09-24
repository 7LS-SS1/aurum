import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-response";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), find: vi.fn(), upsert: vi.fn(), transaction: vi.fn(), lock: vi.fn(), encrypt: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/content-ai", () => ({ readAiConfig: mocks.read }));
vi.mock("@/lib/prisma", () => ({ prisma: { contentAiConfig: { upsert: mocks.upsert, findUnique: mocks.find }, $transaction: mocks.transaction } }));
vi.mock("@/lib/crypto", () => ({ encrypt: mocks.encrypt, decrypt: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
import { GET, PUT } from "./route";
const config = { provider: "openai", enabled: true, model: "gpt-4.1-mini", apiKeyEnc: "encrypted", apiKeyIv: "iv", apiKeyTag: "tag" };
const request = (body: object) => new Request("http://localhost/api/content-ai", { method: "PUT", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "admin", role: "HEAD" });
  mocks.read.mockResolvedValue(config);
  mocks.find.mockResolvedValue(config);
  mocks.transaction.mockImplementation(async (fn: (tx: object) => unknown) => fn({ contentAiConfig: { findUnique: mocks.find, upsert: mocks.upsert }, $executeRaw: mocks.lock }));
  mocks.encrypt.mockReturnValue({ ciphertext: "new-encrypted", iv: "new-iv", tag: "new-tag" });
});
describe("content AI settings", () => {
  it("returns a 503 setup explanation before encryption or writes when migration is missing", async () => {
    mocks.read.mockRejectedValue(new ApiError("กรุณารัน npx prisma migrate deploy", 503));
    const response = await PUT(request({ enabled: true, model: "gpt-4.1-mini", apiKey: "sample-key-only" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "กรุณารัน npx prisma migrate deploy" });
    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("only returns public settings and a key-presence flag", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({ provider: "openai", enabled: true, model: "gpt-4.1-mini", hasApiKey: true });
    expect(mocks.read).toHaveBeenCalledWith({ requireStorage: true });
  });
  it("retains the saved encrypted key when only settings change", async () => {
    const response = await PUT(request({ enabled: false, model: "gpt-4.1-mini" }));
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ provider: "openai", enabled: false }) }));
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it("encrypts a new key and never includes it in response or audit", async () => {
    const response = await PUT(request({ enabled: true, model: "gpt-4.1-mini", apiKey: "sample-key-only" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
    expect(JSON.stringify(mocks.upsert.mock.calls)).not.toContain("sample-key-only");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("sample-key-only");
  });
  it("does not read credentials when authorization is denied", async () => {
    mocks.auth.mockRejectedValue(new ApiError("forbidden", 403));
    expect((await GET()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
