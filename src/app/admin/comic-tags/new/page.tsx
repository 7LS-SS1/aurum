import { NewComicTagForm } from "@/components/admin/NewComicTagForm";

export default function NewComicTagPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มแท็กคอมมิค</span>ใหม่
        </h1>
        <p>เพิ่มแท็กใหม่เพื่อใช้ในฟอร์มคอมมิค</p>
      </div>
      <NewComicTagForm />
    </section>
  );
}
