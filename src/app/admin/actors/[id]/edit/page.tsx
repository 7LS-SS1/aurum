import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActorForm } from "@/components/admin/ActorForm";

export default async function EditActorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await prisma.actor.findUnique({ where: { id } });
  if (!actor) notFound();

  return (
    <section>
      <div className="page-head">
        <h1>
          <span className="g">แก้ไข</span>นักแสดง
        </h1>
        <p>{actor.name}</p>
      </div>
      <ActorForm initialActor={actor} />
    </section>
  );
}
