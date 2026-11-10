import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { VideoForm } from "@/components/admin/VideoForm";
import { VideoWorkspace } from "@/components/admin/VideoWorkspace";
import { VideoPlayer } from "@/components/public/VideoPlayer";
import { buildJwPlayerIframeUrl, getDefaultJwPlayerConfig } from "@/lib/jwplayer";
import { getDefaultVideoControllerConfig } from "@/lib/player-settings";
export default async function AdminVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const [movie, sites, categories, mainCategories, actors] = await Promise.all([
    prisma.movie.findUnique({ where: { id }, include: { tags: { select: { name: true } }, actors: { select: { id: true } }, distributions: { include: { site: { select: { name: true } } } } } }),
    prisma.targetSite.findMany({ where: { isActive: true }, select: { id: true, name: true, baseUrl: true, healthStatus: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.mainCategory.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.actor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!movie) notFound();
  const initialMovie = { ...JSON.parse(JSON.stringify(movie)), tags: movie.tags.map(t => t.name), actorIds: movie.actors.map(a => a.id) };
  const iframe = movie.iframeUrl || (movie.videoProvider === "jwplayer" ? buildJwPlayerIframeUrl(movie.jwPlayerMediaId, await getDefaultJwPlayerConfig()) : undefined);
  const player = iframe ? <iframe src={iframe} title={movie.title} allowFullScreen style={{ width: "100%", aspectRatio: "16/9", border: 0 }} /> : movie.videoUrl ? <VideoPlayer src={movie.videoUrl} poster={movie.thumbnailUrl ?? undefined} controller={await getDefaultVideoControllerConfig()} /> : <p>ยังไม่มีไฟล์วิดีโอ — เพิ่มไฟล์ในแท็บแก้ไขข้อมูล</p>;
  return <VideoWorkspace movie={{ id, title: movie.title, status: movie.status, mainCategory: movie.mainCategory, views: movie.viewCount + movie.wpViewCount, description: movie.content || movie.excerpt || "", tags: movie.tags.map(t => t.name), updatedAt: movie.updatedAt.toISOString() }} role={session!.user.role} sites={sites} distributions={movie.distributions.map(d => ({ siteId: d.siteId, name: d.site.name, status: d.status, error: d.errorMessage, url: d.remotePostUrl, attempts: d.attempts }))} player={player} editor={<VideoForm sites={sites} categories={categories} mainCategories={mainCategories} actors={actors} initialMovie={initialMovie} />} />;
}
