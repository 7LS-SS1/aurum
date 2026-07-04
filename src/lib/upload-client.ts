import { apiFetch } from "@/lib/api-client";
import { Upload } from "tus-js-client";

/**
 * Presigns and uploads a file straight to Cloudflare R2 (images, XHR PUT) or
 * Bunny Stream (video, tus resumable) — the bytes never pass through our
 * server, only the presigned URL/credential does. Shared by admin forms that
 * accept a thumbnail or video file.
 */
export async function presignAndUpload(
  file: File,
  provider: "r2" | "bunny",
  onProgress: (pct: number) => void,
): Promise<string> {
  const presign = await apiFetch<Record<string, unknown>>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ provider, filename: file.name, contentType: file.type, size: file.size }),
  });

  if (presign.strategy === "put") {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(presign.method as string, presign.uploadUrl as string);
      const headers = (presign.headers as Record<string, string>) ?? {};
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("network error"));
      xhr.send(file);
    });
    return presign.publicUrl as string;
  }

  // strategy === 'tus' (Bunny Stream)
  const tus = presign.tus as Record<string, string>;
  return new Promise<string>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: presign.uploadUrl as string,
      retryDelays: [0, 1000, 3000, 5000],
      headers: tus,
      metadata: { filetype: file.type, title: file.name },
      onProgress: (loaded, total) => onProgress((loaded / total) * 100),
      onSuccess: () => resolve(presign.publicUrl as string),
      onError: (err) => reject(err),
    });
    upload.start();
  });
}
