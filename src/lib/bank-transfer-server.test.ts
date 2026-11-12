/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory Prisma transaction double exercises state transitions without a production database. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  configs: new Map<string, { id: string; config: unknown }>(),
  order: null as any,
  readAttachment: vi.fn(),
  bytes: vi.fn(),
  deleteQr: vi.fn(),
  audit: vi.fn(),
  notice: vi.fn(),
  alert: vi.fn(),
}));
const tx = {
  servicePageConfig: {
    findUnique: vi.fn(
      async ({ where }: any) => m.configs.get(where.id) || null,
    ),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async ({ where }: any) =>
      [...m.configs.values()].filter((r) =>
        r.id.startsWith(where.id.startsWith),
      ),
    ),
    create: vi.fn(async ({ data }: any) => {
      if (m.configs.has(data.id)) throw Error("duplicate");
      m.configs.set(data.id, data);
      return data;
    }),
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const r = m.configs.has(where.id)
        ? { ...m.configs.get(where.id), config: update.config }
        : create;
      m.configs.set(where.id, r);
      return r;
    }),
  },
  adsOrder: {
    findFirst: vi.fn(async ({ where }: any) =>
      m.order?.id === where.id && m.order?.viewerId === where.viewerId
        ? m.order
        : null,
    ),
    findUnique: vi.fn(async () => m.order),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ data }: any) => {
      m.order = { ...m.order, ...data, revision: m.order.revision + 1 };
      return m.order;
    }),
  },
  auditLog: { create: m.audit },
};
vi.mock("./prisma", () => ({ prisma: {} }));
vi.mock("./ads-orders", () => ({
  locked: async (fn: any) => fn(tx),
  orderWebsite: () => "site",
  publicOrder: (o: any) => o,
}));
vi.mock("./ads-attachments", () => ({
  readAttachment: m.readAttachment,
  attachmentBytes: m.bytes,
  deleteBankQr: m.deleteQr,
}));
vi.mock("./ads-renewal-server", () => ({
  ensureRenewalPayable: vi.fn(),
  reservedStatuses: ["PAYMENT", "PAYMENT_REVIEW", "PAID"],
}));
vi.mock("./customer-notices", () => ({ orderNotice: m.notice }));
vi.mock("./ads-notification-events", () => ({ orderAlert: m.alert }));
import {
  closeBankAccount,
  purgeBankAccounts,
  submitTransferSlip,
  reviewTransfer,
  selectTransferAccount,
  recordBankEntry,
} from "./bank-transfer-server";
const id = "11111111-1111-4111-8111-111111111111",
  accountId = "22222222-2222-4222-8222-222222222222",
  fileId = "33333333-3333-4333-8333-333333333333";
