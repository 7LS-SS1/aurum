import { describe, expect, it, vi } from "vitest";
import { cachePublic, invalidatePublicCache } from "./cache";

describe("cachePublic", () => {
  it("coalesces concurrent misses and reuses the cached value", async () => {
    const source = vi.fn(async () => ({ value: 42 }));
    const namespace = `test-coalesce-${Date.now()}`;

    const [first, second] = await Promise.all([
      cachePublic(namespace, ["key"], 60, source),
      cachePublic(namespace, ["key"], 60, source),
    ]);
    const third = await cachePublic(namespace, ["key"], 60, source);

    expect(first).toEqual({ value: 42 });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("removes every key in an invalidated namespace", async () => {
    const namespace = `test-invalidate-${Date.now()}`;
    const source = vi.fn(async () => "fresh");
    await cachePublic(namespace, ["a"], 60, source);
    await cachePublic(namespace, ["b"], 60, source);

    await invalidatePublicCache(namespace);
    await cachePublic(namespace, ["a"], 60, source);
    await cachePublic(namespace, ["b"], 60, source);

    expect(source).toHaveBeenCalledTimes(4);
  });
});
