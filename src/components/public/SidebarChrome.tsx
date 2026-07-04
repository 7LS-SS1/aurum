"use client";

/**
 * Toggles document.body classes rather than React state so the sidebar CSS
 * (already keyed off body classes, see globals.css) doesn't need every public
 * page to share state across the Server/Client boundary. Desktop collapses
 * the sidebar in place; mobile/tablet opens it as an overlay drawer instead.
 */
function isMobileOrTablet() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1000px)").matches;
}

function closeMobileDrawer() {
  document.body.classList.remove("mside-open");
}

export function SidebarToggleButton() {
  function toggle() {
    if (isMobileOrTablet()) {
      document.body.classList.toggle("mside-open");
    } else {
      document.body.classList.toggle("side-collapsed");
    }
  }

  return (
    <button className="icon-btn" onClick={toggle} aria-label="เมนู">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
  );
}

export function SidebarScrim() {
  return <div className="scrim" onClick={closeMobileDrawer} />;
}
