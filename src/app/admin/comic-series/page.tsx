import { prisma } from "@/lib/prisma";
import { ComicSeriesManager } from "@/components/admin/ComicSeriesManager";

export default async function ComicSeriesPage() {
  const series = await prisma.comicSeries.findMany({ select: { id: true, slug: true, title: true, description: true }, orderBy: { title: "asc" } });

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">ซีรีส์</span>ทั้งหมด
        </h1>
        <p>จัดการรายชื่อซีรีส์ที่ใช้จัดกลุ่มคอมมิค</p>
      </div>
      <ComicSeriesManager initialSeries={series} />
    </section>
  );
}
