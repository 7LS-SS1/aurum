import { describe, it, expect, vi, afterEach } from "vitest";
import { WordPressClient } from "./wordpress-client";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function client(overrides: Partial<ConstructorParameters<typeof WordPressClient>[0]> = {}) {
  return new WordPressClient({
    baseUrl: "https://example.com/",
    authType: "APP_PASSWORD",
    username: "admin",
    credential: "app-password",
    ...overrides,
  });
}

describe("WordPressClient construction", () => {
  it("strips trailing slashes from baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: "Admin" }));
    vi.stubGlobal("fetch", fetchMock);
    await client().ping();
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/wp-json/wp/v2/users/me?context=edit", expect.anything());
  });

  it("defaults postType/categoryRestBase/tagRestBase when not provided", () => {
    const c = client();
    expect(c.postType).toBe("posts");
    expect(c.categoryRestBase).toBe("categories");
    expect(c.tagRestBase).toBe("tags");
  });
});

describe("auth header", () => {
  it("sends Basic auth (base64 of username:credential) for APP_PASSWORD", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: "Admin" }));
    vi.stubGlobal("fetch", fetchMock);
    await client().ping();
    const init = fetchMock.mock.calls[0]?.[1];
    const expected = `Basic ${Buffer.from("admin:app-password").toString("base64")}`;
    expect(init.headers.Authorization).toBe(expected);
  });

  it("sends a Bearer token for JWT auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: "Admin" }));
    vi.stubGlobal("fetch", fetchMock);
    await client({ authType: "JWT", credential: "jwt-token-123" }).ping();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init.headers.Authorization).toBe("Bearer jwt-token-123");
  });
});

describe("json() error handling", () => {
  it("throws an error containing the site's message field on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Invalid credentials" }, false, 401)));
    await expect(client().ping()).rejects.toThrow("Invalid credentials");
  });

  it("falls back to 'HTTP status statusText' when there is no message field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));
    await expect(client().ping()).rejects.toThrow("HTTP 500");
  });
});

describe("resolveTerm", () => {
  it("returns the existing term id on an exact case-insensitive name match", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 7, name: "Action" }]));
    vi.stubGlobal("fetch", fetchMock);
    const id = await client().resolveTerm("categories", "action");
    expect(id).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no create call needed
  });

  it("creates a new term when no exact match is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 99, name: "NewTag" }));
    vi.stubGlobal("fetch", fetchMock);
    const id = await client().resolveTerm("tags", "NewTag");
    expect(id).toBe(99);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  });
});

describe("resolveCategoryTree", () => {
  it("resolves the main category then each sub-category as a child term, deduping ids", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Main" }])) // main category lookup
      .mockResolvedValueOnce(jsonResponse([{ id: 2, name: "Sub", parent: 1 }])) // sub lookup
      .mockResolvedValueOnce(jsonResponse([{ id: 2, name: "Sub", parent: 1 }])); // duplicate sub, same id
    vi.stubGlobal("fetch", fetchMock);
    const ids = await client().resolveCategoryTree("categories", "Main", ["Sub", "Sub"]);
    expect(ids).toEqual([1, 2]);
  });

  it("skips a sub-category that fails to resolve instead of throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Main" }]))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const ids = await client().resolveCategoryTree("categories", "Main", ["Broken"]);
    expect(ids).toEqual([1]);
  });
});

describe("getAurumEngagement", () => {
  it("calls the aurum/v1 engagement endpoint for the given post id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ postId: 5, views: 10, likes: 2, dislikes: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await client().getAurumEngagement(5);
    expect(result).toEqual({ postId: 5, views: 10, likes: 2, dislikes: 0 });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/wp-json/aurum/v1/posts/5/engagement", expect.anything());
  });
});
