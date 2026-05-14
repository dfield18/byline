"use client";

import { ChevronDown, Download, Check } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Defaults match the Warren design reference so /dashboard-preview keeps
// working without changes. /subjects/[id] passes the real subject in.
const DEFAULT_NAME = "Elizabeth Warren";
const DEFAULT_INITIALS = "EW";
const DEFAULT_META =
  "Elizabeth Warren · AI Visibility · Last 30 days · updated 14m ago";

export function Header({
  subjectName = DEFAULT_NAME,
  subjectInitials = DEFAULT_INITIALS,
  metaLine = DEFAULT_META,
  subjects,
  currentSubjectId,
  backHref,
  backLabel,
  refreshSlot,
}: {
  subjectName?: string;
  subjectInitials?: string;
  metaLine?: string;
  subjects?: { id: number; name: string }[];
  currentSubjectId?: number;
  // Optional "← back" link rendered before the page title. Only shown
  // when both backHref and backLabel are provided.
  backHref?: string;
  backLabel?: string;
  // Optional right-side action button (typically the RefreshButton
  // for the subject page). Rendered after Export PNG.
  refreshSlot?: React.ReactNode;
} = {}) {
  const [exporting, setExporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close the picker on outside-click and Escape. Only attach listeners
  // while open so we're not paying for them on every render.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const interactive = subjects && subjects.length > 0;

  const handleExport = async () => {
    const target = document.querySelector("main") as HTMLElement | null;
    if (!target) return;
    try {
      setExporting(true);
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(target, {
        backgroundColor: bg,
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `overview-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="border-b border-border bg-card sticky top-0 z-20">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 h-16">
        <div className="flex items-baseline gap-3 min-w-0">
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="text-sm font-medium text-foreground/80 hover:text-foreground transition-colors whitespace-nowrap"
            >
              ← {backLabel}
            </Link>
          )}
          <span className="text-xs text-muted-foreground hidden md:inline truncate">
            {metaLine}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Entity selector — dropdown when subjects list is provided,
              otherwise a static chip for the design-preview route. */}
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={interactive ? () => setPickerOpen((o) => !o) : undefined}
              aria-haspopup={interactive ? "listbox" : undefined}
              aria-expanded={interactive ? pickerOpen : undefined}
              className={`flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm transition-colors ${
                interactive ? "hover:border-primary/50 cursor-pointer" : "cursor-default"
              }`}
            >
              <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-semibold leading-none text-primary">
                {subjectInitials}
              </span>
              <span className="font-medium">{subjectName}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                  pickerOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {interactive && pickerOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-full mt-1 w-72 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg z-30"
              >
                <div className="px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Switch subject
                </div>
                <ul className="py-1">
                  {subjects!.map((s) => {
                    const current = s.id === currentSubjectId;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/subjects/${s.id}`}
                          onClick={() => setPickerOpen(false)}
                          className={`flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${
                            current ? "text-foreground font-medium" : "text-foreground/80"
                          }`}
                          role="option"
                          aria-selected={current}
                        >
                          <span className="truncate">{s.name}</span>
                          {current && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-border">
                  <Link
                    href="/"
                    onClick={() => setPickerOpen(false)}
                    className="block px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    View all subjects →
                  </Link>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export PNG"}
          </button>

          {refreshSlot}
        </div>
      </div>
    </header>
  );
}