const actor = { id: "staff", role: "MANAGER" as const };
beforeEach(() => {
  vi.clearAllMocks();
  m.configs.clear();
  m.configs.set(`bank-account:${accountId}`, {
    id: `bank-account:${accountId}`,
    config: {
      id: accountId,
      bank: "Test bank",
      number: "1234567890",
      name: "Test",
      qr: null,
      closedAt: null,
      purgeAt: null,
      deletedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  });
  m.order = {
    id,
    viewerId: "viewer",
    status: "PAYMENT",
    revision: 1,
    amount: 1500,
    createdAt: new Date(Date.now() - 86400000),
    quote: { bankTransfer: { accountId, state: "awaiting" } },
  };
  m.readAttachment.mockResolvedValue({
    id: fileId,
    owner: "viewer",
    type: "image/png",
  });
  m.bytes.mockResolvedValue(Buffer.from("unique image"));
});
describe("manual bank transfers", () => {
  it("closes immediately and schedules exact 30 day retention without removing ledger", async () => {
    await closeBankAccount(accountId, actor);
    const a: any = m.configs.get(`bank-account:${accountId}`)!.config;
    expect(Date.parse(a.purgeAt) - Date.parse(a.closedAt)).toBe(30 * 86400000);
    await expect(
      selectTransferAccount(id, accountId, "viewer"),
    ).rejects.toThrow("account_closed");
    expect(tx.adsOrder.update).not.toHaveBeenCalled();
  });
  it("purges due bank identity and QR but preserves financial history", async () => {
    const row = m.configs.get(`bank-account:${accountId}`)!;
    row.config = {
      ...(row.config as object),
      qr: fileId,
      closedAt: "2020-01-01T00:00:00.000Z",
      purgeAt: "2020-01-31T00:00:00.000Z",
    };
    m.configs.set("bank-ledger:existing", {
      id: "bank-ledger:existing",
      config: { reference: "retained" },
    });
    expect(await purgeBankAccounts()).toBe(1);
    expect(m.deleteQr).toHaveBeenCalledWith(fileId);
    expect((m.configs.get(row.id)!.config as any).number).toBe("000000");
    expect(m.configs.has("bank-ledger:existing")).toBe(true);
  });
  it("does not mark identity deleted when QR deletion fails", async () => {
    const row = m.configs.get(`bank-account:${accountId}`)!;
    row.config = {
      ...(row.config as object),
      qr: fileId,
      closedAt: "2020-01-01T00:00:00.000Z",
      purgeAt: "2020-01-31T00:00:00.000Z",
    };
    m.deleteQr.mockRejectedValueOnce(Error("storage unavailable"));
    await expect(purgeBankAccounts()).rejects.toThrow();
    expect((row.config as any).deletedAt).toBeNull();
  });
  it("submits evidence without marking paid or creating income", async () => {
    await submitTransferSlip(
      {
        id,
        attachmentId: fileId,
        amountSatang: 150000,
        paidAt: new Date().toISOString(),
      },
      "viewer",
    );
    expect(m.order.status).toBe("PAYMENT_REVIEW");
    expect(m.order.quote.bankTransfer.state).toBe("review");
    expect(
      [...m.configs.keys()].some((k) => k.startsWith("bank-ledger:")),
    ).toBe(false);
  });
  it("rejects another viewers attachment and mismatched amounts", async () => {
    m.readAttachment.mockResolvedValueOnce({
      owner: "other",
      type: "image/png",
    });
    await expect(
      submitTransferSlip(
        {
          id,
          attachmentId: fileId,
          amountSatang: 150000,
          paidAt: new Date().toISOString(),
        },
        "viewer",
      ),
    ).rejects.toThrow("invalid_slip");
    await expect(
      submitTransferSlip(
        {
          id,
          attachmentId: fileId,
          amountSatang: 1,
          paidAt: new Date().toISOString(),
        },
        "viewer",
      ),
    ).rejects.toThrow("amount_mismatch");
    expect(tx.adsOrder.update).not.toHaveBeenCalled();
  });
  it("detects same image bytes reused for a different order", async () => {
    const input = {
      id,
      attachmentId: fileId,
      amountSatang: 150000,
      paidAt: new Date().toISOString(),
    };
    await submitTransferSlip(input, "viewer");
    m.order = {
      ...m.order,
      id: accountId,
      status: "PAYMENT",
      quote: { bankTransfer: { accountId, state: "awaiting" } },
    };
    await expect(
      submitTransferSlip({ ...input, id: accountId }, "viewer"),
    ).rejects.toThrow("duplicate_slip");
  });
  it("confirms actual receipt once with ledger and retains start date workflow", async () => {
    m.order.status = "PAYMENT_REVIEW";
    m.order.quote.bankTransfer.state = "review";
    const input = {
      id,
      revision: 1,
      decision: "confirm" as const,
      reference: "BANK001",
      note: "checked bank statement",
      paidAt: new Date(Date.now() - 10000).toISOString(),
      amountSatang: 150000,
    };
    await reviewTransfer(input, actor);
    expect(m.order.status).toBe("PAID");
    expect(m.order.startsAt).toBeUndefined();
    expect(
      [...m.configs.keys()].filter((k) => k.startsWith("bank-ledger:")),
    ).toHaveLength(1);
    await expect(reviewTransfer(input, actor)).rejects.toThrow(
      "invalid_transition",
    );
  });
  it("routes late payments to refund review and never grants the slot", async () => {
    m.order.status = "EXPIRED";
    m.order.quote.bankTransfer.state = "review";
    await reviewTransfer(
      {
        id,
        revision: 1,
        decision: "confirm",
        reference: "BANK002",
        note: "late transfer",
        paidAt: new Date(Date.now() - 10000).toISOString(),
        amountSatang: 150000,
      },
      actor,
    );
    expect(m.order.status).toBe("REFUND_REQUIRED");
  });
  it("rejects stale staff approval and incorrect receipt amount", async () => {
    m.order.status = "PAYMENT_REVIEW";
    m.order.quote.bankTransfer.state = "review";
    await expect(
      reviewTransfer(
        { id, revision: 2, decision: "confirm", note: "test" },
        actor,
      ),
    ).rejects.toThrow("revision_conflict");
    await expect(
      reviewTransfer(
        {
          id,
          revision: 1,
          decision: "confirm",
          note: "test",
          reference: "BANK003",
          paidAt: new Date().toISOString(),
          amountSatang: 1,
        },
        actor,
      ),
    ).rejects.toThrow("payment_mismatch");
    expect(tx.adsOrder.update).not.toHaveBeenCalled();
  });
  it("manual ledger entry cannot change an order and rejects duplicate bank reference", async () => {
    const input = {
      accountId,
      direction: "OUT" as const,
      amountSatang: 100,
      reference: "TX-123",
      note: "expense",
      occurredAt: new Date(Date.now() - 1000).toISOString(),
    };
    await recordBankEntry(input, actor);
    await expect(recordBankEntry(input, actor)).rejects.toThrow(
      "duplicate_reference",
    );
    expect(tx.adsOrder.update).not.toHaveBeenCalled();
  });
});
