import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMinRole } from "@/lib/authz";
import { SiteSeoPanel } from "@/components/admin/SiteSeoPanel";
export default async function MovieSeoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMinRole("STAFF");
  const { id } = await params;
  const [movie, sites, drafts] = await Promise.all([
    prisma.movie.findUnique({ where: { id }, include: { tags: true } }),
    prisma.targetSite.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.movieSiteDraft.findMany({ where: { movieId: id } }),
  ]);
  if (!movie) notFound();
  return <SiteSeoPanel movieId={id} title={movie.title} keywords={movie.tags.map(tag => tag.name).join(", ")} sites={sites}
    initialDrafts={drafts.map(draft => ({ siteId: draft.siteId, title: draft.title, extraMeta: draft.extraMeta }))} />;
}
