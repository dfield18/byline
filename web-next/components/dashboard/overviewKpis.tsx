import type { ReactNode } from "react";
import Link from "next/link";
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
  help: string; // shown as a hover tooltip on the card label
};

export const KPI_DEFS: KpiDef[] = [
  {
    key: "ai_recall",
    label: "AI Mention Rate",
    format: "pct",
    higherBetter: true,
    help: "Share of AI answers that mention this subject at all. Higher means the subject surfaces more often when these prompts are asked.",
  },
  {
    key: "avg_sentiment",
    label: "Avg Sentiment",
    format: "score",
    higherBetter: true,
    help: "Average tone of AI answers about this subject, scored from −1 (negative) to +1 (positive). Around 0 is neutral.",
  },
  {
    key: "risk_frame_rate",
    label: "Risk Framing",
    format: "pct",
    higherBetter: false,
    help: "Share of answers that frame the subject around controversy, scandal, extremism, or reputational risk. Lower is better.",
  },
  {
    key: "citation_rate",
    label: "Citation Rate",
    format: "pct",
    higherBetter: true,
    help: "Share of AI answers that cite one of the subject's own websites.",
  },
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
  compact = false,
}: {
  def: KpiDef;
  kpi: KpiValue;
  unit: string;
  spark?: KpiSpark;
  compact?: boolean;
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
  } else if (kpi.value === 0 && def.format === "pct" && !def.higherBetter) {
    // A "lower is better" rate at 0 (e.g. risk framing) is a positive signal,
    // not a dead "no change" — say so explicitly.
    footer = (
      <div className="delta good">
        <span aria-hidden>✓</span> None detected
      </div>
    );
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

  // Hide the sparkline when it would just be visual clutter: a flat-at-zero
  // metric (e.g. Risk Framing at 0%) or one without enough history to plot.
  const isZeroPct = def.format === "pct" && kpi.value === 0;
  const showSpark =
    spark &&
    !isZeroPct &&
    spark.values.filter((v): v is number => v !== null).length >= 2;

  const valueEl = (
    <div className="v">
      {def.format === "pct" ? formatPct(kpi.value) : formatScore(kpi.value)}
      {tone && <span className={`tone-pill ${tone.cls}`}>{tone.word}</span>}
    </div>
  );
  const sparkEl = showSpark ? (
    <div className="kpi-spark">
      <Sparkline
        values={spark!.values}
        isHistorical={spark!.isHistorical}
        labels={spark!.labels}
        format={def.format === "pct" ? formatPct : formatScore}
        ariaLabel={`${def.label} trend`}
      />
    </div>
  ) : null;

  // Compact (Overview Dashboard): figures on the left, sparkline beside them on
  // the right, so the card gets shorter rather than taller.
  if (compact) {
    return (
      <div className="kpi kpi-compact">
        <div className="k">
          {def.label}
          <span className="kpi-info" tabIndex={0} aria-label={def.help}>
            i
            <span className="kpi-tip" role="tooltip">{def.help}</span>
          </span>
        </div>
        <div className="kpi-body">
          <div className="kpi-figures">
            {valueEl}
            {footer}
          </div>
          {sparkEl}
        </div>
      </div>
    );
  }

  return (
    <div className="kpi">
      <div className="k">
          {def.label}
          <span className="kpi-info" tabIndex={0} aria-label={def.help}>
            i
            <span className="kpi-tip" role="tooltip">{def.help}</span>
          </span>
        </div>
      {valueEl}
      {footer}
      {sparkEl}
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
  compact = false,
}: {
  kpis: SubjectOverview["kpis"];
  trajectory?: SubjectOverview["trajectory"];
  compact?: boolean;
}) {
  return (
    <div className="kpi-grid">
      {KPI_DEFS.map((def) => (
        <KpiCard
          key={def.key}
          def={def}
          kpi={kpis[def.key]}
          unit={def.format === "score" ? "pts" : "pp"}
          compact={compact}
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

/**
 * The top executive-summary module: Bottom line, What changed, Recommended
 * focus. Renders nothing if there's nothing to say.
 *  - brief: stacked bottom line + focus (roomy reading layout).
 *  - dashboard (`compact`): bottom line up top, then a "what changed" /
 *    "recommended focus" two-column row beneath a divider — the interpretive
 *    anchor of the page.
 */
export function VitalsBlock({
  bottomLine,
  recommendedFocus,
  recommendationsHref,
  extra,
  compact = false,
}: {
  bottomLine: string | null;
  recommendedFocus: string | null;
  recommendationsHref?: string; // link out to the full Recommendations tab
  extra?: ReactNode; // an additional card stacked under Recommended focus (dashboard)
  compact?: boolean;
}) {
  if (!bottomLine && !recommendedFocus && !extra) return null;

  // Dashboard: Bottom line as a full-width banner, then Recommended focus + an
  // optional extra card (e.g. "Where to focus") side by side beneath it.
  if (compact) {
    return (
      <div className="vitals vitals-exec">
        {bottomLine && (
          <div className="vexec-col vexec-banner">
            <div className="eyebrow">Bottom line</div>
            <p className="bottom-line">{bottomLine}</p>
          </div>
        )}
        <div className="vexec-row">
          {recommendedFocus && (
            <div className="vexec-col">
              <div className="eyebrow">Recommended focus</div>
              <p className="ftext">{recommendedFocus}</p>
              {recommendationsHref && (
                <Link href={recommendationsHref} className="vexec-link">
                  View all recommendations →
                </Link>
              )}
            </div>
          )}
          {extra}
        </div>
      </div>
    );
  }

  // Brief: stacked bottom line + focus.
  return (
    <div className={`vitals${compact ? " vitals-compact" : ""}`}>
      {bottomLine && (
        <div className="vline">
          <div className="eyebrow">Bottom line</div>
          <p className="bottom-line">{bottomLine}</p>
        </div>
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
