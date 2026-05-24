import { Info } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_0_rgba(15,23,42,0.02)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  // Optional override for the wrapper's bottom margin (defaults to
  // mb-5, giving a comfortable gap between section header and the
  // content card below). Pass "mb-3" or "mb-4" when a section's
  // content should feel more tightly bound to the header.
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className ?? "mb-5"}`}>
      <div>
        {eyebrow && (
          <div className="text-[12px] font-semibold text-primary/80 mb-1.5">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground [hyphens:none]">{title}</h2>
        {description && (
          <p className="text-sm text-foreground/75 mt-1 max-w-2xl leading-relaxed [hyphens:none]">{description}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function InfoLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <Info className="h-3 w-3 opacity-60" aria-hidden />
    </span>
  );
}

// Compact horizontal gauge bar — filled bar from 0 to the current
// value with an optional tick mark at a benchmark position. Used
// across spokes (Overview Vitals KPI strip, Visibility briefing
// tiles) to give the reader "where I am" + "where average is" at
// a glance. Extracted to shared so both pages render the same
// pixels.
export function KpiGauge({
  value,
  benchmark,
  fillColor,
}: {
  // 0..1 fraction. Out-of-range values are clamped defensively.
  value: number;
  // Optional benchmark in the same 0..1 scale. When null, tick mark
  // is omitted and the bar acts as a simple value-fill indicator.
  benchmark: number | null;
  // CSS color value for the fill (var(--success) / --warning /
  // --primary). Derived by the caller from the KPI's tone so the
  // gauge and the headline value color agree.
  fillColor: string;
}) {
  const safeValue = Math.max(0, Math.min(1, value));
  const safeBenchmark =
    benchmark !== null && Number.isFinite(benchmark)
      ? Math.max(0, Math.min(1, benchmark))
      : null;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${safeValue * 100}%`,
          background: fillColor,
          opacity: 0.85,
        }}
      />
      {safeBenchmark !== null && (
        <div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 h-3 w-[2px] rounded-sm bg-foreground/55"
          style={{ left: `calc(${safeBenchmark * 100}% - 1px)` }}
          title={`Subject-set average: ${Math.round(safeBenchmark * 100)}%`}
        />
      )}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "gold" | "success" | "warning" | "destructive";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-accent text-foreground/80 border-border",
    primary: "bg-primary/10 text-primary border-primary/30",
    gold: "bg-gold/10 text-gold border-gold/30",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
