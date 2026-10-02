import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { disconnect, connect } = vi.hoisted(() => ({ disconnect: vi.fn(), connect: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $disconnect: disconnect, $connect: connect } }));

import { withPrismaReadReconnect, withPrismaTransactionStartReconnect } from "./prisma-reconnect";

function databaseError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("connection unavailable", { code, clientVersion: "6.19.3" });
}

describe("Prisma reconnect", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disconnect.mockResolvedValue(undefined);
    connect.mockResolvedValue(undefined);
  });

  it.each(["P1001", "P1017"])("reconnects and repeats one read after %s", async code => {
    const read = vi.fn().mockRejectedValueOnce(databaseError(code)).mockResolvedValueOnce("ok");
    await expect(withPrismaReadReconnect(read)).resolves.toBe("ok");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("shares one reconnect across concurrent failed reads", async () => {
    let releaseConnect!: () => void;
    connect.mockImplementation(() => new Promise<void>(resolve => { releaseConnect = resolve; }));
    const first = vi.fn().mockRejectedValueOnce(databaseError("P1001")).mockResolvedValueOnce("first");
    const second = vi.fn().mockRejectedValueOnce(databaseError("P1017")).mockResolvedValueOnce("second");

    const reads = Promise.all([withPrismaReadReconnect(first), withPrismaReadReconnect(second)]);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    releaseConnect();

    await expect(reads).resolves.toEqual(["first", "second"]);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("recognizes a failed reconnect as a database outage", async () => {
    connect.mockRejectedValueOnce(new Prisma.PrismaClientInitializationError("connection unavailable", "6.19.3", "P1001"));
    await expect(withPrismaReadReconnect(() => Promise.reject(databaseError("P1001")))).rejects.toMatchObject({ errorCode: "P1001" });
  });

  it("does not repeat a transaction after its callback started", async () => {
    const transaction = vi.fn(async (markStarted: () => void) => {
      markStarted();
      throw databaseError("P1017");
    });
    await expect(withPrismaTransactionStartReconnect(transaction)).rejects.toMatchObject({ code: "P1017" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("repeats a transaction only when its callback never started", async () => {
    const transaction = vi.fn().mockRejectedValueOnce(databaseError("P1001")).mockResolvedValueOnce("saved");
    await expect(withPrismaTransactionStartReconnect(transaction)).resolves.toBe("saved");
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
