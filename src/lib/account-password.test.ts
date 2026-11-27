import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: { findUnique: vi.fn(), updateMany: vi.fn() },
  session: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  pendingActions: { updateMany: vi.fn() }, audit: { create: vi.fn() },
  transaction: vi.fn(), verify: vi.fn(), lock: vi.fn(), hash: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { viewer: mocks.viewer, $transaction: mocks.transaction } }));
vi.mock("@/lib/viewer-auth", () => ({ verifyPassword: mocks.verify, lockViewerCredentials: mocks.lock, hashPassword: mocks.hash, hashToken: (token: string) => `hashed:${token}` }));
import { changeViewerPassword } from "./account-password";

const input = { currentPassword: "current-valid-1", newPassword: "new-password-2" };
const activeExpiry = new Date("2099-01-01");

describe("viewer password and session change", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.viewer.findUnique.mockResolvedValue({ passwordHash: "old", suspended: false });
    mocks.session.findUnique.mockResolvedValue({ id: "this-device", viewerId: "viewer-1", expiresAt: activeExpiry });
    mocks.verify.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("new-hash");
    mocks.viewer.updateMany.mockResolvedValue({ count: 1 });
    mocks.session.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((fn) => fn({ viewer: mocks.viewer, viewerSession: mocks.session, accountAction: mocks.pendingActions, auditLog: mocks.audit }));
  });

  it("checks the current password and UTF-8 byte limit before writing", async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(changeViewerPassword("viewer-1", "old-cookie", input)).rejects.toThrow("invalid_current_password");
    await expect(changeViewerPassword("viewer-1", "old-cookie", { ...input, newPassword: "ก".repeat(25) })).rejects.toThrow("password_too_long");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale token and a concurrent change of the password hash", async () => {
    mocks.session.findUnique.mockResolvedValueOnce(null);
    await expect(changeViewerPassword("viewer-1", "old-cookie", input)).rejects.toThrow("unauthorized");
    expect(mocks.viewer.updateMany).not.toHaveBeenCalled();
    mocks.viewer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(changeViewerPassword("viewer-1", "old-cookie", input)).rejects.toThrow("credentials_changed");
    expect(mocks.session.deleteMany).not.toHaveBeenCalled();
  });

  it("rotates the current cookie and invalidates other sessions and outstanding reset links", async () => {
    const result = await changeViewerPassword("viewer-1", "old-cookie", input);
    expect(result.token).not.toBe("old-cookie");
    expect(result.expiresAt).toBe(activeExpiry);
    expect(mocks.viewer.updateMany).toHaveBeenCalledWith({ where: { id: "viewer-1", suspended: false, passwordHash: "old" }, data: { passwordHash: "new-hash" } });
    expect(mocks.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { tokenHash: `hashed:${result.token}` } }));
    expect(mocks.session.deleteMany).toHaveBeenCalledWith({ where: { viewerId: "viewer-1", id: { not: "this-device" } } });
    expect(mocks.pendingActions.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { viewerId: "viewer-1", purpose: "reset", consumedAt: null } }));
    expect(mocks.audit.create).toHaveBeenCalledWith({ data: { actorRole: "SYSTEM", action: "member_password_changed", resourceType: "viewer", resourceId: "viewer-1" } });
  });
});
