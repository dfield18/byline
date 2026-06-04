import type { ReactNode } from "react";
import type { SubjectOverview, KpiValue } from "@/lib/api";
import { Sparkline } from "@/components/dashboard/Sparkline";

type KpiSpark = {
  values: (number | null)[];
  isHistorical: boolean[];
  labels: string[];
};

/**
 * Shared Vitals + headline-KPI pieces, used by BOTH the Overview brief
 * (OverviewBrief) and the alternate Overview Dashboard. Single source of truth
 * for the KPI empty-state rules and the format helpers, so the two views can't
 * drift apart.
 */

export function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatScore(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

export function sentimentTone(value: number | null): { cls: string; word: string } | null {
  if (value === null) return null;
  if (value > 0.1) return { cls: "pos", word: "Positive" };
  if (value < -0.1) return { cls: "neg", word: "Negative" };
  return { cls: "neu", word: "Neutral" };
}

export function formatDelta(delta: number | null): string | null {
  if (delta === null || delta === 0) return null;
  const abs = Math.abs(delta);
  const num = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${delta > 0 ? "+" : "−"}${num}`;
}

export type KpiDef = {
  key: keyof SubjectOverview["kpis"];
  label: string;
  format: "pct" | "score";
  higherBetter: boolean;
};

export const KPI_DEFS: KpiDef[] = [
  { key: "ai_recall", label: "AI Recall", format: "pct", higherBetter: true },
  { key: "avg_sentiment", label: "Avg Sentiment", format: "score", higherBetter: true },
  { key: "risk_frame_rate", label: "Risk Framing", format: "pct", higherBetter: false },
  { key: "citation_rate", label: "Citation Rate", format: "pct", higherBetter: true },
];

function deltaClass(kpi: KpiValue, higherBetter: boolean): string {
  if (kpi.delta === null || kpi.delta === 0) return "flat";
  const good = higherBetter ? kpi.delta > 0 : kpi.delta < 0;
  return good ? "good" : "bad";
}

function trendArrow(trend: KpiValue["trend"]): string {
  return trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
}

function KpiCard({
  def,
  kpi,
  unit,
  spark,
}: {
  def: KpiDef;
  kpi: KpiValue;
  unit: string;
  spark?: KpiSpark;
}) {
  const hasValue = kpi.value !== null;
  const tone = hasValue && def.format === "score" ? sentimentTone(kpi.value) : null;
  const deltaText = formatDelta(kpi.delta);
  const dClass = deltaClass(kpi, def.higherBetter);

  // Footer rules:
  //  - no value at all → muted "Not enough data" (a missing metric never shows
  //    a meaningless change indicator).
  //  - value present but no prior snapshot (delta === null) → invisible spacer
  //    so tiles stay aligned, but no change text.
  //  - delta === 0 → "No change"; otherwise the arrow + signed delta.
  let footer: ReactNode;
  if (!hasValue) {
    footer = <div className="delta empty">Not enough data</div>;
  } else if (kpi.delta === null) {
    footer = (
      <div className="delta" aria-hidden style={{ visibility: "hidden" }}>
        —
      </div>
    );
  } else if (deltaText === null) {
    footer = <div className="delta flat">No change</div>;
  } else {
    footer = (
      <div className={`delta ${dClass}`}>
        <span aria-hidden>{trendArrow(kpi.trend)}</span>
        {deltaText} {unit}
      </div>
    );
  }

  const showSpark =
    spark && spark.values.filter((v): v is number => v !== null).length >= 2;

  return (
    <div className="kpi">
      <div className="k">{def.label}</div>
      <div className="v">
        {def.format === "pct" ? formatPct(kpi.value) : formatScore(kpi.value)}
        {tone && <span className={`tone-pill ${tone.cls}`}>{tone.word}</span>}
      </div>
      {footer}
      {showSpark && (
        <div className="kpi-spark">
          <Sparkline
            values={spark!.values}
            isHistorical={spark!.isHistorical}
            labels={spark!.labels}
            format={def.format === "pct" ? formatPct : formatScore}
            ariaLabel={`${def.label} trend`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The four headline KPI tiles. Pass `trajectory` to render a mini-sparkline of
 * each KPI's history inside its card (the Overview Dashboard does this; the
 * brief omits it since it has a separate Trends section).
 */
export function KpiGrid({
  kpis,
  trajectory,
}: {
  kpis: SubjectOverview["kpis"];
  trajectory?: SubjectOverview["trajectory"];
}) {
  return (
    <div className="kpi-grid">
      {KPI_DEFS.map((def) => (
        <KpiCard
          key={def.key}
          def={def}
          kpi={kpis[def.key]}
          unit={def.format === "score" ? "pts" : "pp"}
          spark={
            trajectory
              ? {
                  values: trajectory[def.key],
                  isHistorical: trajectory.is_historical,
                  labels: trajectory.weeks,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

/** Bottom-line verdict + recommended focus. Renders nothing if both are empty. */
export function VitalsBlock({
  bottomLine,
  recommendedFocus,
}: {
  bottomLine: string | null;
  recommendedFocus: string | null;
}) {
  if (!bottomLine && !recommendedFocus) return null;
  return (
    <div className="vitals">
      {bottomLine && (
        <>
          <div className="eyebrow">Bottom line</div>
          <p className="bottom-line">{bottomLine}</p>
        </>
      )}
      {recommendedFocus && (
        <div className="focus">
          <div className="eyebrow">Recommended focus</div>
          <p className="ftext">{recommendedFocus}</p>
        </div>
      )}
    </div>
  );
}
