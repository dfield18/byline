// Per-metric absolute-strength thresholds used by both Overview's
// Vitals KPI tiles and Visibility's briefing KPI tiles. Single source
// of truth so the same 50% mention rate is colored identically on
// both spokes; without this shared module the two pages drifted
// (Visibility colored at 0.7/0.4 while Overview colored at 0.6/0.3).
//
// The color rule everywhere:
//   - The VALUE's color reflects absolute strength tier (success /
//     neutral / warning) per the constants here.
//   - The DELTA (↑/↓ N pts) is colored by direction independently —
//     a strong value that's slipping reads as green-number + amber
//     down-arrow, intentionally.
//   - Polarity differs per metric — rate metrics are higher_better;
//     avg_rank is lower_better (inverse tier); avg_tone is signed.

// ── Rate metrics (0..1, higher better) ────────────────────────────

// Mention rate — share of AI answers in which the subject appears.
// Aligned with the Visibility platform-status pills' thresholds
// (STATUS_STRONG_MENTION_RATE = 0.6 / STATUS_WEAK_MENTION_RATE = 0.3)
// so "Strong" means the same thing on both surfaces. The 30-60%
// band is neutral — visibility that could go either way — not
// success. Earlier ≥0.5 cutoff celebrated a "half the time"
// mention rate as a win and hid steep declines.
export const KPI_STRONG_MENTION_RATE = 0.6;
export const KPI_WEAK_MENTION_RATE = 0.3;

// Top-result rate — share of answers where the subject is named
// FIRST. Real-world range caps lower than overall mention rate
// (30-40% even for dominant subjects), so the strong floor sits
// at 50% and weak at 20%. A subject AI picks first only 1-in-10
// times is structurally weak on this dimension.
export const KPI_STRONG_TOP_RESULT_RATE = 0.5;
export const KPI_WEAK_TOP_RESULT_RATE = 0.2;

// ── Inverse-tier metric (lower is better) ─────────────────────────

// Average mention position — 1..N rank where 1 = best (subject is
// named first). Inverse polarity vs the rate metrics: rank ≤ 2.0
// is strong (named first or near-first); rank > 4.0 is weak (deep
// in the answer, often missed). Used by Visibility's Avg Mention
// Position tile.
export const KPI_STRONG_AVG_RANK = 2.0;
export const KPI_WEAK_AVG_RANK = 4.0;

// ── Signed metric (range −1..+1, treated symmetrically) ──────────

// Average sentiment / favorability. Treated SYMMETRICALLY around
// zero (this metric is NOT a 0..1 rate). ±10% neutral band absorbs
// snapshot-to-snapshot noise so a -7% reading doesn't fire warning
// while a +4 pts delta arrow is already carrying the directional
// story.
export const KPI_STRONG_AVG_TONE = 0.10;
export const KPI_WEAK_AVG_TONE = -0.10;

// ── Cross-platform spread (informational) ─────────────────────────

// Pp threshold above which the per-platform subline below a KPI
// tile renders a warning-toned "{N} pt spread" flag. Below this
// the platforms are close enough that the breakdown is informational
// only; at/above, this metric is single-platform-dependent.
export const KPI_PLATFORM_SPREAD_LOPSIDED = 40;

// ─── Color resolver ──────────────────────────────────────────────

export type KpiColorKind =
  | "mention_rate"
  | "avg_tone"
  | "risk_frame_rate"
  | "weakest_topic_recall"
  | "citation_rate"
  | "net_sentiment"
  | "top_result_rate"
  | "avg_rank";

// Returns the Tailwind text-color class for a metric's value. Null
// input renders neutral so a missing-data tile doesn't fire color.
export function getKpiValueColor(
  kind: KpiColorKind,
  value: number | null,
): string {
  if (value === null) return "text-foreground";
  switch (kind) {
    case "mention_rate":
      if (value >= KPI_STRONG_MENTION_RATE) return "text-success";
      if (value < KPI_WEAK_MENTION_RATE) return "text-warning";
      return "text-foreground";
    case "avg_tone":
      if (value >= KPI_STRONG_AVG_TONE) return "text-success";
      if (value <= KPI_WEAK_AVG_TONE) return "text-warning";
      return "text-foreground";
    case "risk_frame_rate":
      // 0..1 — lower is better (rate of warning-tagged responses).
      if (value <= 0.05) return "text-success";
      if (value > 0.2) return "text-warning";
      return "text-foreground";
    case "weakest_topic_recall":
      // 0..1 — narrower ladder than mention_rate. The framing of
      // the tile is "this is the weakest topic", so celebrating
      // it with green at any value undercuts the message. Only
      // fire warning on genuinely severe gaps (<30%).
      if (value < 0.3) return "text-warning";
      return "text-foreground";
    case "citation_rate":
      // 0..1 — higher better, but real-world range caps lower than
      // mention rate. Warning only for low-but-nonzero (configured
      // canonical_url that AI ignores) — pure-zero stays neutral
      // since it usually means no URL is configured.
      if (value >= 0.2) return "text-success";
      if (value > 0 && value < 0.05) return "text-warning";
      return "text-foreground";
    case "net_sentiment":
      // Signed integer count (positive responses − negative
      // responses per snapshot). Direction is the signal.
      if (value > 0) return "text-success";
      if (value < 0) return "text-warning";
      return "text-foreground";
    case "top_result_rate":
      if (value >= KPI_STRONG_TOP_RESULT_RATE) return "text-success";
      if (value < KPI_WEAK_TOP_RESULT_RATE) return "text-warning";
      return "text-foreground";
    case "avg_rank":
      // INVERSE-TIER: lower is better. rank ≤ 2.0 strong, > 4.0
      // weak. Polarity flipped vs rate metrics.
      if (value <= KPI_STRONG_AVG_RANK) return "text-success";
      if (value > KPI_WEAK_AVG_RANK) return "text-warning";
      return "text-foreground";
  }
}
