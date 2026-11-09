import {afterEach,describe,it,expect,vi} from "vitest";
const run=vi.hoisted(()=>vi.fn());vi.mock("@/lib/service-worker",()=>({runServiceWorker:run}));
import {POST} from "./route";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe("scheduler access",()=>{
 it("fails closed before running jobs",async()=>{vi.stubEnv("SERVICE_WORKER_SECRET","x".repeat(32));expect((await POST(new Request("http://localhost/api/internal/service-worker",{method:"POST"}))).status).toBe(401);expect(run).not.toHaveBeenCalled();});
 it("accepts only the dedicated configured secret",async()=>{vi.stubEnv("SERVICE_WORKER_SECRET","local-test-secret-".repeat(3));run.mockResolvedValue({ok:true});const res=await POST(new Request("http://localhost/api/internal/service-worker",{method:"POST",headers:{authorization:"Bearer "+process.env.SERVICE_WORKER_SECRET}}));expect(res.status).toBe(200);expect(run).toHaveBeenCalledOnce();});
});
