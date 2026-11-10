import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({find:vi.fn(),create:vi.fn(),audit:vi.fn(),lock:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn()}));
vi.mock("./prisma",()=>({prisma:{servicePageConfig:{findUnique:m.find},$transaction:async(fn: (tx:unknown)=>unknown)=>fn({$executeRaw:m.lock,servicePageConfig:{findUnique:m.find,create:m.create},auditLog:{create:m.audit}})}}));
vi.mock("./crypto",()=>({encrypt:m.encrypt,decrypt:m.decrypt}));
import { generateAdsKey, resolveAdsKey } from "./ads-plugin-keys";
import { authenticateAdsPlugin, mediaSignature, validMediaSignature } from "./ads-plugin";
const id="11111111-1111-4111-8111-111111111111";
const actor={id:"admin",role:"MANAGER" as const};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("ADS_PLUGIN_KEYS","{}");m.encrypt.mockReturnValue({ciphertext:"encrypted",iv:"iv",tag:"tag"});m.create.mockResolvedValue({});m.audit.mockResolvedValue({});});
it("creates a scoped random key, stores only ciphertext and no key in audit",async()=>{
 m.find.mockResolvedValueOnce({config:{websites:[{id}]}}).mockResolvedValueOnce(null);
 const key=await generateAdsKey(id,actor);expect(key).toMatch(/^[A-Za-z0-9_-]{64}$/);expect(m.encrypt).toHaveBeenCalledWith(key);expect(JSON.stringify(m.create.mock.calls)).not.toContain(key);expect(JSON.stringify(m.audit.mock.calls)).not.toContain(key);
 expect(()=>authenticateAdsPlugin(id,"Bearer "+key,key)).not.toThrow();expect(()=>authenticateAdsPlugin(id,"Bearer wrong",key)).toThrow();
 const expires=Math.floor(Date.now()/1000)+600;const signature=mediaSignature(id,"o","f",expires,key);expect(validMediaSignature(id,"o","f",expires,signature,key)).toBe(true);expect(validMediaSignature(id,"o","different",expires,signature,key)).toBe(false);
});
it("never replaces an existing stored key",async()=>{m.find.mockResolvedValueOnce({config:{websites:[{id}]}}).mockResolvedValueOnce({config:{}});await expect(generateAdsKey(id,actor)).rejects.toMatchObject({status:409});expect(m.create).not.toHaveBeenCalled();});
it("preserves legacy environment keys",async()=>{vi.stubEnv("ADS_PLUGIN_KEYS",JSON.stringify({[id]:"a".repeat(48)}));m.find.mockResolvedValue(null);expect(await resolveAdsKey(id)).toBe("a".repeat(48));m.find.mockResolvedValueOnce({config:{websites:[{id}]}}).mockResolvedValueOnce(null);await expect(generateAdsKey(id,actor)).rejects.toMatchObject({status:409});});
it("rejects unknown websites",async()=>{m.find.mockResolvedValue({config:{websites:[]}});await expect(generateAdsKey(id,actor)).rejects.toMatchObject({status:404});expect(m.create).not.toHaveBeenCalled();});
it("decrypts a stored key",async()=>{m.find.mockResolvedValue({config:{ciphertext:"encrypted",iv:"iv",tag:"tag"}});m.decrypt.mockReturnValue("secret");expect(await resolveAdsKey(id)).toBe("secret");});
