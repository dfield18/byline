// Shared KPI vitals tile — the secondary-surface card used by both
// Overview's TrajectoryStrip and Visibility's briefing strip. Before
// extraction, Overview and Visibility hand-rolled near-identical tile
// JSX with subtle divergences (different gauge gating, different
// platform-subline support, different delta formatting). One
// component, one set of behaviors.
//
// What it renders (in vertical order):
//   1. Eyebrow:  title + optional subtitle + tooltip icon
//   2. Headline: value (large, tone-colored) + optional suffix
//                (smaller qualifier — e.g. topic name on Weakest
//                Topic) + optional ↑/↓ delta in "pts" (direction-
//                toned, independent of value tone)
//   3. Comparison bar: KpiGauge fill = current value, tick = subject-
//                      set benchmark, caption beneath ("vs N%
//                      subject-set avg"). Only when both gaugeValue
//                      + gaugeBenchmark are set. Optional orientation
//                      caption ("lower is better") below the gauge
//                      for inverse-tier metrics like Avg Mention
//                      Position.
//   4. Standalone caption: when there's no gauge but the tile has
//                          contextual text (e.g. "No tracked topics"
//                          on Weakest Topic), render as muted text in
//                          the same slot.
//   5. Sparkline + optional per-platform subline: pinned to floor via
//      mt-auto so baselines align across tiles in the row. Sparkline
//      omits itself when there are fewer than 2 measured points (or
//      no time series at all) — never fabricate a trend.
//
// Tile chrome (bg-muted/40 rounded-md p-4) matches the StatCard
// treatment elsewhere so any cluster of secondary-surface cards on
// either spoke reads as one visual family.

import { KpiGauge } from "@/components/dashboard/ui";
import { MiniSpark, TinySpark } from "@/components/dashboard/Sparklines";
import { KPI_PLATFORM_SPREAD_LOPSIDED } from "@/lib/kpiThresholds";

export type KpiVitalsTilePlatformItem = {
  name: string;
  value: number | null;
};

export type KpiVitalsTileProps = {
  // ── Header ──
  label: string;
  subtitle?: string;
  // KpiTooltipIcon takes text as a string; passed straight through.
  tooltipText: string;
  // Optional in-page anchor (e.g. "#trend") — when set, the whole
  // tile becomes a focusable <a> with a focus-visible ring.
  anchor?: string;

  // ── Value ──
  value: string;
  valueSuffix?: string | null;
  // CSS class string ("text-success", "text-warning", "text-foreground",
  // "text-muted-foreground"). Caller picks the strength tier; the
  // tile component doesn't compute it.
  valueColor: string;

  // ── Delta (independent of value tone) ──
  // Signed pp delta. Positive renders ↑ in success tone, negative
  // renders ↓ in warning tone, zero renders muted. Undefined / null
  // hides the delta entirely (no delta available for this metric).
  deltaPp?: number | null;
  // Tooltip override for the delta. Defaults to "vs previous snapshot".
  deltaTooltip?: string;

  // ── Comparison bar ──
  // Both 0..1 fractions. Gauge renders only when both are non-null
  // (current value + benchmark for the tick). For inverse-tier
  // metrics like Avg Mention Position, the caller pre-inverts via a
  // rank→frac helper so 1.0 = best.
  gaugeValue?: number | null;
  gaugeBenchmark?: number | null;
  // "vs 70% subject-set avg" text rendered inside the gauge as the
  // tick legend. Caller formats; tile component just passes through.
  benchmarkCaption?: string | null;
  // Optional one-line caption below the gauge — used for inverse-
  // tier metrics ("lower is better") so a reader doesn't read the
  // gauge against the rate-card convention.
  gaugeOrientationCaption?: string;

  // ── Standalone caption (no gauge) ──
  // Rendered ONLY when there's no gauge AND no sparkline footer
  // would consume the bottom slot. Carries fallback context for
  // tiles like Weakest Topic ("No material gap across tracked
  // topics") that don't have a benchmark to gauge against.
  standaloneCaption?: string | null;

  // ── Sparkline + platform breakdown (pinned to floor) ──
  sparkValues?: (number | null)[];
  sparkIsHistorical?: boolean[];
  sparkLabels?: string[];
  // Formatter for the sparkline's min/max axis labels. Defaults to
  // raw `String(v)` — but most callers will pass the same `format`
  // that produced their `value` so axis labels read in the same
  // units as the headline.
  sparkFormat?: (v: number | null) => string;
  // Spark visual variant: "mini" (default, 120px tall with axis
  // labels + per-point dots) for Vitals-tier tiles where the trend
  // is the secondary read; "tiny" (22px line-only) for compact
  // KPI strips where a full mini-chart would dominate the tile.
  // The Competition spoke's Standing band uses "tiny" because the
  // 4-tile strip sits above a ranking table in the same Card and
  // mini-charts would push the table below the fold.
  sparkVariant?: "mini" | "tiny";

  // Per-platform decomposition rendered below the sparkline. Top-3
  // platforms shown as "{Name} {pct}%"; spread flag appended when
  // the difference between highest and lowest crosses the
  // lopsidedSpreadThreshold. Only Overview's AI Mention Rate tile
  // populates this today; others leave it undefined.
  platformBreakdown?: KpiVitalsTilePlatformItem[];
  platformBreakdownIsSigned?: boolean;
  platformBreakdownLopsidedThreshold?: number;
};

