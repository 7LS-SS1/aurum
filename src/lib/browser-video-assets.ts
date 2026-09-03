/** Browser-only helpers used by the upload wizard to derive lightweight assets
 * from the local source file before it is published. Keeping this in the
 * browser means the application server never has to proxy a multi-GB video or
 * keep a temporary copy while creating a cover/hover preview. */

const COVER_POINTS = [0.1, 0.5, 0.9] as const;
const PREVIEW_POINTS = [0.1, 0.3, 0.5, 0.7, 0.9] as const;
const PREVIEW_SEGMENT_MS = 2_000;
const MAX_FRAME_EDGE = 720;

export interface GeneratedVideoAssets {
  thumbnail: File;
  preview: File;
}

function filenameStem(filename: string) {
  return filename.replace(/\.[^.]+$/, "") || "video";
}

function canvasSize(width: number, height: number) {
  const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function waitForEvent(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("ไม่สามารถอ่านไฟล์วิดีโอเพื่อสร้างไฟล์ประกอบได้"));
    };
    const cleanup = () => {
      target.removeEventListener(event, onSuccess);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  const duration = video.duration;
  // Never seek exactly to the last frame: some container/codec combinations
  // report a duration that is fractionally beyond the final decodable frame.
  video.currentTime = Math.max(0, Math.min(time, Math.max(0, duration - 0.05)));
  await waitForEvent(video, "seeked");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("สร้างไฟล์ภาพไม่สำเร็จ"))), type, quality);
  });
}

function preferredWebmMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}

async function makeCover(video: HTMLVideoElement, size: { width: number; height: number }, filename: string) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width * COVER_POINTS.length;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างรูปหน้าปก");

  for (let index = 0; index < COVER_POINTS.length; index += 1) {
    const point = COVER_POINTS[index];
    if (point === undefined) continue;
    await seek(video, video.duration * point);
    context.drawImage(video, index * size.width, 0, size.width, size.height);
  }

  const blob = await toBlob(canvas, "image/webp", 0.9);
  return new File([blob], `${filenameStem(filename)}-cover.webp`, { type: "image/webp" });
}

async function makePreview(video: HTMLVideoElement, size: { width: number; height: number }, filename: string) {
  const mimeType = preferredWebmMimeType();
  if (!mimeType || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับการสร้างวิดีโอพรีวิวอัตโนมัติ");
  }

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการสร้างวิดีโอพรีวิว");

  let raf = 0;
  const paint = () => {
    context.drawImage(video, 0, 0, size.width, size.height);
    raf = requestAnimationFrame(paint);
  };
  paint();

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 2_500_000 });
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })));
    recorder.addEventListener("error", () => reject(new Error("สร้างวิดีโอพรีวิวไม่สำเร็จ")));
  });

  try {
    recorder.start();
    for (const point of PREVIEW_POINTS) {
      recorder.pause();
      await seek(video, video.duration * point);
      context.drawImage(video, 0, 0, size.width, size.height);
      recorder.resume();
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, PREVIEW_SEGMENT_MS));
      video.pause();
    }
    recorder.stop();
    const blob = await stopped;
    if (!blob.size) throw new Error("สร้างวิดีโอพรีวิวไม่สำเร็จ");
    return new File([blob], `${filenameStem(filename)}-hover-preview.webm`, { type: "video/webm" });
  } finally {
    cancelAnimationFrame(raf);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
  }
}

export async function generateVideoAssets(file: File): Promise<GeneratedVideoAssets> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await waitForEvent(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("ไม่พบความยาวหรือขนาดของไฟล์วิดีโอ");
    }
    const size = canvasSize(video.videoWidth, video.videoHeight);
    const thumbnail = await makeCover(video, size, file.name);
    const preview = await makePreview(video, size, file.name);
    return { thumbnail, preview };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
