"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Clerk's UserButton portal-mounts after hydration, so SSR-ing it would
// produce a server/client markup mismatch. Loading it with ssr:false
// means the server emits nothing and the client mounts it post-hydration
// — same pattern the old web/ Header used. Renders nothing when there's
// no signed-in user (e.g. BYLINE_AUTH=disabled local dev), which is fine.
const UserButton = dynamic(
  () => import("@clerk/nextjs").then((m) => m.UserButton),
  { ssr: false },
);

// Maps the current route to the chrome title shown at the left of the
// header bar. The page body still renders its own <h1>; this is just the
// persistent-chrome label. Kept deliberately small — extend as spokes
// land.
function titleForPath(pathname: string): string {
  if (pathname === "/subjects/new") return "New subject";
  if (pathname.startsWith("/subjects")) return "Subjects";
  return "Workspace";
}

export function Header() {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    <header className="dash-header">
      <div className="dash-header-inner">
        <span className="title">{title}</span>
        <div className="actions">
          <Link href="/subjects/new" className="dash-btn dash-btn-accent">
            <svg
              className="ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New subject
          </Link>
          <span suppressHydrationWarning>
            <UserButton />
          </span>
        </div>
      </div>
    </header>
  );
}
