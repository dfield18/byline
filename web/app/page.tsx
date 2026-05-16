import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listSubjects, type Subject } from "@/lib/api";
import { LandingPage } from "@/components/landing/LandingPage";

const CATEGORY_LABEL: Record<Subject["category"], string> = {
  person: "Person",
  organization: "Organization",
  issue: "Issue",
  policy: "Policy",
  event: "Event",
};

const CATEGORY_BADGE: Record<Subject["category"], string> = {
  person: "bg-blue-100 text-blue-800",
  organization: "bg-purple-100 text-purple-800",
  issue: "bg-amber-100 text-amber-800",
  policy: "bg-emerald-100 text-emerald-800",
  event: "bg-rose-100 text-rose-800",
};

export default async function Home() {
  // Public marketing landing for signed-out visitors; authed subjects
  // dashboard for signed-in users. Proxy makes `/` public so this page
  // is reachable without a session.
  const { userId } = await auth();
  if (!userId) {
    return <LandingPage />;
  }

  const subjects = await listSubjects();

  // Empty-state on a fresh org — direct the user straight to subject creation
  // rather than showing an empty table with no path forward.
  if (subjects.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            byline
          </h1>
          <p className="mt-3 max-w-lg text-zinc-600 dark:text-zinc-400">
            No subjects yet for your organization. Create one to start tracking
            how AI search engines characterize them.
          </p>
          <Link
            href="/subjects/new"
            className="mt-6 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + Create your first subject
          </Link>
        </main>
      </div>
    );
  }

  const totalRefreshes = subjects.reduce((s, x) => s + x.n_refreshes, 0);
  const totalFindings = subjects.reduce((s, x) => s + x.n_findings, 0);
  const categoryCount = new Set(subjects.map((s) => s.category)).size;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              byline
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              AI search visibility for political &amp; public-affairs subjects.
            </p>
          </div>
          <Link
            href="/subjects/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + New subject
          </Link>
        </header>

        {/* Headline metrics */}
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Subjects" value={subjects.length} />
          <Metric label="Refreshes" value={totalRefreshes} />
          <Metric label="Findings" value={totalFindings} />
          <Metric label="Categories" value={categoryCount} />
        </div>

        {/* Subjects table */}
        <section>
          <h2 className="mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Subjects
          </h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Refreshes</th>
                  <th className="px-4 py-3 text-right">Findings</th>
                  <th className="px-4 py-3">Last refreshed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {subjects.map((s) => (
                  <tr
                    key={s.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      <Link href={`/subjects/${s.id}`} className="hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${CATEGORY_BADGE[s.category]}`}
                      >
                        {CATEGORY_LABEL[s.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                      {s.n_refreshes}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                      {s.n_findings}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                      {s.latest_refresh_at
                        ? new Date(s.latest_refresh_at).toLocaleString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "UTC",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}
