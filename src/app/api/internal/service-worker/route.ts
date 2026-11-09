import { timingSafeEqual } from "node:crypto";
import { apiError,ApiError,jsonOk } from "@/lib/api-response";
import { runServiceWorker } from "@/lib/service-worker";
import { serviceWorkerSecret } from "@/lib/service-worker-secret";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(req:Request){try{const expected=serviceWorkerSecret();const provided=req.headers.get("authorization")?.replace(/^Bearer /,"")||"";if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))throw new ApiError("unauthorized",401);return jsonOk(await runServiceWorker(),{headers:{"Cache-Control":"no-store"}});}catch(e){return apiError(e);}}
