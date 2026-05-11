import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubject } from "@/lib/api";
import { RefreshButton } from "./refresh-button";

type Params = { id: string };

export default async function SubjectPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const subjectId = Number.parseInt(id, 10);
  if (Number.isNaN(subjectId)) notFound();

  let subject;
  try {
    subject = await getSubject(subjectId);
  } catch (e) {
    if (e instanceof Error && e.message.includes("404")) notFound();
    throw e;
  }

  const si = subject.setup_inputs ?? {};
  const detailFields: [string, string][] = [
    ["Category", subject.category],
    ["Role / type", String(si.role ?? si.type ?? si.date_or_period ?? "—")],
    [
      "Primary domain",
      String(si.primary_domain ?? si.domain ?? "—"),
    ],
    [
      "Contextual domain",
      String(si.contextual_domain ?? "—"),
    ],
    ["Canonical URL", String(si.canonical_url ?? "—")],
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← All subjects
        </Link>

        <header className="mt-4 mb-8 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {subject.name}
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              {subject.n_refreshes} refresh{subject.n_refreshes === 1 ? "" : "es"} ·{" "}
              {subject.n_findings} findings · created{" "}
              {new Date(subject.created_at).toLocaleDateString()}
            </p>
          </div>
          <RefreshButton subjectId={subject.id} />
        </header>

        {/* Setup inputs */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Profile
          </h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {detailFields.map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <dt className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Refresh history */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Refresh history
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Responses</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {subject.refreshes.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {r.id}
                    </td>
                    <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          r.status === "completed"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {r.n_ok}/{r.n_responses}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      ${Number(r.cost_usd).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Drill-down into per-refresh findings will land here next. For now,
            see the internal Streamlit dashboard for full details.
          </p>
        </section>
      </main>
    </div>
  );
}
