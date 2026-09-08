import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), sites: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  actor: { findMany: async () => [], count: async () => 0 },
  targetSite: { findMany: mocks.sites },
} }));
import ActorsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubEnv("ACTOR_SYNC_ENABLED", undefined);
  mocks.sites.mockResolvedValue([{ id: "site", name: "เว็บไซต์ทดสอบ" }]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("actor admin page authorization", () => {
  it.each(["MANAGER", "HEAD"])("renders the Push panel for %s with safe destination fields", async role => {
    mocks.auth.mockResolvedValue({ id: "user", role });
    const html = renderToStaticMarkup(await ActorsPage());
    expect(html).toContain("ส่งรายการที่เลือก");
    expect(html).toContain("เว็บไซต์ทดสอบ");
    expect(mocks.sites).toHaveBeenCalledWith({
      where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  });
  it.each(["STAFF", "SENIOR"])("hides Push and does not read destinations for %s", async role => {
    mocks.auth.mockResolvedValue({ id: "user", role });
    const html = renderToStaticMarkup(await ActorsPage());
    expect(html).not.toContain("ส่งรายการที่เลือก");
    expect(mocks.sites).not.toHaveBeenCalled();
  });
  it("hides Push when the deployment kill switch is set", async () => {
    mocks.auth.mockResolvedValue({ id: "user", role: "HEAD" });
    vi.stubEnv("ACTOR_SYNC_ENABLED", "false");
    expect(renderToStaticMarkup(await ActorsPage())).not.toContain("ส่งรายการที่เลือก");
    expect(mocks.sites).not.toHaveBeenCalled();
  });
});
