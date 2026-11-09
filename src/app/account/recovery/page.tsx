import { AccountRecovery } from "@/components/public/AccountRecovery";
import { MemberShell } from "@/components/public/ServiceChrome";
export const metadata={title:"กู้คืนบัญชี | AURUM",robots:{index:false,follow:false}};
export default function Page(){return <MemberShell><AccountRecovery/></MemberShell>;}
