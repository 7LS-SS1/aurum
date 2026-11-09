import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: (req: NextRequest & { auth: unknown }) => Response) => (req: NextRequest & { auth: unknown }) => {
  if (!process.env.AUTH_URL) return handler(req);
  const rewritten = new NextRequest(req.url.replace(req.nextUrl.origin, new URL(process.env.AUTH_URL).origin), req) as NextRequest & { auth: unknown };
  rewritten.auth = req.auth;
  return handler(rewritten);
} }) }));
import middleware from "./middleware";
const management = "https://system-management.aurum123.com";
const invoke = middleware as unknown as (request: NextRequest & { auth: unknown }) => Response;
function request(path: string, signedIn=false) { const req=new NextRequest(management+path) as NextRequest & {auth:unknown};req.auth=signedIn?{user:{role:"MANAGER"}}:null;return req; }
afterEach(()=>vi.unstubAllEnvs());
describe("management root authentication",()=>{
 it("routes standalone internal URLs using only an allowlisted Host",()=>{
   vi.stubEnv("MANAGEMENT_HOST_ENABLED","true");
   vi.stubEnv("MANAGEMENT_APP_ORIGIN",management);
   vi.stubEnv("PUBLIC_APP_ORIGIN","https://aurum123.com");
   const req = new NextRequest("http://localhost:3000/", {headers:{host:"system-management.aurum123.com"}}) as NextRequest & {auth:unknown};
   req.auth=null;
   expect(invoke(req).headers.get("location")).toBe(management+"/admin/login?callbackUrl=%2Fadmin");
   const spoof = new NextRequest("http://localhost:3000/", {headers:{host:"unknown.example","x-forwarded-host":"system-management.aurum123.com"}}) as NextRequest & {auth:unknown};
   spoof.auth=null;
   expect(invoke(spoof).headers.get("location")).toBeNull();
 });
 it("preserves ingress host when Auth.js overrides the request origin",()=>{
   vi.stubEnv("AUTH_URL", management);
   vi.stubEnv("MANAGEMENT_HOST_ENABLED","true");
   vi.stubEnv("MANAGEMENT_APP_ORIGIN",management);
   vi.stubEnv("PUBLIC_APP_ORIGIN","https://aurum123.com");
   const req = new NextRequest("https://aurum123.com/admin", {method:"POST"}) as NextRequest & {auth:unknown};
   req.auth=null;
   expect(invoke(req).status).toBe(409);
 });
 it("does not treat similarly named private APIs as public",()=>{
   for (const path of ["/api/publicity", "/api/auth-admin", "/api/health-secrets"]) {
     expect(invoke(request(path)).status).toBe(401);
   }
   expect(invoke(request("/api/public/auth/login")).status).toBe(200);
 });
 it("requires staff authentication before a root rewrite",()=>{vi.stubEnv("MANAGEMENT_HOST_ENABLED","true");vi.stubEnv("MANAGEMENT_APP_ORIGIN",management);const result=invoke(request("/"));expect(result.status).toBe(307);expect(result.headers.get("location")).toBe(management+"/admin/login?callbackUrl=%2Fadmin");});
 it("rewrites the signed-in root to the existing admin handler",()=>{vi.stubEnv("MANAGEMENT_HOST_ENABLED","true");vi.stubEnv("MANAGEMENT_APP_ORIGIN",management);expect(invoke(request("/",true)).headers.get("x-middleware-rewrite")).toBe(management+"/admin");});
 it("keeps the login accessible and APIs protected",()=>{vi.stubEnv("MANAGEMENT_HOST_ENABLED","true");vi.stubEnv("MANAGEMENT_APP_ORIGIN",management);expect(invoke(request("/admin/login")).status).toBe(200);expect(invoke(request("/api/stripe-orders")).status).toBe(401);expect(invoke(request("/api/public/account/orders")).status).toBe(200);});
});
