"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const COMIC_MENU_GROUPS = [
  { label: "จัดการซีรีส์", links: [{ href: "/admin/comic-series", label: "ซีรีส์ทั้งหมด" }, { href: "/admin/comic-series/new", label: "เพิ่มซีรีส์ใหม่" }] },
  { label: "จัดการหมวดหมู่", links: [{ href: "/admin/comic-categories", label: "หมวดหมู่ทั้งหมด" }, { href: "/admin/comic-categories/new", label: "เพิ่มหมวดหมู่ใหม่" }] },
  { label: "จัดการแท็ก", links: [{ href: "/admin/comic-tags", label: "จัดการแท็ก" }, { href: "/admin/comic-tags/new", label: "เพิ่มแท็กใหม่" }] },
];

function isCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminComicMenu() {
  const pathname = usePathname();
  const activeGroup = COMIC_MENU_GROUPS.find((group) => group.links.some((link) => isCurrentPath(pathname, link.href)))?.label ?? null;
  const [managementOpen, setManagementOpen] = useState(Boolean(activeGroup));
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroup);

  return (
    <div className="side-sec">
      <div className="side-cat">Doujin/Comic</div>
      <Link className={`side-link ${isCurrentPath(pathname, "/admin/comics") ? "active" : ""}`} href="/admin/comics">คอมมิคทั้งหมด</Link>
      <Link className={`side-link ${isCurrentPath(pathname, "/admin/comics/new") ? "active" : ""}`} href="/admin/comics/new">เพิ่มคอมมิคใหม่</Link>

      <button type="button" className="side-disclosure" aria-expanded={managementOpen} onClick={() => setManagementOpen((open) => !open)}>
        <span>จัดการเนื้อหา Comic</span><span aria-hidden="true">{managementOpen ? "−" : "+"}</span>
      </button>

      {managementOpen && (
        <div className="side-disclosure-panel">
          {COMIC_MENU_GROUPS.map((group) => {
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
