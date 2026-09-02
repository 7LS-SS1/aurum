import { NewMainCategoryForm } from "@/components/admin/NewMainCategoryForm";

export default function NewMainCategoryPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มหมวดหมู่หลัก</span>ใหม่
        </h1>
        <p>หมวดหมู่หลักใหม่จะปรากฏในขั้นตอนเพิ่มวิดีโอทันที</p>
      </div>
      <NewMainCategoryForm />
    </section>
  );
}
