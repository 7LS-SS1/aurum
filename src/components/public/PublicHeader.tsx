import Link from "next/link";
import { auth } from "@/auth";
import { SidebarToggleButton, SidebarScrim } from "@/components/public/SidebarChrome";
import { BottomNav } from "@/components/public/BottomNav";
import { ViewerMenu } from "@/components/public/ViewerMenu";
import { getViewerFromCookies } from "@/lib/viewer-auth";

export async function PublicHeader({ q = "", searchAction = "/" }: { q?: string; searchAction?: string }) {
  const [session, viewer] = await Promise.all([auth(), getViewerFromCookies()]);
  const userLabel = session?.user?.name || session?.user?.email || "";
  const userInitial = userLabel.charAt(0).toUpperCase() || "A";

  return (
    <>
      <header className="topbar">
      <div className="tb-left">
        <SidebarToggleButton />
        <Link className="logo" href="/">
          <span className="mark">
            <span>A</span>
          </span>
          <span className="word">AURUM</span>
        </Link>
      </div>
      <div className="tb-center">
        <form className="searchbar" action={searchAction} role="search">
          <input name="q" type="search" defaultValue={q} placeholder="ค้นหาหนัง, หมวดหมู่ หรือแท็ก" aria-label="ค้นหา" />
          <button className="go" type="submit" aria-label="ค้นหา">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        </form>
      </div>
      <div className="tb-spacer" />
      <Link className="icon-btn search-icon-mobile" href="/" aria-label="ค้นหา">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </Link>
      {session?.user && (
        <Link className="user-chip" href="/admin" aria-label="เปิด Backend Dashboard" style={{ marginRight: 4 }}>
          <span className="user-chip-avatar">{userInitial}</span>
          <span className="user-chip-text">
            <span className="user-chip-name">{userLabel}</span>
            <span className="user-chip-role">{session.user.role}</span>
          </span>
        </Link>
      )}
      <ViewerMenu viewer={viewer} />
      </header>
      <SidebarScrim />
      <BottomNav />
    </>
  );
}
