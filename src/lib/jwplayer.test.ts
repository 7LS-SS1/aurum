import { describe, it, expect, vi, beforeEach } from "vitest";

const playerConfigFindFirst = vi.fn();
const decryptMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { playerConfig: { findFirst: playerConfigFindFirst } },
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: decryptMock,
}));

const {
  buildJwPlayerIframeUrl,
  getDefaultJwPlayerConfig,
  getDefaultJwPlayerCredentials,
  createJwPlayerMediaFromUrl,
} = await import("./jwplayer");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildJwPlayerIframeUrl", () => {
  it("builds a cdn.jwplayer.com URL from a media id and player id", () => {
    const url = buildJwPlayerIframeUrl("media123", { playerId: "player456" });
    expect(url).toBe("https://cdn.jwplayer.com/players/media123-player456.html");
  });

  it("returns undefined when mediaId is missing", () => {
    expect(buildJwPlayerIframeUrl(undefined, { playerId: "p1" })).toBeUndefined();
    expect(buildJwPlayerIframeUrl("", { playerId: "p1" })).toBeUndefined();
  });

  it("returns undefined when the player identity is missing", () => {
    expect(buildJwPlayerIframeUrl("media123", null)).toBeUndefined();
    expect(buildJwPlayerIframeUrl("media123", undefined)).toBeUndefined();
  });

  it("URL-encodes ids that contain special characters", () => {
    const url = buildJwPlayerIframeUrl("m/1", { playerId: "p 2" });
    expect(url).toBe("https://cdn.jwplayer.com/players/m%2F1-p%202.html");
  });
});

describe("getDefaultJwPlayerConfig", () => {
  it("queries for the default active JWPlayer config, preferring isDefault", async () => {
    playerConfigFindFirst.mockResolvedValue({ playerId: "p1" });
    const result = await getDefaultJwPlayerConfig();
    expect(result).toEqual({ playerId: "p1" });
    expect(playerConfigFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { provider: "JWPLAYER", isActive: true } }),
    );
  });
});

describe("getDefaultJwPlayerCredentials", () => {
  it("returns null when there is no active JWPlayer config", async () => {
    playerConfigFindFirst.mockResolvedValue(null);
    expect(await getDefaultJwPlayerCredentials()).toBeNull();
  });

  it("decrypts the api secret and reads siteId out of extraConfig", async () => {
    playerConfigFindFirst.mockResolvedValue({
      playerId: "p1",
      apiSecretEnc: "enc",
      apiSecretIv: "iv",
      apiSecretTag: "tag",
      extraConfig: { siteId: "site-99" },
    });
    decryptMock.mockReturnValue("plain-secret");

    const result = await getDefaultJwPlayerCredentials();

    expect(decryptMock).toHaveBeenCalledWith({ ciphertext: "enc", iv: "iv", tag: "tag" });
    expect(result).toEqual({ playerId: "p1", siteId: "site-99", apiSecret: "plain-secret" });
  });

  it("omits apiSecret and siteId when they are not configured", async () => {
    playerConfigFindFirst.mockResolvedValue({
      playerId: "p1",
      apiSecretEnc: null,
      apiSecretIv: null,
      apiSecretTag: null,
      extraConfig: {},
    });

    const result = await getDefaultJwPlayerCredentials();

    expect(result).toEqual({ playerId: "p1", siteId: undefined, apiSecret: undefined });
    expect(decryptMock).not.toHaveBeenCalled();
  });
});

describe("createJwPlayerMediaFromUrl", () => {
  it("posts a fetch-upload request and maps a 'ready' status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "media-1", status: "ready" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createJwPlayerMediaFromUrl({
      siteId: "site-1",
      apiSecret: "secret",
      sourceUrl: "https://r2.example.com/video.mp4",
      title: "My Video",
    });

    expect(result).toEqual({ mediaId: "media-1", status: "ready" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.jwplayer.com/v2/sites/site-1/media/",
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
  });

  it("maps 'processing'-family statuses to 'processing'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "media-2", status: "ingesting" }) }),
    );
    const result = await createJwPlayerMediaFromUrl({ siteId: "s", apiSecret: "k", sourceUrl: "https://x/y.mp4" });
    expect(result.status).toBe("processing");
    vi.unstubAllGlobals();
  });

  it("maps an unrecognized status to 'unknown'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "media-3", status: "weird" }) }),
    );
    const result = await createJwPlayerMediaFromUrl({ siteId: "s", apiSecret: "k", sourceUrl: "https://x/y.mp4" });
    expect(result.status).toBe("unknown");
    vi.unstubAllGlobals();
  });

  it("throws an ApiError when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(
      createJwPlayerMediaFromUrl({ siteId: "s", apiSecret: "k", sourceUrl: "https://x/y.mp4" }),
    ).rejects.toThrow("JWPlayer ingest failed: HTTP 502");
    vi.unstubAllGlobals();
  });

  it("throws when the response has no id/media_id/key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(
      createJwPlayerMediaFromUrl({ siteId: "s", apiSecret: "k", sourceUrl: "https://x/y.mp4" }),
    ).rejects.toThrow("JWPlayer ingest response did not include a media id");
    vi.unstubAllGlobals();
  });
});
