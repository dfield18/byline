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
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow && (
          <div className="text-[12px] font-semibold text-primary/80 mb-1.5">
            {eyebrow}
          </div>
        )}
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-foreground/75 mt-1 max-w-2xl leading-relaxed">{description}</p>
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
