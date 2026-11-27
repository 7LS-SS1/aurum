export const runtime = "nodejs";
export const maxDuration = 60;
import { listSources, createSource } from "@/lib/source-scanner/api";
export const GET = (req: Request) => listSources(req, { params: Promise.resolve({ id: "" }) });
export const POST = (req: Request) => createSource(req, { params: Promise.resolve({ id: "" }) });
