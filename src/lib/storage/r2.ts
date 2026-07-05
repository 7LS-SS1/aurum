import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-response";

let client: S3Client | undefined;

function publicBaseUrl(hostnameOrUrl: string): string {
  try {
    const url = new URL(hostnameOrUrl);
    return url.origin;
  } catch {
    return `https://${hostnameOrUrl.replace(/^\/+|\/+$/g, "")}`;
  }
}

/** Cloudflare R2 is S3-API-compatible — same SDK, just a different endpoint. */
function r2Client(): S3Client {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env();
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new ApiError("R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)", 503);
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return client;
}

export interface PresignedUpload {
  strategy: "put";
  method: "PUT";
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
}

export async function presignR2Upload(opts: {
  filename: string;
  contentType: string;
  folder: "images" | "videos";
}): Promise<PresignedUpload> {
  const { R2_BUCKET_NAME, R2_PUBLIC_HOSTNAME } = env();
  if (!R2_BUCKET_NAME || !R2_PUBLIC_HOSTNAME) {
    throw new ApiError("R2_BUCKET_NAME / R2_PUBLIC_HOSTNAME are not configured", 503);
  }

  const safe = opts.filename.replace(/[^\w.-]/g, "_");
  const key = `${opts.folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;

  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: opts.contentType }),
    { expiresIn: 3600 },
  );

  return {
    strategy: "put",
    method: "PUT",
    uploadUrl,
    publicUrl: `${publicBaseUrl(R2_PUBLIC_HOSTNAME)}/${key}`,
    headers: { "Content-Type": opts.contentType },
  };
}

export async function deleteR2Object(key: string): Promise<void> {
  const { R2_BUCKET_NAME } = env();
  if (!R2_BUCKET_NAME) {
    throw new ApiError("R2_BUCKET_NAME is not configured", 503);
  }

  await r2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
}

export function getR2ObjectKeyFromPublicUrl(fileUrl: string): string | null {
  const { R2_ACCOUNT_ID, R2_PUBLIC_HOSTNAME, NEXT_PUBLIC_R2_PUBLIC_URL } = env();
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }

  const allowedHosts = new Set<string>();
  for (const value of [R2_PUBLIC_HOSTNAME, NEXT_PUBLIC_R2_PUBLIC_URL]) {
    if (!value) continue;
    try {
      allowedHosts.add(new URL(value).hostname);
    } catch {
      allowedHosts.add(value);
    }
  }
  if (R2_ACCOUNT_ID) allowedHosts.add(`${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);

  if (!allowedHosts.has(parsed.hostname)) return null;

  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return key || null;
}
