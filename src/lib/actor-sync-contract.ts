import { createHash } from "node:crypto";
import { z } from "zod";

export const actorSyncPayloadSchema = z.object({
  externalId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  slug: z.string().regex(/^aurum-actor-[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(300),
  bio: z.string().max(50000),
  profileImageUrl: z.string().url().refine(v => /^https?:\/\//i.test(v)).nullable(),
  metadata: z.object({
    age: z.number().int().nullable(), heightCm: z.number().int().nullable(), weightKg: z.number().int().nullable(),
    measurementBust: z.string().nullable(), measurementWaist: z.string().nullable(), measurementHip: z.string().nullable(),
  }).strict(),
}).strict();
export type ActorSyncPayload = z.infer<typeof actorSyncPayloadSchema>;
export const actorSyncRemoteSchema = z.object({
  remoteId: z.number().int().positive(), payload: actorSyncPayloadSchema,
  status: z.enum(["created", "updated", "skipped", "image_updated", "image_removed"]).optional(),
  // WordPress term ID in the `aurum_video_actor` taxonomy. Optional: older
  // plugin versions (pre actor-taxonomy support) never send it.
  termId: z.number().int().positive().optional(),
});
export type ActorSyncRemote = z.infer<typeof actorSyncRemoteSchema>;
export const actorSyncLookupSchema = z.union([actorSyncRemoteSchema, z.object({ found: z.literal(false) }).strict(), z.null()]);
export function actorFingerprint(payload: ActorSyncPayload): string {
  // Construct a fixed order, independent of JSON property order on WordPress.
  const p = actorSyncPayloadSchema.parse(payload);
  return createHash("sha256").update(JSON.stringify(p)).digest("hex");
}
export function actorPayload(actor: { id: string; name: string; bio: string | null; profileImageUrl: string | null } & ActorSyncPayload["metadata"]): ActorSyncPayload {
  return actorSyncPayloadSchema.parse({
    externalId: actor.id, slug: "aurum-actor-" + actor.id, name: actor.name, bio: actor.bio ?? "",
    profileImageUrl: actor.profileImageUrl || null,
    metadata: { age: actor.age, heightCm: actor.heightCm, weightKg: actor.weightKg,
      measurementBust: actor.measurementBust, measurementWaist: actor.measurementWaist, measurementHip: actor.measurementHip },
  });
}
