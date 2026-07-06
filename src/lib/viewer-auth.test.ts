import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const viewerSessionCreate = vi.fn();
const viewerSessionFindUnique = vi.fn();
const viewerSessionUpdate = vi.fn();
const viewerSessionDeleteMany = vi.fn();
const cookiesMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    viewerSession: {
      create: viewerSessionCreate,
      findUnique: viewerSessionFindUnique,
      update: viewerSessionUpdate,
      deleteMany: viewerSessionDeleteMany,
    },
  },
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));

const {
  VIEWER_COOKIE_NAME,
  hashToken,
  hashPassword,
  verifyPassword,
  createViewerSession,
  setViewerSessionCookie,
  clearViewerSessionCookie,
  getViewerFromRequest,
  requireViewerFromRequest,
  getViewerFromCookies,
  deleteViewerSessionByToken,
} = await import("./viewer-auth");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hashToken", () => {
  it("is deterministic — the same token always hashes the same way", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("abc")).not.toBe(hashToken("xyz"));
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password through bcrypt", async () => {
    const hash = await hashPassword("my-password");
    expect(await verifyPassword("my-password", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("my-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("createViewerSession", () => {
  it("stores a hash of a fresh random token, not the token itself", async () => {
    viewerSessionCreate.mockResolvedValue({});
    const req = new Request("http://x", { headers: { "user-agent": "test-agent" } });

    const { token, expiresAt } = await createViewerSession("viewer-1", req);

    expect(token).toHaveLength(43); // base64url of 32 bytes
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const call = viewerSessionCreate.mock.calls[0]?.[0];
    expect(call.data.tokenHash).toBe(hashToken(token));
    expect(call.data.viewerId).toBe("viewer-1");
  });
});

describe("cookie helpers", () => {
  it("sets an httpOnly, path=/ cookie with the given expiry", () => {
    const res = NextResponse.json({});
    setViewerSessionCookie(res, "tok", new Date(Date.now() + 1000));
    const cookie = res.cookies.get(VIEWER_COOKIE_NAME);
    expect(cookie?.value).toBe("tok");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("clears the cookie by setting maxAge 0", () => {
    const res = NextResponse.json({});
    clearViewerSessionCookie(res);
    const cookie = res.cookies.get(VIEWER_COOKIE_NAME);
    expect(cookie?.value).toBe("");
  });
});

describe("getViewerFromRequest", () => {
  it("returns null when there is no session cookie", async () => {
    const req = new NextRequest("http://x");
    expect(await getViewerFromRequest(req)).toBeNull();
    expect(viewerSessionFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the token doesn't match any session", async () => {
    viewerSessionFindUnique.mockResolvedValue(null);
    const req = new NextRequest("http://x", { headers: { cookie: `${VIEWER_COOKIE_NAME}=badtoken` } });
    expect(await getViewerFromRequest(req)).toBeNull();
  });

  it("returns null when the session is expired", async () => {
    viewerSessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      viewer: { id: "v1", email: "a@b.com", displayName: "A" },
    });
    const req = new NextRequest("http://x", { headers: { cookie: `${VIEWER_COOKIE_NAME}=sometoken` } });
    expect(await getViewerFromRequest(req)).toBeNull();
  });

  it("returns the viewer for a valid, unexpired session", async () => {
    viewerSessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      viewer: { id: "v1", email: "a@b.com", displayName: "A" },
    });
    const req = new NextRequest("http://x", { headers: { cookie: `${VIEWER_COOKIE_NAME}=goodtoken` } });
    expect(await getViewerFromRequest(req)).toEqual({ id: "v1", email: "a@b.com", displayName: "A" });
  });

  it("refreshes the expiry (sliding session) when under the 15-day threshold", async () => {
    viewerSessionUpdate.mockResolvedValue({});
    viewerSessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days left, under 15-day threshold
      viewer: { id: "v1", email: "a@b.com", displayName: "A" },
    });
    const req = new NextRequest("http://x", { headers: { cookie: `${VIEWER_COOKIE_NAME}=goodtoken` } });
    await getViewerFromRequest(req);
    expect(viewerSessionUpdate).toHaveBeenCalled();
  });
});

describe("requireViewerFromRequest", () => {
  it("throws when there is no valid viewer session", async () => {
    const req = new NextRequest("http://x");
    await expect(requireViewerFromRequest(req)).rejects.toMatchObject({ status: 401 });
  });
});

describe("getViewerFromCookies", () => {
  it("reads the session cookie via next/headers cookies() for server components", async () => {
    viewerSessionFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      viewer: { id: "v1", email: "a@b.com", displayName: "A" },
    });
    cookiesMock.mockResolvedValue({ get: () => ({ value: "sometoken" }) });
    expect(await getViewerFromCookies()).toEqual({ id: "v1", email: "a@b.com", displayName: "A" });
  });
});

describe("deleteViewerSessionByToken", () => {
  it("does nothing when the token is undefined", async () => {
    await deleteViewerSessionByToken(undefined);
    expect(viewerSessionDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes the session matching the token's hash", async () => {
    viewerSessionDeleteMany.mockResolvedValue({ count: 1 });
    await deleteViewerSessionByToken("sometoken");
    expect(viewerSessionDeleteMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken("sometoken") } });
  });
});
