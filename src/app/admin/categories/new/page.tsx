import { NewCategoryForm } from "@/components/admin/NewCategoryForm";

export default function NewCategoryPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มหมวดหมู่</span>ใหม่
        </h1>
        <p>หมวดหมู่ใหม่จะปรากฏในรายการเลือกของฟอร์มอัปโหลดวิดีโอทันที</p>
      </div>
      <NewCategoryForm />
    </section>
  );
}
