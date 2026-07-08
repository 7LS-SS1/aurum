import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VideoForm } from "@/components/admin/VideoForm";

export default async function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [movie, sites, categories] = await Promise.all([
    prisma.movie.findUnique({ where: { id } }),
    prisma.targetSite.findMany({
      where: { isActive: true },
      select: { id: true, name: true, baseUrl: true, healthStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!movie) notFound();

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">แก้ไข</span>วิดีโอ
        </h1>
        <p>{movie.title}</p>
      </div>
      <VideoForm sites={sites} categories={categories} initialMovie={JSON.parse(JSON.stringify(movie))} />
    </section>
  );
}
