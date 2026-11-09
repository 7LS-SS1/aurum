import {beforeEach,describe,it,expect,vi} from "vitest";
const db=vi.hoisted(()=>({serviceMail:{findMany:vi.fn(),updateMany:vi.fn(),update:vi.fn()}}));
vi.mock("./prisma",()=>({prisma:db}));
vi.mock("./crypto",()=>({decrypt:()=>JSON.stringify({to:"recipient@example.test",subject:"Test",text:"Test"}),encrypt:(v:string)=>({ciphertext:v,iv:"test",tag:"test"})}));
import {deliverServiceMail} from "./service-mail";
describe("transactional mail delivery",()=>{
 beforeEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();vi.stubEnv("SERVICE_EMAIL_ENABLED","true");vi.stubEnv("CF_EMAIL_ACCOUNT_ID","a".repeat(32));vi.stubEnv("CF_EMAIL_API_TOKEN","test-only");vi.stubEnv("SERVICE_EMAIL_FROM","sender@example.test");db.serviceMail.findMany.mockResolvedValue([{id:"test",payload:{}}]);db.serviceMail.updateMany.mockResolvedValue({count:1});db.serviceMail.update.mockResolvedValue({});});
 it("does not send or claim messages while disabled",async()=>{vi.stubEnv("SERVICE_EMAIL_ENABLED","false");const fetch=vi.fn();vi.stubGlobal("fetch",fetch);await deliverServiceMail();expect(fetch).not.toHaveBeenCalled();expect(db.serviceMail.findMany).not.toHaveBeenCalled();});
 it("distinguishes queued acceptance from delivery",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,result:{queued:["recipient@example.test"]}}),{status:200})));await deliverServiceMail();expect(db.serviceMail.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"ACCEPTED",payload:{}})}));});
 it("does not blindly retry uncertain provider outcomes",async()=>{vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("timeout")));const result=await deliverServiceMail();expect(result.uncertain).toBe(1);expect(db.serviceMail.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"UNCERTAIN"})}));});
 it("records permanent bounces rather than success",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,result:{permanent_bounces:["recipient@example.test"]}}),{status:200})));await deliverServiceMail();expect(db.serviceMail.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"BOUNCED"})}));});
});
