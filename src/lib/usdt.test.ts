import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  unitsFor,
  displayUnits,
  transferData,
  token,
  rpcAddress,
  tronToken,
  tronAddress,
} from "./usdt";
const mock = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  notice: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: { adsOrder: { findMany: mock.list } } }));
vi.mock("./ads-orders", () => ({
  locked: (fn: (tx: unknown) => unknown) =>
    fn({
      adsOrder: { findUniqueOrThrow: mock.get, update: mock.update },
      auditLog: { create: mock.audit },
    }),
}));
vi.mock("./customer-notices", () => ({ orderNotice: mock.notice }));
import { recoverUsdt } from "./usdt-server";
const from = "0x" + "1".repeat(40),
  to = "0x" + "2".repeat(40);
const bill = {
  from,
  to,
  units: unitsFor(100, "32"),
  rate: "32",
  cursor: 10,
  tag: "a".repeat(32),
  expires: "2099-01-01T00:00:00Z",
  archived: false,
};
const row = { id: "order", status: "PAYMENT", quote: { usdt: bill } };
function chain(input: string, network: "bsc" | "tron" = "bsc") {
  const asset = network === "tron" ? rpcAddress(tronToken, "tron") : token;
  const amount = unitsFor(100, "32", network);
  const topics = [
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    ...[from, to].map((a) => "0x" + a.slice(2).padStart(64, "0")),
  ];
  vi.stubGlobal("fetch", async (_: unknown, options: { body: string }) => {
    const { method } = JSON.parse(options.body);
    const results: Record<string, unknown> = {
      eth_chainId: network === "tron" ? "0x2b6653dc" : "0x38",
      eth_getBlockByNumber: { number: "0xb", timestamp: "0x123" },
      eth_getLogs: [
        {
          address: asset,
          topics,
          data: "0x" + BigInt(amount).toString(16),
          transactionHash: "0xabc",
          blockNumber: "0xb",
        },
      ],
      eth_getTransactionByHash: { input, to: asset, from },
    };
    return Response.json({ result: results[method] });
  });
}
describe("USDT checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("USDT_BSC_RPC_URL", "https://example.test");
    mock.list.mockResolvedValue([row]);
    mock.get.mockResolvedValue(row);
  });
  it("rounds the quoted amount up to four decimal places", () => {
    expect(displayUnits(unitsFor(100, "31"))).toBe("3.2259");
  });
  it("checks TRON address checksum and recognizes only the tagged six-decimal mainnet transfer", async () => {
    const tronFrom = "TBXSw8fM4jpQkGc6zZjsVABFpVN7UvXPdV",
      tronTo = "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E";
    expect(tronAddress.safeParse(tronFrom.slice(0, -1) + "1").success).toBe(
      false,
    );
    const tr = {
      ...bill,
      network: "tron" as const,
      from: tronFrom,
      to: tronTo,
      units: unitsFor(100, "32", "tron"),
    };
    expect(tr.units).toBe("3125000");
    expect(displayUnits(tr.units, "tron")).toBe("3.1250");
    vi.stubEnv("USDT_TRON_RPC_URL", "https://tron.example.test");
    const order = { ...row, quote: { usdt: tr } };
    mock.list.mockResolvedValue([order]);
    mock.get.mockResolvedValue(order);
    chain(transferData({ ...tr, tag: "b".repeat(32) }), "tron");
    await recoverUsdt();
    expect(mock.notice).not.toHaveBeenCalled();
    chain(transferData(tr), "tron");
    await recoverUsdt();
    expect(mock.update.mock.lastCall?.[0].data).toMatchObject({
      status: "PAID",
      paymentReference: "tron:0xabc",
    });
  });
  it.each(["bsc", "tron"] as const)(
    "matches only the exact mobile amount on %s without a wallet signature",
    async (network) => {
      const to =
        network === "tron" ? "TD5gsCwxykWsLN9aPrq2TAfNjByuZKYp4E" : bill.to;
      const units = network === "tron" ? "3124999" : "3124999000000000000";
      expect(displayUnits(units, network)).toBe("3.124999");
      const order = {
        ...row,
        quote: {
          usdt: { ...bill, network, to, units, mobile: true, from: null },
        },
      };
      mock.list.mockResolvedValue([order]);
      mock.get.mockResolvedValue(order);
      vi.stubEnv("USDT_TRON_RPC_URL", "https://tron.example.test");
      let actual = BigInt(units) - 1n;
      const fetcher = vi.fn(async (_: unknown, options: { body: string }) => {
        const { method, params } = JSON.parse(options.body);
        if (method === "eth_chainId")
          return Response.json({
            result: network === "tron" ? "0x2b6653dc" : "0x38",
          });
        if (method === "eth_getBlockByNumber")
          return Response.json({
            result: { number: "0xb", timestamp: "0x123" },
          });
        if (method !== "eth_getLogs") throw Error("Unexpected RPC");
        const f = params[0];
        expect(f.topics[1]).toBeNull();
        return Response.json({
          result: [
            {
              address: f.address,
              topics: [f.topics[0], "0x" + "1".repeat(64), f.topics[2]],
              data: "0x" + actual.toString(16),
              blockNumber: "0xb",
              transactionHash: "0xabc",
              logIndex: "0x4",
            },
          ],
        });
      });
      vi.stubGlobal("fetch", fetcher);
      await recoverUsdt();
      expect(mock.notice).not.toHaveBeenCalled();
      actual = BigInt(units);
      await recoverUsdt();
      expect(mock.update.mock.lastCall?.[0].data).toMatchObject({
        status: "PAID",
        paymentReference: network + ":0xabc:4",
      });
    },
  );
  it("settles the finalized transfer once for its invoice", async () => {
    chain(transferData(bill));
    await recoverUsdt();
    expect(mock.update.mock.calls[0]?.[0].data).toMatchObject({
      status: "PAID",
      paymentReference: "bsc:0xabc",
      quote: { usdt: { settled: true, archived: true } },
    });
    mock.get.mockResolvedValue({
      ...row,
      quote: { usdt: { ...bill, settled: true } },
    });
    await recoverUsdt();
    expect(mock.notice).toHaveBeenCalledTimes(1);
  });
  it("ignores a matching amount and recipient belonging to a different invoice", async () => {
    chain(transferData({ ...bill, tag: "b".repeat(32) }));
    await recoverUsdt();
    expect(mock.notice).not.toHaveBeenCalled();
    expect(mock.update.mock.calls[0]?.[0].data.status).toBe("PAYMENT");
  });
  it("wraps the cursor and flags a pending invoice on RPC failure without advancing its block",async()=>{
    mock.list.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("RPC offline")));
    expect(await recoverUsdt("last-order")).toMatchObject({failed:1,cursor:row.id});
    expect(mock.update).not.toHaveBeenCalled();
    chain(transferData(bill));await recoverUsdt();
    expect(mock.notice).toHaveBeenCalledOnce();
  });
  it("routes a transfer on a released reservation for review", async () => {
    mock.get.mockResolvedValue({ ...row, status: "EXPIRED" });
    chain(transferData(bill));
    await recoverUsdt();
    expect(mock.update.mock.calls[0]?.[0].data.status).toBe("REFUND_REQUIRED");
  });
});
