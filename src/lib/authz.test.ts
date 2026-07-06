import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.AUTH_SECRET ??= "a".repeat(32);
process.env.ENCRYPTION_KEY ??= "0".repeat(64);
process.env.SYSTEM_API_KEY = "test-system-key-1234567890";

const { requireRole, requireMinRole, requireAdmin, requireSystemKey, requireRoleOrSystem } = await import("./authz");

function fakeSession(role: string | undefined, id = "user-1") {
  return role ? { user: { id, role } } : null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireRole", () => {
  it("rejects with 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireRole("HEAD")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects with 403 when the session role is not in the allowed list", async () => {
    authMock.mockResolvedValue(fakeSession("STAFF"));
    await expect(requireRole("HEAD", "MANAGER")).rejects.toMatchObject({ status: 403 });
  });

  it("resolves with the actor when the role is allowed", async () => {
    authMock.mockResolvedValue(fakeSession("MANAGER", "u-42"));
    await expect(requireRole("HEAD", "MANAGER")).resolves.toEqual({ id: "u-42", role: "MANAGER" });
  });
});

describe("requireMinRole", () => {
  it("rejects SYSTEM even though it has no rank", async () => {
    authMock.mockResolvedValue(fakeSession("SYSTEM"));
    await expect(requireMinRole("STAFF")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a role ranked below the minimum", async () => {
    authMock.mockResolvedValue(fakeSession("STAFF"));
    await expect(requireMinRole("MANAGER")).rejects.toMatchObject({ status: 403 });
  });

  it("allows a role ranked at or above the minimum", async () => {
    authMock.mockResolvedValue(fakeSession("HEAD"));
    await expect(requireMinRole("MANAGER")).resolves.toEqual({ id: "user-1", role: "HEAD" });
  });
});

describe("requireAdmin", () => {
  it("only allows HEAD", async () => {
    authMock.mockResolvedValue(fakeSession("MANAGER"));
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });

    authMock.mockResolvedValue(fakeSession("HEAD"));
    await expect(requireAdmin()).resolves.toEqual({ id: "user-1", role: "HEAD" });
  });
});

describe("requireSystemKey", () => {
  it("rejects when the header is missing", () => {
    const req = new Request("http://x", {});
    expect(() => requireSystemKey(req)).toThrow();
  });

  it("rejects when the header doesn't match the configured key", () => {
    const req = new Request("http://x", { headers: { "x-system-key": "wrong-key" } });
    expect(() => requireSystemKey(req)).toThrow();
  });

  it("accepts a matching header and returns the SYSTEM actor", () => {
    const req = new Request("http://x", { headers: { "x-system-key": "test-system-key-1234567890" } });
    expect(requireSystemKey(req)).toEqual({ id: null, role: "SYSTEM" });
  });
});

describe("requireRoleOrSystem", () => {
  it("accepts a valid X-System-Key when SYSTEM is in the allowed list, without checking the session", async () => {
    const req = new Request("http://x", { headers: { "x-system-key": "test-system-key-1234567890" } });
    const actor = await requireRoleOrSystem(req, "SYSTEM", "HEAD");
    expect(actor).toEqual({ id: null, role: "SYSTEM" });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("falls back to a human session check when the system key is absent", async () => {
    authMock.mockResolvedValue(fakeSession("HEAD"));
    const req = new Request("http://x", {});
    await expect(requireRoleOrSystem(req, "SYSTEM", "HEAD")).resolves.toEqual({ id: "user-1", role: "HEAD" });
  });

  it("rejects a bad system key even when SYSTEM is allowed, falling through to the human check", async () => {
    authMock.mockResolvedValue(null);
    const req = new Request("http://x", { headers: { "x-system-key": "wrong-key" } });
    await expect(requireRoleOrSystem(req, "SYSTEM", "HEAD")).rejects.toMatchObject({ status: 401 });
  });
});
