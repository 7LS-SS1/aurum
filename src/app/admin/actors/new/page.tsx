import { ActorForm } from "@/components/admin/ActorForm";

export default function NewActorPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มนักแสดง</span>ใหม่
        </h1>
        <p>กรอกข้อมูลนักแสดงเพื่อใช้ผูกกับวิดีโอ</p>
      </div>
      <ActorForm />
    </section>
  );
}
