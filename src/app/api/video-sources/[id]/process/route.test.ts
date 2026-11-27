import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-response";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ role: vi.fn(), source: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireMinRole: mocks.role }));
vi.mock("@/lib/source-scanner/store", () => ({ getSource: mocks.source }));
vi.mock("@/lib/source-scanner/worker", () => ({ runScanner: mocks.run }));
const invoke = () => POST(new Request("https://aurum.test/api/video-sources/example/process", { method: "POST" }), { params: Promise.resolve({ id: "example" }) });

describe("manual scanner entry point", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("requires a manager and a source that is running", async () => {
    mocks.role.mockRejectedValueOnce(new ApiError("forbidden", 403));
    expect((await invoke()).status).toBe(403);
    expect(mocks.source).not.toHaveBeenCalled();
    mocks.source.mockResolvedValue({ control: "PAUSE" });
    expect((await invoke()).status).toBe(409);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("processes only the requested source", async () => {
    mocks.source.mockResolvedValue({ control: "RUN" });
    mocks.run.mockResolvedValue({ processed: 1, results: [] });
    expect((await invoke()).status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith("MANAGER");
    expect(mocks.run).toHaveBeenCalledWith(270_000, "example");
  });
});
