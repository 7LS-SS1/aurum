"use client";

import { useEffect } from "react";

/** Fire-and-forget view-count ping, once per mount — the watch page itself is `revalidate = 60`, so a server-side increment there would be cached/stale. */
export function ViewBeacon({ movieKey }: { movieKey: string }) {
  useEffect(() => {
    fetch(`/api/public/movies/${movieKey}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [movieKey]);

  return null;
}
