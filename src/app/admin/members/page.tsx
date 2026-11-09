import { requireMinRole } from "@/lib/authz";
import { MembersManager } from "@/components/admin/MembersManager";
export default async function MembersPage(){
  await requireMinRole("MANAGER");
  return <section><div className="page-head"><h1>สมาชิกและลูกค้า</h1><p>ตรวจสอบบัญชี บริการ และประวัติคำสั่งซื้อในพื้นที่เดียว</p></div><MembersManager/></section>;
}
