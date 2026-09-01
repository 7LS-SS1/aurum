import { NewTagForm } from "@/components/admin/NewTagForm";

export default function NewTagPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มแท็ก</span>ใหม่
        </h1>
        <p>เพิ่มแท็กใหม่เพื่อใช้ในฟอร์มอัปโหลดวิดีโอ</p>
      </div>
      <NewTagForm />
    </section>
  );
}
