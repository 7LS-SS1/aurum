import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { getAdsPage } from "@/lib/ads-page-store";
import { resolveAdsKey } from "@/lib/ads-plugin-keys";
import { SiteDetails } from "@/components/admin/SiteDetails";

export const dynamic = "force-dynamic";
export default async function SiteDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!can(session.user.role, "site:view")) notFound();
  const { id } = await params;
  const comic = (await searchParams).type === "doujin";
  const select = { id:true, name:true, baseUrl:true, authType:true, postType:true, categoryRestBase:true, tagRestBase:true, isActive:true, healthStatus:true, lastCheckedAt:true, createdAt:true } as const;
  const site = comic ? await prisma.comicTargetSite.findUnique({ where:{id}, select }) : await prisma.targetSite.findUnique({ where:{id}, select });
  if (!site) notFound();
  const manage = can(session.user.role, "site:manage");
  const [counts, recent, ads] = await Promise.all([
    comic ? Promise.resolve([]) : prisma.distribution.groupBy({ by:["status"], where:{siteId:id}, _count:true }),
    comic ? Promise.resolve([]) : prisma.distribution.findMany({ where:{siteId:id}, select:{id:true,status:true,updatedAt:true,movie:{select:{title:true}}}, orderBy:{updatedAt:"desc"}, take:10 }),
    manage ? getAdsPage() : Promise.resolve(null),
  ]);
  function canonical(value:string) { try { const u=new URL(value); return u.origin + u.pathname.replace(/\/$/, ""); } catch { return null; } }
  const matches = ads?.config.websites.filter(s => canonical(s.url) !== null && canonical(s.url) === canonical(site.baseUrl)) ?? [];
  const advertising = await Promise.all(matches.map(async s => { let ready=false; try { await resolveAdsKey(s.id); ready=true; } catch {} return {id:s.id,enabled:s.enabled,ready}; }));
  return <SiteDetails origin={new URL(process.env.SERVICE_PUBLIC_ORIGIN || "https://aurum123.com").origin} site={{...site,createdAt:site.createdAt.toISOString(),lastCheckedAt:site.lastCheckedAt?.toISOString() ?? null}} comic={comic} manage={manage} counts={counts.map(c=>({status:c.status,count:c._count}))} recent={recent.map(r=>({id:r.id,title:r.movie.title,status:r.status,updatedAt:r.updatedAt.toISOString()}))} advertising={advertising} />;
}
