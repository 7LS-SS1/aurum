import { requireAdmin } from "@/lib/authz";
import { ContentAiSettings } from "@/components/admin/ContentAiSettings";
export default async function ContentAiPage() {
  await requireAdmin();
  return <section><div className="page-head"><h1>ตั้งค่า AI สำหรับชื่อเรื่องและคำบรรยายวิดีโอ</h1></div><ContentAiSettings /></section>;
}
