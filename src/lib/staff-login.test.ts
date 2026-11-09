import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), compare: vi.fn(), limit: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { user: { findUnique: mocks.find } } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("./rate-limit", () => ({ clientIp: () => "127.0.0.1", rateLimit: mocks.limit }));
import { authenticateStaff } from "./staff-login";
const req = new Request("https://aurum.example/api/auth/callback/credentials");
const input = { email: "admin@example.test", password: "correct-password" };
beforeEach(() => { vi.resetAllMocks(); mocks.limit.mockResolvedValue({ success: true }); });
describe("staff login protection", () => {
  it("rejects throttled IPs before database or hashing work", async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect(await authenticateStaff(input, req)).toBeNull();
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.compare).not.toHaveBeenCalled();
  });
  it("enforces an account budget even when the IP budget permits", async () => {
    mocks.limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    expect(await authenticateStaff(input, req)).toBeNull(); expect(mocks.find).not.toHaveBeenCalled();
  });
  it("rejects oversized credentials before querying the database", async () => {
    expect(await authenticateStaff({ ...input, password: "x".repeat(1025) }, req)).toBeNull();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("returns only the session identity after a valid password", async () => {
    mocks.find.mockResolvedValue({ id: "u1", email: input.email, name: "Admin", role: "HEAD", passwordHash: "secret" });
    mocks.compare.mockResolvedValue(true);
    expect(await authenticateStaff(input, req)).toEqual({ id: "u1", email: input.email, name: "Admin", role: "HEAD" });
    mocks.compare.mockResolvedValue(false);
    expect(await authenticateStaff(input, req)).toBeNull();
  });
});
