import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => {
  class Command { constructor(public input: Record<string, unknown>) {} }
  return { S3Client: class { send = mock.send; destroy = mock.destroy; }, GetObjectCommand: Command, PutObjectCommand: Command, ListObjectsV2Command: Command };
});
import { attachmentStorageIsR2, readR2AttachmentMetadata, readR2AttachmentBytes, saveR2Attachment } from "./attachment-r2";
const file = { id: "id", owner: "viewer", name: "test.png", type: "image/png", size: 3 };
beforeEach(() => {
  vi.clearAllMocks(); mock.send.mockReset();
  for (const [key,value] of Object.entries({ ADS_UPLOAD_STORAGE: "r2", ADS_R2_BUCKET_NAME: "private-attachments", ADS_R2_PRIVATE_CONFIRMED: "true", R2_ACCOUNT_ID: "account", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET_NAME: "public-media" })) vi.stubEnv(key,value);
});
afterEach(() => vi.unstubAllEnvs());
describe("private attachment storage", () => {
  it("rejects public media bucket reuse before sending data", async () => {
    vi.stubEnv("ADS_R2_BUCKET_NAME", "public-media");
    await expect(saveR2Attachment(file, Buffer.from("abc"), 100)).rejects.toThrow("upload_storage_unavailable");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("rejects unknown provider instead of falling back to ephemeral disk", () => {
    vi.stubEnv("ADS_UPLOAD_STORAGE", "r22"); expect(attachmentStorageIsR2).toThrow("upload_storage_unavailable");
  });
  it("distinguishes missing metadata from a provider outage", async () => {
    mock.send.mockRejectedValueOnce(Object.assign(new Error(), { name: "NoSuchKey" }));
    expect(await readR2AttachmentMetadata("id")).toBeNull();
    mock.send.mockRejectedValueOnce(new Error("network"));
    await expect(readR2AttachmentMetadata("id")).rejects.toThrow("upload_storage_unavailable");
  });
  it("counts all pages before allowing a write", async () => {
    mock.send.mockResolvedValueOnce({ Contents: [{ Size: 5 }], IsTruncated: true, NextContinuationToken: "next" }).mockResolvedValueOnce({ Contents: [{ Size: 4 }] });
    await expect(saveR2Attachment(file, Buffer.from("abc"), 10)).rejects.toThrow("upload_quota_exceeded");
    expect(mock.send).toHaveBeenCalledTimes(2);
  });
  it("writes opaque owner-scoped bytes and private metadata without overwriting", async () => {
    mock.send.mockResolvedValueOnce({ Contents: [] }).mockResolvedValue({});
    await saveR2Attachment(file, Buffer.from("abc"), 100);
    const inputs = mock.send.mock.calls.map(([command]) => command.input);
    expect(inputs[1].Key).toMatch(/^attachments\/v1\/owners\/[a-f0-9]{64}\/id.bin$/);
    expect(inputs[1]).toMatchObject({ CacheControl: "private, no-store", IfNoneMatch: "*", ContentLength: 3 });
    expect(JSON.parse(inputs[2].Body)).toMatchObject(file);
  });
  it("does not delete a blob after an ambiguous metadata write failure", async () => {
    mock.send.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("timeout"));
    await expect(saveR2Attachment(file, Buffer.from("abc"), 100)).rejects.toThrow("upload_storage_unavailable");
    expect(mock.send).toHaveBeenCalledTimes(3);
  });
  it("rejects incomplete objects", async () => {
    mock.send.mockResolvedValue({ ContentLength: 3, Body: { transformToByteArray: async () => Buffer.from("ab") } });
    await expect(readR2AttachmentBytes(file)).rejects.toThrow("upload_storage_unavailable");
  });
});
