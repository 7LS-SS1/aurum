"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface VideoMenuGroup {
  label: string;
  links: Array<{ href: string; label: string }>;
}

const VIDEO_MENU_GROUPS: VideoMenuGroup[] = [
  { label: "จัดการนักแสดง", links: [{ href: "/admin/actors", label: "นักแสดงทั้งหมด" }, { href: "/admin/actors/new", label: "เพิ่มนักแสดงใหม่" }] },
  { label: "จัดการหมวดหมู่", links: [{ href: "/admin/categories", label: "หมวดหมู่ทั้งหมด" }, { href: "/admin/categories/new", label: "เพิ่มหมวดหมู่ใหม่" }] },
  { label: "จัดการแท็ก", links: [{ href: "/admin/tags", label: "จัดการแท็ก" }, { href: "/admin/tags/new", label: "เพิ่มแท็กใหม่" }] },
  { label: "จัดการหมวดหมู่หลัก", links: [{ href: "/admin/main-categories", label: "หมวดหมู่หลักทั้งหมด" }, { href: "/admin/main-categories/new", label: "เพิ่มหมวดหมู่หลักใหม่" }] },
];

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

export function AdminVideoMenu({ canCreate }: { canCreate: boolean }) {
  const pathname = usePathname();
  const activeGroup = VIDEO_MENU_GROUPS.find((group) => group.links.some((link) => isCurrentPath(pathname, link.href)))?.label ?? null;
  const [managementOpen, setManagementOpen] = useState(Boolean(activeGroup));
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);

  return (
    <div className="side-sec">
      <div className="side-cat">เนื้อหา</div>
      <Link className={`side-link ${isCurrentPath(pathname, "/admin/videos") ? "active" : ""}`} href="/admin/videos">วิดีโอทั้งหมด</Link>
      {canCreate && <Link className={`side-link ${isCurrentPath(pathname, "/admin/videos/new") ? "active" : ""}`} href="/admin/videos/new">เพิ่มวิดีโอใหม่</Link>}

      <button type="button" className="side-disclosure" aria-expanded={managementOpen} onClick={() => setManagementOpen((open) => !open)}>
        <span>จัดการเนื้อหาวิดีโอ</span><span aria-hidden="true">{managementOpen ? "−" : "+"}</span>
      </button>

      {managementOpen && (
        <div className="side-disclosure-panel">
          {VIDEO_MENU_GROUPS.map((group) => {
            const groupHasActiveLink = group.links.some((link) => isCurrentPath(pathname, link.href));
            const isOpen = openGroup === group.label;
            return (
              <div key={group.label} className="side-disclosure-group">
                <button type="button" className={`side-subcat side-subcat-toggle ${groupHasActiveLink ? "active" : ""}`} aria-expanded={isOpen} onClick={() => setOpenGroup((current) => (current === group.label ? null : group.label))}>
                  <span>{group.label}</span><span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && group.links.map((link) => <Link key={link.href} className={`side-link side-link-sub ${isCurrentPath(pathname, link.href) ? "active" : ""}`} href={link.href}>{link.label}</Link>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
