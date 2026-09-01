import { NewComicSeriesForm } from "@/components/admin/NewComicSeriesForm";

export default function NewComicSeriesPage() {
  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">เพิ่มซีรีส์</span>ใหม่
        </h1>
        <p>ซีรีส์ใหม่จะปรากฏในรายการเลือกของฟอร์มคอมมิคทันที</p>
      </div>
      <NewComicSeriesForm />
    </section>
  );
}
