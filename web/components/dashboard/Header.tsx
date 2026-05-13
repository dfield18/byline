"use client";

import { ChevronDown, Calendar, Download, FileText, SlidersHorizontal } from "lucide-react";
import { toPng } from "html-to-image";
import { useState } from "react";

export function Header() {
  const [exporting, setExporting] = useState(false);

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
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Overview</h1>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Elizabeth Warren · AI Visibility
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Entity selector */}
          <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors">
            <span className="h-5 w-5 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-semibold text-primary">
              EW
            </span>
            <span className="font-medium">Elizabeth Warren</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {/* Date range */}
          <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Last 30 days</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {/* Filters (contains model chips) */}
          <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Filters</span>
            <span className="hidden md:inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
              4
            </span>
          </button>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export PNG"}
          </button>

          <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            <FileText className="h-3.5 w-3.5" />
            Generate Report
          </button>
        </div>
      </div>
    </header>
  );
}
