import Link from "next/link";
import {
  LayoutDashboard,
  MessagesSquare,
  Eye,
  Swords,
  Hash,
  BookText,
  Sparkles,
  Lightbulb,
  FileBarChart,
  Settings,
  Radar,
} from "lucide-react";

// Sidebar nav entries. `slug` is null when no spoke exists yet —
// renders as a disabled-looking entry with a small "Soon" pill so
// users know it's coming but not built. Overview is special-cased
// (subject root, no slug suffix).
type NavSection = "overview" | "visibility" | "recommendations";

type NavEntry = {
  key: string;          // matches `activeSection` for highlight
  label: string;
  icon: typeof LayoutDashboard;
  slug: string | null;  // null = unbuilt; href becomes "#"
  isOverview?: boolean; // routes to /subjects/{id} (no slug)
};

const NAV: NavEntry[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, slug: null, isOverview: true },
  { key: "visibility", label: "Visibility", icon: Eye, slug: "visibility" },
  { key: "narrative", label: "Narrative", icon: MessagesSquare, slug: null },
  { key: "competition", label: "Competition", icon: Swords, slug: null },
  { key: "topics", label: "Topics", icon: Hash, slug: null },
  { key: "sources", label: "Sources", icon: BookText, slug: null },
  { key: "prompts", label: "Prompts", icon: Sparkles, slug: null },
  { key: "recommendations", label: "Recommendations", icon: Lightbulb, slug: "recommendations" },
  { key: "reports", label: "Reports", icon: FileBarChart, slug: null },
  { key: "settings", label: "Settings", icon: Settings, slug: null },
];

export function Sidebar({
  subjectId,
  activeSection = "overview",
}: {
  // Subject ID needed to construct spoke hrefs. When omitted (e.g.
  // rendered outside the subject context), all nav entries fall back
  // to the disabled-looking placeholder treatment.
  subjectId?: number;
  // Which nav entry should render as active. Each spoke page passes
  // its own key; defaults to "overview" for the subject root.
  activeSection?: NavSection;
} = {}) {
  return (
    <aside className="hidden lg:flex w-[246px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen overflow-y-auto">
      <div className="flex items-center gap-3 px-6 h-20 border-b border-sidebar-border">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Radar className="h-4 w-4" />
          <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-success border-2 border-sidebar" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            Brand Visibility
          </div>
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
            AI Narrative Intel
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-0.5">
        <div className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Workspace
        </div>
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeSection;
          // Compute href:
          //   - Overview when subjectId present → /subjects/{id}
          //   - Other built spokes when subjectId present → /subjects/{id}/{slug}
          //   - Unbuilt OR no subject context → "#" (renders as a
          //     disabled-looking entry; the "Soon" pill cues why)
          const hasSubject = typeof subjectId === "number";
          const href =
            hasSubject && item.isOverview
              ? `/subjects/${subjectId}`
              : hasSubject && item.slug
              ? `/subjects/${subjectId}/${item.slug}`
              : "#";
          const isUnbuilt = href === "#";

          // Tone:
          //   active   → primary tint + side rail
          //   unbuilt  → muted text, no hover affordance
          //   built    → muted-ish text, hover lifts to foreground +
          //              subtle bg
          const linkClass = isActive
            ? "bg-primary/[0.07] text-primary"
            : isUnbuilt
            ? "text-sidebar-foreground/45 cursor-default"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

          return (
            <Link
              key={item.key}
              href={href}
              className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors ${linkClass}`}
              aria-disabled={isUnbuilt || undefined}
              tabIndex={isUnbuilt ? -1 : undefined}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-primary" />
              )}
              <Icon
                className={`h-[15px] w-[15px] ${
                  isActive
                    ? "text-primary"
                    : isUnbuilt
                    ? "text-sidebar-foreground/35"
                    : "text-sidebar-foreground/55"
                }`}
              />
              <span
                className={
                  isActive
                    ? "font-semibold tracking-tight"
                    : "font-medium"
                }
              >
                {item.label}
              </span>
              {isUnbuilt && !item.isOverview && (
                <span
                  className="ml-auto rounded-sm border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  aria-hidden
                >
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
            JR
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium text-sidebar-foreground">Jordan Reyes</div>
            <div className="text-[10px] text-muted-foreground">Strategy / Public Affairs</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
