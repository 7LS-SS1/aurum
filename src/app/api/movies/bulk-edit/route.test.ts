import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-response";
const mocks = vi.hoisted(() => ({ role: vi.fn(), transaction: vi.fn(), find: vi.fn(), update: vi.fn(), audit: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/cache", () => ({ invalidatePublicMovieCaches: mocks.cache }));
import { POST } from "./route";
const request = (body: unknown) => new NextRequest("http://localhost/api/movies/bulk-edit", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "staff", role: "STAFF" });
  mocks.find.mockResolvedValue([{ id: "a", status: "DONE", categories: ["old"], tags: [{ name: "old" }] }]);
  mocks.transaction.mockImplementation(fn => fn({ movie: { findMany: mocks.find, update: mocks.update }, auditLog: { create: mocks.audit } }));
});
describe("bulk edit route", () => {
  const body = { ids: ["a"], mode: "append", tags: ["new"] };
  it("rejects unauthenticated requests before database access", async () => {
    mocks.role.mockRejectedValue(new ApiError("unauthorized", 401));
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("refuses missing or publishing movies before any writes", async () => {
    mocks.find.mockResolvedValue([]);
    expect((await POST(request(body))).status).toBe(404);
    mocks.find.mockResolvedValue([{ id: "a", status: "PUBLISHING" }]);
    expect((await POST(request(body))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("updates only selected fields and audits within the transaction", async () => {
    expect((await POST(request(body))).status).toBe(200);
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.categories).toBeUndefined(); expect(data.mainCategory).toBeUndefined();
    expect(data.tags.connectOrCreate.map((x: { where: { name: string } }) => x.where.name)).toEqual(["old", "new"]);
    expect(mocks.audit).toHaveBeenCalledOnce(); expect(mocks.cache).toHaveBeenCalledOnce();
    expect(mocks.transaction.mock.calls[0]![1].isolationLevel).toBe("Serializable");
  });
  it("rejects unexpected fields and does not invalidate cache after failure", async () => {
    expect((await POST(request({ ...body, videoUrl: "https://example.org" }))).status).toBe(422);
    mocks.update.mockRejectedValue(new Error("write failure"));
    expect((await POST(request(body))).status).toBe(500);
    expect(mocks.cache).not.toHaveBeenCalled();
  });
});
