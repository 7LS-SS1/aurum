import { afterEach, describe, expect, it, vi } from "vitest";
import { assessWordPressIntegration } from "./wordpress-integration-health";
import { WordPressClient } from "./wordpress-client";

const configured = { postType: "posts", categoryRestBase: "categories", tagRestBase: "tags" };
const legacy = { ready: true, version: "1.2.4", postTypes: ["post", "video"] };
const current = {
  ...legacy, version: "1.3.0",
  profiles: {
    post: { ready: true, restBase: "posts", taxonomies: { category: { restBase: "categories" }, tag: { restBase: "tags" } } },
    video: { ready: true, restBase: "video", taxonomies: { category: { restBase: "video_category" }, tag: { restBase: "video_tag" } } },
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("destination integration health", () => {
  it("accepts existing 1.2.4 destinations without profile data", () => {
    expect(assessWordPressIntegration(legacy, configured).ready).toBe(true);
  });
  it("reads the configured profile rather than forcing the recommended default", () => {
    const video = { postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag" };
    expect(assessWordPressIntegration(current, video)).toMatchObject({ ready: true, profile: video });
  });
  it("reports missing registrations", () => {
    expect(assessWordPressIntegration({ ...current, ready: false }, configured).issues).toContain("ปลั๊กอินยังลงทะเบียนข้อมูลวิดีโอไม่ครบ");
  });
  it("reports a missing destination type", () => {
    expect(assessWordPressIntegration(current, { ...configured, postType: "other" }).ready).toBe(false);
  });
  it("reports category and tag mismatches without changing configuration", () => {
    const wrong = { ...configured, categoryRestBase: "wrong", tagRestBase: "wrong" };
    expect(assessWordPressIntegration(current, wrong).issues).toHaveLength(2);
    expect(wrong.categoryRestBase).toBe("wrong");
  });
  it("rejects malformed or misleading diagnostics", () => {
    for (const data of [null, {}, { ...legacy, ready: "true" }, { ...legacy, postTypes: [7] }, { ...current, profiles: { post: {} } }]) {
      expect(() => assessWordPressIntegration(data, configured)).toThrow("wordpress_diagnostics_invalid");
    }
  });
  it("checks metadata registration for the selected internal type", () => {
    expect(assessWordPressIntegration({ ...current, postTypes: ["post"] }, {
      postType: "video", categoryRestBase: "video_category", tagRestBase: "video_tag",
    }).ready).toBe(false);
  });
  it("uses an authenticated GET and never publishes during a health check", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(current) });
    vi.stubGlobal("fetch", fetchMock);
    const client = new WordPressClient({ baseUrl: "https://example.com", authType: "APP_PASSWORD", username: "admin", credential: "test" });
    expect((await client.integrationHealth()).ready).toBe(true);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/wp-json/aurum-video-core/v1/diagnostics");
    expect(options.method).toBeUndefined();
    expect(options.headers.Authorization).toMatch(/^Basic /);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
