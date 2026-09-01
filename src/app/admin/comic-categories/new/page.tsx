import { NewComicCategoryForm } from "@/components/admin/NewComicCategoryForm";

export default function NewComicCategoryPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มหมวดหมู่คอมมิค</span>ใหม่
        </h1>
        <p>หมวดหมู่ใหม่จะปรากฏในรายการเลือกของฟอร์มคอมมิคทันที</p>
      </div>
      <NewComicCategoryForm />
    </section>
  );
}
