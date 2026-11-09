import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ApiError } from "../api-response";

type Attachment = { id: string; owner: string; name: string; type: string; size: number };
export function attachmentStorageIsR2() {
  const provider = process.env.ADS_UPLOAD_STORAGE || "local";
  if (!["local", "r2"].includes(provider)) throw new ApiError("upload_storage_unavailable", 503);
  return provider === "r2";
}
function connection() {
  const bucket = process.env.ADS_R2_BUCKET_NAME;
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  // Never reuse a public media bucket for customer attachments.
  if (!bucket || [process.env.R2_BUCKET_NAME, process.env.R2_DOUJIN_BUCKET_NAME].includes(bucket) ||
      process.env.ADS_R2_PRIVATE_CONFIRMED !== "true" || !account || !accessKeyId || !secretAccessKey) {
    throw new ApiError("upload_storage_unavailable", 503);
  }
  return { bucket, client: new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: "WHEN_REQUIRED", maxAttempts: 2,
    requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 } }) };
}
const ownerPrefix = (owner: string) => `attachments/v1/owners/${createHash("sha256").update(owner).digest("hex")}/`;
const metadataKey = (id: string) => `attachments/v1/metadata/${id}.json`;
function missing(error: unknown) {
  return error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name);
}
export async function readR2AttachmentMetadata(id: string): Promise<unknown | null> {
  const { bucket, client } = connection();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: metadataKey(id) }));
    if (!result.Body || (result.ContentLength ?? 0) > 16384) throw Error("invalid metadata");
    return JSON.parse(await result.Body.transformToString());
  } catch (error) {
    if (missing(error)) return null;
    throw new ApiError("upload_storage_unavailable", 503);
  } finally { client.destroy(); }
}
export async function readR2AttachmentBytes(file: Attachment) {
  const { bucket, client } = connection();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: ownerPrefix(file.owner) + file.id + ".bin" }));
    if (!result.Body || result.ContentLength !== file.size) throw Error("incomplete object");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length !== file.size) throw Error("incomplete object");
    return bytes;
  } catch { throw new ApiError("upload_storage_unavailable", 503); }
  finally { client.destroy(); }
}
// Caller holds the same per-owner PostgreSQL advisory lock used by local storage.
export async function saveR2Attachment(file: Attachment, bytes: Buffer, quota: number) {
  const { bucket, client } = connection();
  const key = ownerPrefix(file.owner) + file.id + ".bin";
  let wrote = false;
  try {
    let used = 0, token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: ownerPrefix(file.owner), ContinuationToken: token }));
      used += (page.Contents || []).reduce((sum, object) => sum + (object.Size || 0), 0);
      if (used + bytes.length > quota) throw new ApiError("upload_quota_exceeded", 413);
      if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === token)) throw Error("invalid listing cursor");
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (used + bytes.length > quota) throw new ApiError("upload_quota_exceeded", 413);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.length,
      ContentType: "application/octet-stream", CacheControl: "private, no-store", IfNoneMatch: "*" }));
    wrote = true;
    const body = JSON.stringify({ ...file, createdAt: new Date().toISOString() });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: metadataKey(file.id), Body: body,
      ContentLength: Buffer.byteLength(body), ContentType: "application/json", CacheControl: "private, no-store", IfNoneMatch: "*" }));
  } catch (error) {
    // Keep the blob if the metadata write timed out after committing: deleting it would break a valid upload.
    // Unreferenced blobs remain counted toward quota and can be reconciled explicitly, never auto-purged.
    if (!wrote && error instanceof ApiError) throw error;
    throw new ApiError("upload_storage_unavailable", 503);
  } finally { client.destroy(); }
}
