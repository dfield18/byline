"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Workspace-level sidebar for the (dashboard) shell.

   This is the WORKSPACE nav (subject-set scope), not the per-subject
   spoke nav. Spokes (Visibility, Narrative, Competition, …) are scoped
   to a single subject and belong in a future subjects/[id] nested
   layout once those pages are ported — they'd be wrong to surface here
   where no subject is selected. Reports/Settings are shown as "Soon"
   placeholders so the IA reads as intentional rather than missing.

   Icons are inline SVG (no icon dependency — matches the landing's
   hand-rolled approach). 16×16, currentColor stroke. */

type IconProps = { className?: string };

function SubjectsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 16 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function ReportsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" rx="0.5" />
      <rect x="13" y="7" width="3" height="10" rx="0.5" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const subjectsActive = pathname === "/subjects" || pathname.startsWith("/subjects/");

  return (
    <aside className="dash-sidebar">
      <Link href="/subjects" className="dash-brand">
        <div className="mark">B</div>
        <div>
          <div className="name">Byline</div>
          <div className="sub">AI Narrative Intel</div>
        </div>
      </Link>

      <nav className="dash-nav">
        <div className="dash-nav-label">Workspace</div>
        <Link
          href="/subjects"
          className={`dash-nav-item${subjectsActive ? " active" : ""}`}
          aria-current={subjectsActive ? "page" : undefined}
        >
          <SubjectsIcon className="ico" />
          <span>Subjects</span>
        </Link>

        <div className="dash-nav-label">Account</div>
        <span className="dash-nav-item disabled" aria-disabled>
          <ReportsIcon className="ico" />
          <span>Reports</span>
          <span className="soon">Soon</span>
        </span>
        <span className="dash-nav-item disabled" aria-disabled>
          <SettingsIcon className="ico" />
          <span>Settings</span>
          <span className="soon">Soon</span>
        </span>
      </nav>

      <div className="dash-user">
        <div className="av">BY</div>
        <div>
          <div className="un">Your workspace</div>
          <div className="ur">Public Affairs</div>
        </div>
      </div>
    </aside>
  );
}
