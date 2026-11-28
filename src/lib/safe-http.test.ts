import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { isPublicAddress, safeFetch } from "./safe-http";

describe("pinned safe HTTPS transport", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("rejects private/mapped/transition IPs and mixed DNS answers before connecting", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "::ffff:7f00:1", "::ffff:127.0.0.1", "2002:7f00:1::", "fc00::1", "169.254.169.254", "192.0.2.1"]) expect(isPublicAddress(ip)).toBe(false);
    mocks.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(safeFetch("https://catalog.test", new AbortController().signal)).rejects.toThrow(/สาธารณะ/); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("pins DNS to the actual socket and checks redirect destinations", async () => {
    mocks.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    mocks.request.mockImplementation((_url, options, respond) => {
      const callback = vi.fn(); options.lookup("catalog.test", { all: true }, callback);
      expect(callback).toHaveBeenCalledWith(null, [{ address: "1.1.1.1", family: 4 }]);
      const req = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), end: () => {
        const res = Object.assign(Readable.from([]), { statusCode: 302, headers: { location: "https://127.0.0.1/private" } }); respond(res);
      } }); return req;
    });
    await expect(safeFetch("https://catalog.test", new AbortController().signal)).rejects.toThrow(/สาธารณะ/);
    expect(mocks.request).toHaveBeenCalledTimes(1); expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
  it("does not redirect a playback POST or attach browser credentials", async () => {
    mocks.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    mocks.request.mockImplementation((_url, options, respond) => {
      expect(options.method).toBe("POST");
      expect(options.headers).not.toHaveProperty("authorization");
      expect(options.headers).not.toHaveProperty("cookie");
      expect(options.headers).not.toHaveProperty("referer");
      return Object.assign(new EventEmitter(), { setTimeout: vi.fn(), end: () => {
        respond(Object.assign(Readable.from([]), { statusCode: 307, headers: { location: "https://other.test/" } }));
      } });
    });
    await expect(safeFetch("https://catalog.test/", new AbortController().signal, { method: "POST" }))
      .rejects.toThrow("playback selection redirect");
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
