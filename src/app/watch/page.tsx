import { redirect } from "next/navigation";

/** Keep the public watch entry point linked to the service demo catalog. */
export default async function WatchIndex({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["category", "q", "page"] as const) {
    if (typeof params[key] === "string" && params[key]) query.set(key, params[key]);
  }
  redirect(`/catalog${query.size ? `?${query}` : ""}`);
}
