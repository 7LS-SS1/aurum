import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
import middleware from "./middleware";
const management = "https://system-management.aurum123.com";
const invoke = middleware as unknown as (request: NextRequest & { auth: unknown }) => Response;
function request(path: string, signedIn=false) { const req=new NextRequest(management+path) as NextRequest & {auth:unknown};req.auth=signedIn?{user:{role:"MANAGER"}}:null;return req; }
afterEach(()=>vi.unstubAllEnvs());
describe("management root authentication",()=>{
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
