import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-response";
import { r2Client } from "@/lib/storage/r2";

const PART_SIZE = 16 * 1024 * 1024;

function bucket() {
  const { R2_BUCKET_NAME } = env();
  if (!R2_BUCKET_NAME) throw new ApiError("R2_BUCKET_NAME is not configured", 503);
  return R2_BUCKET_NAME;
}

/** Streams a body into R2 with multipart upload so memory stays at one part. */
export async function streamToR2(body: ReadableStream<Uint8Array>, key: string, contentType: string, limit: number, signal?: AbortSignal) {
  const client = r2Client();
  const options = { abortSignal: signal };
  const Bucket = bucket();
  const reader = body.getReader();
  let buffer: Uint8Array[] = [];
  let buffered = 0;
  let total = 0;
  let uploadId: string | undefined;
  const parts: { ETag?: string; PartNumber: number }[] = [];
  const flush = async (final: boolean) => {
    const chunk = Buffer.concat(buffer);
    buffer = []; buffered = 0;
    if (!uploadId && final) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: chunk, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }), options);
      return;
    }
    if (!uploadId) {
      uploadId = (await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }), options)).UploadId;
    }
    if (!chunk.length) return;
    const PartNumber = parts.length + 1;
    const { ETag } = await client.send(new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber, Body: chunk }), options);
    parts.push({ ETag, PartNumber });
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(limit / 1024 ** 2)} MB`);
      buffer.push(value); buffered += value.length;
      if (buffered >= PART_SIZE) await flush(false);
    }
    if (!total) throw new Error("ไฟล์ว่าง");
    await flush(true);
    if (uploadId) await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }), options);
    return total;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (uploadId) await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
    throw error;
  }
}
