import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSubjectOverview,
  getSubject,
  type SubjectOverview,
  type SubjectDetail,
  type KpiValue,
} from "@/lib/api";
import { Sparkline } from "@/components/dashboard/Sparkline";

/**
 * Subject Overview — the customer-facing AI Narrative Brief.
 *
 * Same backend, new frontend: this consumes the existing
 * GET /api/subjects/{id}/overview contract (already typed in lib/api.ts)
 * and renders it in the hand-rolled token design language.
 *
 * FIRST SLICE — currently renders the Vitals band only: bottom line +
 * recommended focus, the four headline KPIs, and AI-Recall-by-platform.
 * Deferred to follow-up iterations (the heavy bands in the old web/
 * version): trajectory charts, narrative clusters, competitive
 * landscape, source mix, evidence quotes, and the polling refresh
 * button. The `.deferred-note` at the bottom of the page makes that
 * boundary visible rather than silent.
 */

const CATEGORY_CLASS: Record<string, string> = {
  person: "cat-person",
  organization: "cat-organization",
  issue: "cat-issue",
  policy: "cat-policy",
  event: "cat-event",
};

type KpiDef = {
  key: keyof SubjectOverview["kpis"];
  label: string;
  // "pct"   → value is a 0..1 rate shown as a percentage
  // "score" → value is a −1..+1 sentiment score shown signed, with a
  //           tone pill
  format: "pct" | "score";
  // Whether an increase is a good thing. risk_frame_rate is the lone
  // lower-is-better KPI, so its delta coloring inverts.
  higherBetter: boolean;
};

const KPI_DEFS: KpiDef[] = [
  { key: "ai_recall", label: "AI Recall", format: "pct", higherBetter: true },
  { key: "avg_sentiment", label: "Avg Sentiment", format: "score", higherBetter: true },
  { key: "risk_frame_rate", label: "Risk Framing", format: "pct", higherBetter: false },
  { key: "citation_rate", label: "Citation Rate", format: "pct", higherBetter: true },
];

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

// Tone band for a −1..+1 sentiment score. ±0.1 neutral band matches the
// backend's sentiment threshold convention.
function sentimentTone(value: number | null): { cls: string; word: string } | null {
  if (value === null) return null;
  if (value > 0.1) return { cls: "pos", word: "Positive" };
  if (value < -0.1) return { cls: "neg", word: "Negative" };
  return { cls: "neu", word: "Neutral" };
}

