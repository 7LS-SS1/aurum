"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "หน้าแรก",
    icon: <path d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />,
  },
  {
    href: "/videos",
    label: "วิดีโอทั้งหมด",
    icon: (
      <>
        <path d="M12 8v4l3 2M12 3a9 9 0 1 0 9 9" />
        <path d="M3 4v4h4" />
      </>
    ),
  },
  {
    href: "/library",
    label: "ดูภายหลัง",
    icon: <path d="M3 6h18M3 12h18M3 18h12M18 14v7m-3.5-3.5h7" />,
  },
  {
    href: "/liked",
    label: "ถูกใจ",
    icon: <path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h12.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 10H13l1-4.5A2 2 0 0 0 12 3l-5 7" />,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <Link key={item.href} className={`bn-item ${pathname === item.href ? "active" : ""}`} href={item.href}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {item.icon}
          </svg>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
