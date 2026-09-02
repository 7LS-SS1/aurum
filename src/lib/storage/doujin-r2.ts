import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api-response";

/**
 * Doujin/Comic's own R2 client — deliberately a separate bucket/credential
 * set from src/lib/storage/r2.ts (video), per explicit request that the two
 * never share storage. Mirrors r2.ts's shape exactly; kept as its own small
 * module rather than parameterizing r2.ts so video uploads are never at risk
 * of a Doujin config/typo (same rationale as comic-cleanup.ts vs
 * media-cleanup.ts).
 */
let client: S3Client | undefined;

function publicBaseUrl(hostnameOrUrl: string): string {
  try {
    const url = new URL(hostnameOrUrl);
    return url.origin;
  } catch {
    return `https://${hostnameOrUrl.replace(/^\/+|\/+$/g, "")}`;
  }
}

function doujinR2Client(): S3Client {
  const { R2_DOUJIN_ACCOUNT_ID, R2_DOUJIN_ACCESS_KEY_ID, R2_DOUJIN_SECRET_ACCESS_KEY } = env();
  if (!R2_DOUJIN_ACCOUNT_ID || !R2_DOUJIN_ACCESS_KEY_ID || !R2_DOUJIN_SECRET_ACCESS_KEY) {
    throw new ApiError(
      "R2 (Doujin) is not configured (R2_DOUJIN_ACCOUNT_ID / R2_DOUJIN_ACCESS_KEY_ID / R2_DOUJIN_SECRET_ACCESS_KEY) — see .env for setup steps",
      503,
    );
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_DOUJIN_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_DOUJIN_ACCESS_KEY_ID, secretAccessKey: R2_DOUJIN_SECRET_ACCESS_KEY },
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

export async function presignDoujinR2Upload(opts: { filename: string; contentType: string; folder: "covers" | "pages" }): Promise<PresignedUpload> {
  const { R2_DOUJIN_BUCKET_NAME, R2_DOUJIN_PUBLIC_HOSTNAME } = env();
  if (!R2_DOUJIN_BUCKET_NAME || !R2_DOUJIN_PUBLIC_HOSTNAME) {
    throw new ApiError("R2_DOUJIN_BUCKET_NAME / R2_DOUJIN_PUBLIC_HOSTNAME are not configured — see .env for setup steps", 503);
  }

  const safe = opts.filename.replace(/[^\w.-]/g, "_");
  const key = `${opts.folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;

  const uploadUrl = await getSignedUrl(
    doujinR2Client(),
    new PutObjectCommand({
      Bucket: R2_DOUJIN_BUCKET_NAME,
      Key: key,
      ContentType: opts.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: 3600 },
  );

  return {
    strategy: "put",
    method: "PUT",
    uploadUrl,
    publicUrl: `${publicBaseUrl(R2_DOUJIN_PUBLIC_HOSTNAME)}/${key}`,
    headers: {
      "Content-Type": opts.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  };
}

export async function deleteDoujinR2Object(key: string): Promise<void> {
  const { R2_DOUJIN_BUCKET_NAME } = env();
  if (!R2_DOUJIN_BUCKET_NAME) {
    throw new ApiError("R2_DOUJIN_BUCKET_NAME is not configured", 503);
  }

  await doujinR2Client().send(new DeleteObjectCommand({ Bucket: R2_DOUJIN_BUCKET_NAME, Key: key }));
}

export function getDoujinR2ObjectKeyFromPublicUrl(fileUrl: string): string | null {
  const { R2_DOUJIN_ACCOUNT_ID, R2_DOUJIN_PUBLIC_HOSTNAME } = env();
  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }

  const allowedHosts = new Set<string>();
  if (R2_DOUJIN_PUBLIC_HOSTNAME) {
    try {
      allowedHosts.add(new URL(R2_DOUJIN_PUBLIC_HOSTNAME).hostname);
    } catch {
      allowedHosts.add(R2_DOUJIN_PUBLIC_HOSTNAME);
    }
  }
  if (R2_DOUJIN_ACCOUNT_ID) allowedHosts.add(`${R2_DOUJIN_ACCOUNT_ID}.r2.cloudflarestorage.com`);

  if (!allowedHosts.has(parsed.hostname)) return null;

  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return key || null;
}
