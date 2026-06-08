import "../(dashboard)/dashboard.css";
import Link from "next/link";

/**
 * Layout for the PUBLIC try-it flow. Reuses the dashboard design language
 * (so the Overview brief renders identically) but with a minimal public
 * top bar instead of the authed sidebar/header — the visitor has no
 * session and no other subjects to navigate.
 */
export default function TryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dash-root">
      <div className="dash-main-col">
        <header className="try-topbar">
          <Link href="/" className="try-brand">
            <span className="mark">B</span>Byline
          </Link>
          <span className="try-tag">Live demo</span>
          <Link href="/#cta" className="try-cta">
            Get started →
          </Link>
        </header>
        <main className="dash-main">{children}</main>
      </div>
    </div>
  );
}
