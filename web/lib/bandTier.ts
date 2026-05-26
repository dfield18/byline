// Generic 3-band classifier with a "none" sentinel for null / NaN.
//
// Both the Visibility heatmap (`heatTier`) and the Competition
// Platform-Ownership heatmap (`sovTier`) classify a 0..1 fraction
// into high / mid / low bands plus a "no data" state. The only
// difference is the thresholds and the locally-named tier labels
// (gap/mid/healthy on Visibility; marginal/contested/dominant on
// Competition). Lifted here so the threshold-comparison logic
// (< lowMax / >= highMin) lives in one place and a future caller
// can't drift on edge cases (e.g. boundary inclusivity).
//
// Thresholds stay caller-supplied — each spoke's heatmap reads a
// different metric (mention rate vs SoV) with a different real-
// world distribution, so the breakpoints can't be shared at the
// classifier layer. The named constants live in `kpiThresholds.ts`
// (KPI_STRONG/WEAK_MENTION_RATE for Visibility, SOV_TIER_DOMINANT
// /MARGINAL for Competition) so the actual values stay tunable in
// one home, while the classification rule lives here.
//
// Each spoke's local tier type ("HeatTier" / "SovTier") aliases
// these generic names so the spoke-level switch statements on
// background color, border, text class keep their semantic
// readability ("case 'gap'" reads cleaner than "case 'low'" in
// the Visibility heatTierStyle's local context).

export type BandTier = "high" | "mid" | "low" | "none";

export function bandTier(
  value: number | null,
  { highMin, lowMax }: { highMin: number; lowMax: number },
): BandTier {
  if (value === null || !Number.isFinite(value)) return "none";
  if (value >= highMin) return "high";
  if (value < lowMax) return "low";
  return "mid";
}
