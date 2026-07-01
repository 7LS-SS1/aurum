import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="topbar">
      <div className="tb-left">
        <Link className="logo" href="/">
          <span className="mark">
            <span>A</span>
          </span>
          <span className="word">AURUM</span>
        </Link>
      </div>
      <div className="tb-spacer" />
    </header>
  );
}