// Delta is already in points (pp for rates, score-points×100 for
// sentiment). Returns null for no-change so the caller can render a
// muted "No change".
function formatDelta(delta: number | null): string | null {
  if (delta === null || delta === 0) return null;
  const abs = Math.abs(delta);
  const num = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${delta > 0 ? "+" : "−"}${num}`;
}

function deltaClass(kpi: KpiValue, higherBetter: boolean): string {
  if (kpi.delta === null || kpi.delta === 0) return "flat";
  const good = higherBetter ? kpi.delta > 0 : kpi.delta < 0;
  return good ? "good" : "bad";
}

function trendArrow(trend: KpiValue["trend"]): string {
  return trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
}

// Latest non-null value in a trajectory series — the headline number
// shown next to each trend tile's title.
function latestMeasured(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v !== null) return v;
  }
  return null;
}

function kpiFormatter(format: KpiDef["format"]): (v: number | null) => string {
  return format === "pct" ? formatPct : formatScore;
}

function KpiCard({ def, kpi, unit }: { def: KpiDef; kpi: KpiValue; unit: string }) {
  const tone = def.format === "score" ? sentimentTone(kpi.value) : null;
  const deltaText = formatDelta(kpi.delta);
  const dClass = deltaClass(kpi, def.higherBetter);

  return (
    <div className="kpi">
      <div className="k">{def.label}</div>
      <div className="v">
        {def.format === "pct" ? formatPct(kpi.value) : formatScore(kpi.value)}
        {tone && <span className={`tone-pill ${tone.cls}`}>{tone.word}</span>}
      </div>
      <div className={`delta ${dClass}`}>
        {deltaText ? (
          <>
            <span aria-hidden>{trendArrow(kpi.trend)}</span>
            {deltaText} {unit}
          </>
        ) : (
          "No change"
        )}
      </div>
    </div>
  );
}

export default async function SubjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const subjectId = Number.parseInt(idStr, 10);
  if (Number.isNaN(subjectId)) notFound();

  // Overview (dashboard data) + subject detail (metadata + 404 signal),
  // fetched concurrently against the same backend.
  let data: SubjectOverview;
  let subject: SubjectDetail;
  try {
    [data, subject] = await Promise.all([
      getSubjectOverview(subjectId),
      getSubject(subjectId),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }
  void subject; // reserved for the refresh-history UI (deferred)

  const categoryClass = CATEGORY_CLASS[data.category] ?? "cat-person";

  const updatedShort = data.meta.last_refresh_at
    ? new Date(data.meta.last_refresh_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const backLink = (
    <Link href="/subjects" className="back-link">
      <svg
        className="ico"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      All subjects
    </Link>
  );

  // First-run: subject exists but has never completed a refresh. Show a
  // focused state instead of a page full of "—".
  if (data.meta.latest_refresh_id === null) {
    return (
      <>
        {backLink}
        <div className="first-run">
          <div className="eyebrow">AI Narrative Brief</div>
          <h1>{data.subject_name}</h1>
          <p>
            No snapshots yet for this subject. The first refresh generates the
            executive brief — KPIs, narrative clusters, evidence quotes, a
            competitive snapshot, and the source mix. A typical snapshot takes
            1–3 minutes across the major AI assistants.
          </p>
        </div>
      </>
    );
  }

  const platformMax = Math.max(
    ...data.platform_recall.map((p) => p.value ?? 0),
    0.0001,
  );

  return (
    <>
      {backLink}

      <div className="page-head">
        <div>
          <h1>{data.subject_name}</h1>
          <div className="meta-line">
            <span className={`cat-badge ${categoryClass}`}>{data.category}</span>
            {updatedShort && (
              <>
                <span className="dot">·</span>
                <span>Updated {updatedShort}</span>
              </>
            )}
            <span className="dot">·</span>
            <span>
              {data.meta.n_responses} response
              {data.meta.n_responses === 1 ? "" : "s"} across{" "}
              {data.meta.n_platforms} platform
              {data.meta.n_platforms === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      {/* Vitals: the verdict + recommended focus */}
      {(data.bottom_line || data.recommended_focus) && (
        <div className="vitals">
          {data.bottom_line && (
            <>
              <div className="eyebrow">Bottom line</div>
              <p className="bottom-line">{data.bottom_line}</p>
            </>
          )}
          {data.recommended_focus && (
            <div className="focus">
              <div className="eyebrow">Recommended focus</div>
              <p className="ftext">{data.recommended_focus}</p>
            </div>
          )}
        </div>
      )}

      {/* Headline KPIs */}
      <div className="kpi-grid">
        {KPI_DEFS.map((def) => (
          <KpiCard
            key={def.key}
            def={def}
            kpi={data.kpis[def.key]}
            unit={def.format === "score" ? "pts" : "pp"}
          />
        ))}
      </div>

      {/* 12-week trends — one sparkline per headline KPI */}
      {data.trajectory.weeks.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">
            Trends · last {data.trajectory.weeks.length} snapshots
          </div>
          <div className="trend-grid">
            {KPI_DEFS.map((def) => {
              const series = data.trajectory[def.key];
              const fmt = kpiFormatter(def.format);
              const latest = latestMeasured(series);
              return (
                <div className="trend-tile" key={def.key}>
                  <div className="th">
                    <span className="tl">{def.label}</span>
                    <span className="tv">{fmt(latest)}</span>
                  </div>
                  <Sparkline
                    values={series}
                    isHistorical={data.trajectory.is_historical}
                    labels={data.trajectory.weeks}
                    format={fmt}
                    ariaLabel={`${def.label} trend over the last ${data.trajectory.weeks.length} snapshots, latest ${fmt(latest)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Recall by platform */}
      {data.platform_recall.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-tag">AI Recall by platform</div>
          <div className="platform-list">
            {data.platform_recall.map((p) => {
              const pct = p.value ?? 0;
              const deltaText = formatDelta(p.delta);
              return (
                <div className="platform-row" key={p.name}>
                  <div className="pname">{p.name}</div>
                  <div className="pbar">
                    <i style={{ width: `${(pct / platformMax) * 100}%` }} />
                  </div>
                  <div className="pval">
                    {p.lowest && <span className="lowest">Lowest</span>}
                    <span>
                      {formatPct(p.value)}
                      {deltaText ? ` (${deltaText} pp)` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="deferred-note">
        <b>More of this brief is on the way.</b> Narrative clusters, competitive
        landscape, source mix, and evidence quotes are being ported next — along
        with the in-page refresh action. The data for all of them is already
        served by the same backend endpoint.
      </div>
    </>
  );
}