// ─── Internal helpers ─────────────────────────────────────────────

function gaugeFillFromValueColor(valueColor: string): string {
  if (valueColor === "text-success") return "var(--success)";
  if (valueColor === "text-warning") return "var(--warning)";
  return "var(--primary)";
}

function deltaToneClass(deltaPp: number): string {
  if (deltaPp > 0) return "text-success";
  if (deltaPp < 0) return "text-warning";
  return "text-muted-foreground";
}

// Tooltip icon component lifted inline so the tile doesn't have a
// cross-page dependency on either spoke's local KpiTooltipIcon. Small
// "i" glyph with hover-AND-focus-revealed styled popover. Earlier this
// relied only on the browser-native `title` attribute, which renders
// as a tiny unstyled grey rectangle after ~1s of hover delay — most
// users perceived that as "the tooltip doesn't work" since every
// other tooltip in the app is a custom styled popover. Now wraps a
// focusable group container around the glyph + a popover span so:
//  - Mouse hover → popover reveals immediately
//  - Tab focus → popover reveals (group-focus-within)
//  - SR users → aria-label on the focusable group announces the text
function KpiTooltipIcon({
  text,
  align = "right",
}: {
  text: string;
  // Horizontal alignment of the popover relative to the glyph.
  // Default "right" suits KPI tiles where the icon sits at the
  // right edge of the title block — a center-aligned popover
  // overflows the tile to the right. Override for icons positioned
  // toward the left of a row.
  align?: "left" | "center" | "right";
}) {
  const pos =
    align === "right"
      ? "right-0"
      : align === "left"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label={text}
      className="group relative inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span
        aria-hidden
        className="inline-flex h-3.5 w-3.5 flex-shrink-0 cursor-help items-center justify-center rounded-full text-[9px] font-bold text-muted-foreground/70 ring-1 ring-inset ring-muted-foreground/30 hover:text-foreground/80 hover:ring-foreground/40 group-focus-within:text-foreground/80 group-focus-within:ring-foreground/40 transition-colors"
      >
        i
      </span>
      <span
        aria-hidden
        className={`pointer-events-none absolute ${pos} bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] font-normal normal-case tracking-normal leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-30 shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────

export function KpiVitalsTile(props: KpiVitalsTileProps) {
  const {
    label,
    subtitle,
    tooltipText,
    anchor,
    value,
    valueSuffix,
    valueColor,
    deltaPp,
    deltaTooltip,
    gaugeValue,
    gaugeBenchmark,
    benchmarkCaption,
    gaugeOrientationCaption,
    standaloneCaption,
    sparkValues,
    sparkIsHistorical,
    sparkLabels,
    sparkFormat,
    sparkVariant = "mini",
    platformBreakdown,
    platformBreakdownIsSigned,
    platformBreakdownLopsidedThreshold,
  } = props;

  const hasGauge =
    gaugeValue !== undefined &&
    gaugeValue !== null &&
    Number.isFinite(gaugeValue) &&
    gaugeBenchmark !== undefined &&
    gaugeBenchmark !== null &&
    Number.isFinite(gaugeBenchmark);

  // Render the spark slot whenever the caller passed a values array
  // — MiniSpark handles its own empty states ("Not measured for this
  // subject" when every value is null, "1 of N snapshots scored so
  // far" when only one measured point). Skipping the slot externally
  // would lose those placeholders. When a metric truly has no time
  // series (e.g. Visibility's Avg Mention Position), the caller
  // leaves sparkValues undefined and the slot is omitted entirely.
  const hasSpark = sparkValues !== undefined && sparkValues.length > 0;

  const fillColor = gaugeFillFromValueColor(valueColor);

  const tileInner = (
    <>
      {/* Eyebrow + tooltip */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </div>
          {/* Subtitle slot reserved on every tile (non-breaking space
              placeholder when empty) so the title block occupies the
              same vertical space across siblings — without this, a
              "across all topics" subtitle on one tile would push its
              value + spark down relative to siblings. */}
          <div className="text-[10px] text-muted-foreground/75 lowercase mt-0.5">
            {subtitle || " "}
          </div>
        </div>
        <KpiTooltipIcon text={tooltipText} />
      </div>

      {/* Value + suffix + delta */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span
          className={`text-2xl font-semibold tracking-tight tabular-nums leading-tight ${valueColor}`}
        >
          {value}
        </span>
        {valueSuffix && (
          <span
            className={`text-base font-medium leading-tight ${valueColor}`}
            title={valueSuffix}
          >
            {valueSuffix}
          </span>
        )}
        {deltaPp !== undefined &&
          deltaPp !== null &&
          Number.isFinite(deltaPp) && (
            <span
              className={`text-[12px] font-medium tabular-nums ${deltaToneClass(
                deltaPp,
              )}`}
              aria-label={`Change ${
                deltaTooltip ?? "vs previous snapshot"
              }: ${
                deltaPp > 0 ? "up" : deltaPp < 0 ? "down" : "no change"
              } ${Math.abs(Math.round(deltaPp))} points`}
              title={deltaTooltip ?? "vs previous snapshot"}
            >
              {deltaPp > 0 ? "↑" : deltaPp < 0 ? "↓" : ""}
              {Math.abs(Math.round(deltaPp))} pts
            </span>
          )}
      </div>

      {/* Comparison bar — fill = current, tick = benchmark, inline
          caption rendered inside via benchmarkLabel. Renders only
          when both legs are present. */}
      {hasGauge && (
        <div className="mt-3">
          <KpiGauge
            value={gaugeValue as number}
            benchmark={gaugeBenchmark as number}
            fillColor={fillColor}
            benchmarkLabel={benchmarkCaption ?? undefined}
          />
          {gaugeOrientationCaption && (
            <div className="mt-1 text-[10px] italic text-muted-foreground/70 leading-snug">
              {gaugeOrientationCaption}
            </div>
          )}
        </div>
      )}

      {/* Standalone caption when there's no gauge — carries fallback
          context like "No material gap across tracked topics" on
          Weakest Topic. When a sparkline IS rendered below, push the
          caption up via no-mt-auto (sparkline floor-pin handles
          baseline alignment). When there's no sparkline either,
          mt-auto pins the caption to the floor so it aligns with
          siblings that DO have sparks. */}
      {!hasGauge && standaloneCaption && (
        <div
          className={`text-[11px] text-muted-foreground leading-snug line-clamp-2 ${
            hasSpark ? "mt-3" : "mt-auto pt-3"
          }`}
          title={standaloneCaption}
        >
          {standaloneCaption}
        </div>
      )}

      {/* Sparkline + per-platform subline pinned to tile floor. Both
          share the mt-auto wrapper so the {spark, subline} block
          hugs the floor as one unit — sparkline baselines still
          align across tiles even when one tile has a subline and
          another doesn't. */}
      {hasSpark && (
        <div className="mt-auto pt-3">
          {sparkVariant === "tiny" ? (
            <TinySpark
              values={sparkValues as (number | null)[]}
              color={fillColor}
              ariaLabel={`${label} trend, ${sparkValues!.length} snapshot${sparkValues!.length === 1 ? "" : "s"}`}
            />
          ) : (
            <MiniSpark
              values={sparkValues as (number | null)[]}
              isHistorical={
                sparkIsHistorical ??
                new Array(sparkValues!.length).fill(false)
              }
              labels={sparkLabels ?? new Array(sparkValues!.length).fill("")}
              format={sparkFormat ?? ((v) => (v === null ? "—" : String(v)))}
              color={fillColor}
              ariaLabel={`${label} trend, ${sparkValues!.length} snapshot${sparkValues!.length === 1 ? "" : "s"}`}
            />
          )}
          {platformBreakdown &&
            (() => {
              const sorted = platformBreakdown
                .filter(
                  (p) => p.value !== null && Number.isFinite(p.value),
                )
                .slice()
                .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
              if (sorted.length < 2) return null;
              const TOP_N = 3;
              const shown = sorted.slice(0, TOP_N);
              const remaining = sorted.length - TOP_N;
              const isSigned = !!platformBreakdownIsSigned;
              const toPct = (v: number) => {
                const raw = Math.round(v * 100);
                return isSigned ? raw : Math.min(100, Math.max(0, raw));
              };
              const fmt = (v: number) => {
                const n = toPct(v);
                if (!isSigned) return `${n}%`;
                if (n === 0) return "0%";
                return n > 0 ? `+${n}%` : `${n}%`;
              };
              const pcts = sorted.map((p) => toPct(p.value as number));
              const spread = pcts[0] - pcts[pcts.length - 1];
              // Default reads from the shared kpiThresholds module
              // (was a hardcoded 40 inline) so the threshold can be
              // retuned in one place. Callers can still override
              // per-tile if they want a tighter / looser flag.
              const lopsidedThreshold =
                platformBreakdownLopsidedThreshold ??
                KPI_PLATFORM_SPREAD_LOPSIDED;
              const isLopsided = spread >= lopsidedThreshold;
              return (
                <div className="mt-2 text-[10.5px] text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground/55">
                    By platform
                  </span>
                  {shown.map((p, i) => (
                    <span key={`${p.name}-${i}`}>
                      {" · "}
                      {p.name}{" "}
                      <span className="tabular-nums font-medium text-foreground/80">
                        {fmt(p.value as number)}
                      </span>
                    </span>
                  ))}
                  {remaining > 0 && (
                    <span>{" · "}+{remaining} more</span>
                  )}
                  {isLopsided && (
                    <span
                      className="text-warning tabular-nums"
                      title="Spread between the highest and lowest platform values. A wide spread means this metric is concentrated on one provider — worth understanding per-platform tactics."
                    >
                      {" · "}{spread} pt spread
                    </span>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </>
  );

  const baseClasses = "flex h-full flex-col rounded-md bg-muted/40 p-4";
  if (anchor) {
    return (
      <a
        href={`#${anchor}`}
        className={`${baseClasses} group transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm`}
      >
        {tileInner}
      </a>
    );
  }
  return <div className={baseClasses}>{tileInner}</div>;
}
