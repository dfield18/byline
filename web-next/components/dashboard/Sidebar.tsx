"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Route-aware sidebar for the (dashboard) shell.

   The (dashboard) layout renders exactly ONE sidebar, so rather than a
   nested subjects/[id] layout (which would stack a second sidebar), this
   single component switches its nav by route:

     - On a subject route (/subjects/{id} or /subjects/{id}/{spoke}) it
       shows the SUBJECT-SCOPED spoke nav (Overview + the spokes).
     - Everywhere else (/subjects, /subjects/new) it shows the
       WORKSPACE nav.

   The subject id is parsed straight from the pathname, so no data needs
   to be threaded down. Spokes other than Overview aren't built yet —
   they render as disabled "Soon" placeholders so the IA reads as
   intentional. Icons are inline SVG (no icon dependency). */

type IconProps = { className?: string };

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function SubjectsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="m2 16 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}
function ReportsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" rx="0.5" />
      <rect x="13" y="7" width="3" height="10" rx="0.5" />
    </svg>
  );
}
function SettingsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
function OverviewIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function DashboardIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="8" rx="1" />
      <rect x="14" y="15" width="7" height="6" rx="1" />
    </svg>
  );
}
function VisibilityIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function CompetitionIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
function NarrativeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}
function SourcesIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}
function PromptsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
    </svg>
  );
}
function RecommendationsIcon({ className }: IconProps) {
  return (
    <svg className={className} {...svgProps}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.1 14c.2-1 .6-1.7 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.8.8 1.2 1.5 1.4 2.5" />
    </svg>
  );
}

type Spoke = {
  key: string; // "" = Overview (subject root); else the path segment
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  built: boolean;
};

const SPOKES: Spoke[] = [
  { key: "", label: "Overview", Icon: OverviewIcon, built: true },
  { key: "dashboard", label: "Dashboard", Icon: DashboardIcon, built: true },
  { key: "dashboard_v2", label: "Dashboard v2", Icon: DashboardIcon, built: true },
  { key: "visibility", label: "Visibility", Icon: VisibilityIcon, built: true },
  { key: "competition", label: "Competitive", Icon: CompetitionIcon, built: true },
  { key: "narrative", label: "Narrative", Icon: NarrativeIcon, built: true },
  { key: "sources", label: "Sources", Icon: SourcesIcon, built: true },
  { key: "prompts", label: "Prompts", Icon: PromptsIcon, built: true },
  {
    key: "recommendations",
    label: "Recommendations",
    Icon: RecommendationsIcon,
    built: true,
  },
];

function SpokeNav({ subjectId, active }: { subjectId: string; active: string }) {
  return (
    <>
      <Link href="/subjects" className="dash-nav-back">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        All subjects
      </Link>
      <div className="dash-nav-label">This subject</div>
      {SPOKES.map(({ key, label, Icon, built }) => {
        const isActive = active === key;
        const href = `/subjects/${subjectId}${key ? `/${key}` : ""}`;
        if (built) {
          return (
            <Link
              key={key || "overview"}
              href={href}
              className={`dash-nav-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="ico" />
              <span>{label}</span>
            </Link>
          );
        }
        return (
          <span key={key} className="dash-nav-item disabled" aria-disabled>
            <Icon className="ico" />
            <span>{label}</span>
            <span className="soon">Soon</span>
          </span>
        );
      })}
    </>
  );
}

function WorkspaceNav({ subjectsActive }: { subjectsActive: boolean }) {
  return (
    <>
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
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // Match a subject-detail route: /subjects/{numericId}[/{spoke}]. The
  // list (/subjects) and create (/subjects/new) routes don't match
  // (the id segment must be digits), so they fall through to the
  // workspace nav.
  const subjectMatch = pathname.match(/^\/subjects\/(\d+)(?:\/([^/?]+))?/);

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
        {subjectMatch ? (
          <SpokeNav subjectId={subjectMatch[1]} active={subjectMatch[2] ?? ""} />
        ) : (
          <WorkspaceNav subjectsActive={pathname.startsWith("/subjects")} />
        )}
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
