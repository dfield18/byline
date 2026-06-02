import Link from "next/link";
import { listSubjects, type Subject } from "@/lib/api";

const CATEGORY_LABEL: Record<Subject["category"], string> = {
  person: "Person",
  organization: "Organization",
  issue: "Issue",
  policy: "Policy",
  event: "Event",
};

// One badge class per category — defined in dashboard.css against the
// shared tokens. Keeps the colour vocabulary out of the markup.
const CATEGORY_CLASS: Record<Subject["category"], string> = {
  person: "cat-person",
  organization: "cat-organization",
  issue: "cat-issue",
  policy: "cat-policy",
  event: "cat-event",
};

// Locale + timeZone are pinned so the server and client render the exact
// same string — an unpinned toLocaleString() formats in the runtime's
// local zone and triggers a hydration mismatch. UTC matches how the
// backend stores refresh timestamps.
function formatRefreshedAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export default async function SubjectsPage() {
  // Auth is enforced by proxy.ts (everything except `/` requires a
  // session), so by the time this runs the visitor is signed in and the
  // backend scopes listSubjects() to their org.
  const subjects = await listSubjects();

  // Fresh org → skip the empty table and point straight at creation.
  if (subjects.length === 0) {
    return (
      <div className="empty">
        <div className="mark">B</div>
        <h1>No subjects yet</h1>
        <p>
          Start tracking how the major AI assistants describe the people and
          issues you represent. Create your first subject to run an initial
          refresh.
        </p>
        <Link href="/subjects/new" className="dash-btn dash-btn-accent">
          Create your first subject
        </Link>
      </div>
    );
  }

  const totalRefreshes = subjects.reduce((s, x) => s + x.n_refreshes, 0);
  const totalFindings = subjects.reduce((s, x) => s + x.n_findings, 0);
  const categoryCount = new Set(subjects.map((s) => s.category)).size;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Subjects</h1>
          <p>
            Everyone your workspace tracks across ChatGPT, Gemini, Claude, and
            Perplexity — and how their AI narrative is moving.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Subjects" value={subjects.length} />
        <Metric label="Refreshes" value={totalRefreshes} />
        <Metric label="Findings" value={totalFindings} />
        <Metric label="Categories" value={categoryCount} />
      </div>

      <div className="section-tag">All subjects</div>
      <div className="table-card">
        <table className="subj-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th className="num">Refreshes</th>
              <th className="num">Findings</th>
              <th>Last refreshed</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/subjects/${s.id}`} className="subj-name">
                    {s.name}
                  </Link>
                </td>
                <td>
                  <span className={`cat-badge ${CATEGORY_CLASS[s.category]}`}>
                    {CATEGORY_LABEL[s.category]}
                  </span>
                </td>
                <td className="num">{s.n_refreshes.toLocaleString("en-US")}</td>
                <td className="num">{s.n_findings.toLocaleString("en-US")}</td>
                <td className="muted">{formatRefreshedAt(s.latest_refresh_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="k">{label}</div>
      <div className="v">{value.toLocaleString("en-US")}</div>
    </div>
  );
}
