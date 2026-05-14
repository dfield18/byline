import {
  LayoutDashboard,
  MessagesSquare,
  Eye,
  Swords,
  Hash,
  BookText,
  Sparkles,
  FileBarChart,
  Settings,
  Radar,
} from "lucide-react";

const nav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Narrative", icon: MessagesSquare },
  { label: "Visibility", icon: Eye },
  { label: "Competition", icon: Swords },
  { label: "Topics", icon: Hash },
  { label: "Sources", icon: BookText },
  { label: "Prompts", icon: Sparkles },
  { label: "Reports", icon: FileBarChart },
  { label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen overflow-y-auto">
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
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href="#"
              className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors ${
                item.active
                  ? "bg-primary/[0.07] text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              }`}
            >
              {item.active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-primary" />
              )}
              <Icon className={`h-[15px] w-[15px] ${item.active ? "text-primary" : "text-sidebar-foreground/55"}`} />
              <span className={item.active ? "font-semibold tracking-tight" : "font-medium"}>{item.label}</span>
            </a>
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
