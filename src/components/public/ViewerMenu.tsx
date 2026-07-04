"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import type { ViewerActor } from "@/lib/viewer-auth";

export function ViewerMenu({ viewer }: { viewer: ViewerActor | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!viewer) {
    return (
      <Link className="login-link" href="/login">
        เข้าสู่ระบบ
      </Link>
    );
  }

  async function logout() {
    setOpen(false);
    await apiFetch("/api/public/auth/logout", { method: "POST" });
    router.refresh();
  }

  const initial = viewer!.displayName.charAt(0).toUpperCase() || "A";

  return (
    <div style={{ position: "relative" }}>
      <button className="user-chip" onClick={() => setOpen((v) => !v)} aria-label="บัญชีของฉัน">
        <span className="user-chip-avatar">{initial}</span>
        <span className="user-chip-text">
          <span className="user-chip-name">{viewer.displayName}</span>
        </span>
      </button>
      {open && (
        <div className="menu-pop open" style={{ top: 48, bottom: "auto" }}>
          <Link href="/library" onClick={() => setOpen(false)}>
            ดูภายหลัง
          </Link>
          <Link href="/liked" onClick={() => setOpen(false)}>
            วิดีโอที่ถูกใจ
          </Link>
          <button onClick={logout}>ออกจากระบบ</button>
        </div>
      )}
    </div>
  );
}
