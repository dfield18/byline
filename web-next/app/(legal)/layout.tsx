import "./legal.css";
import Link from "next/link";

// Public legal pages (Privacy, Terms) — a route group with its own
// minimal chrome, outside the (dashboard) group so they don't inherit
// the app sidebar/header. proxy.ts exempts /privacy and /terms from the
// Clerk auth gate so they're reachable without signing in.
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="legal-root">
      <header className="legal-nav">
        <div className="legal-wrap">
          <Link href="/" className="legal-logo">
            <span className="mark">B</span>Byline
          </Link>
          <Link href="/" className="legal-back">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="legal-main">
        <div className="legal-wrap">
          <div className="legal-doc">{children}</div>
        </div>
      </main>

      <footer className="legal-foot">
        <div className="legal-wrap">
          <span>© 2026 Byline. All rights reserved.</span>
          <span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
