import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VideoForm } from "@/components/admin/VideoForm";

export default async function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [movie, sites, categories, mainCategories, actors] = await Promise.all([
    prisma.movie.findUnique({
      where: { id },
      include: { tags: { select: { name: true } }, actors: { select: { id: true } } },
    }),
    prisma.targetSite.findMany({
      where: { isActive: true },
      select: { id: true, name: true, baseUrl: true, healthStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.mainCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.actor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!movie) notFound();

  const initialMovie = {
    ...JSON.parse(JSON.stringify(movie)),
    tags: movie.tags.map((t) => t.name),
    actorIds: movie.actors.map((a) => a.id),
  };

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">แก้ไข</span>วิดีโอ
        </h1>
        <p>{movie.title}</p>
      </div>
      <VideoForm sites={sites} categories={categories} mainCategories={mainCategories} actors={actors} initialMovie={initialMovie} />
    </section>
  );
}
