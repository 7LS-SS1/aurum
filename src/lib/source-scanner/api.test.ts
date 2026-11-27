import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), save: vi.fn(), control: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("./store", () => ({ saveSource: mocks.save, setControl: mocks.control, getSource: mocks.get }));
import { ApiError } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { controlSource, createSource } from "./api";
const context = { params: Promise.resolve({ id: "s" }) };
describe("source API authorization", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("requires MANAGER before reading a mutation body", async () => {
    mocks.role.mockRejectedValue(new ApiError("forbidden", 403));
    const result = await createSource(new Request("https://app.test/api/video-sources", { method: "POST", body: "invalid" }), context);
    expect(result.status).toBe(403); expect(mocks.role).toHaveBeenCalledWith("MANAGER"); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects incomplete source configuration and invalid controls", async () => {
    mocks.role.mockResolvedValue({ id: "actor", role: "MANAGER" });
    expect((await createSource(new Request("https://app.test", { method: "POST", body: "{}" }), context)).status).toBe(422);
    expect((await controlSource(new Request("https://app.test", { method: "POST", body: '{"action":"PUBLISH"}' }), context)).status).toBe(422);
    expect(mocks.control).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports a missing scanner table without disclosing the database error", async () => {
    mocks.role.mockResolvedValue({ id: "actor", role: "MANAGER" });
    mocks.control.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('The table `public.video_sources` does not exist. Internal detail.', { code: "P2021", clientVersion: "test" }));
    const response = await controlSource(new Request("https://app.test", { method: "POST", body: '{"action":"RUN"}' }), context);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("SCANNER_MIGRATION_REQUIRED");
    expect(body.error).not.toContain("Internal detail");
  });
});
