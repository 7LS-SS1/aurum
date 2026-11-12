import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api-response";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  read: vi.fn(),
  select: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/lib/viewer-auth", () => ({ requireViewerFromRequest: m.auth }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/lib/bank-transfer-server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/bank-transfer-server")>();
  return {
    ...original,
    readTransferOrder: m.read,
    selectTransferAccount: m.select,
    submitTransferSlip: m.submit,
  };
});
import { GET, POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ id: "owner" });
  m.read.mockResolvedValue({
    order: { status: "REVIEW" },
    transfer: null,
    accounts: [
      { id, bank: "bank", name: "test", number: "1234567890", qr: null },
    ],
  });
});
it("requires authentication before returning account information", async () => {
  m.auth.mockRejectedValueOnce(new ApiError("unauthorized", 401));
  expect(
    (
      await GET(
        new NextRequest(
          `https://example.com/api/public/payments/bank-transfer?id=${id}`,
        ),
      )
    ).status,
  ).toBe(401);
  expect(m.read).not.toHaveBeenCalled();
});
it("hides bank number before the account has been selected", async () => {
  const r = await GET(
    new NextRequest(
      `https://example.com/api/public/payments/bank-transfer?id=${id}`,
    ),
  );
  expect((await r.json()).accounts[0].number).toBe("");
  expect(m.read).toHaveBeenCalledWith(id, "owner");
});
it("rejects cross origin writes before invoking transfer operations", async () => {
  const r = await POST(
    new NextRequest("https://example.com/api/public/payments/bank-transfer", {
      method: "POST",
      headers: {
        origin: "https://attacker.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "select", data: { id, accountId: id } }),
    }),
  );
  expect(r.status).toBe(403);
  expect(m.select).not.toHaveBeenCalled();
});
it("does not serve a QR belonging to another account/order", async () => {
  const r = await GET(
    new NextRequest(
      `https://example.com/api/public/payments/bank-transfer?id=${id}&qr=${id}`,
    ),
  );
  expect(r.status).toBe(404);
});
