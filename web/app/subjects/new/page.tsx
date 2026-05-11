import Link from "next/link";
import { getSetupInputsSchema, type SetupInputsSchema } from "@/lib/api";
import { NewSubjectForm } from "./new-subject-form";

const CATEGORIES = [
  { value: "person", label: "Person (politician / public figure)" },
  { value: "organization", label: "Organization (think tank / company / group)" },
  { value: "issue", label: "Issue (contested topic)" },
  { value: "policy", label: "Policy (legislation / regulation)" },
  { value: "event", label: "Event (specific moment)" },
] as const;

export default async function NewSubjectPage() {
  // Pre-fetch every category's schema server-side so the client form
  // can render the right fields instantly on category change — no
  // extra round trip, no loading state.
  const schemas: Record<string, SetupInputsSchema> = {};
  await Promise.all(
    CATEGORIES.map(async (c) => {
      schemas[c.value] = await getSetupInputsSchema(c.value);
    })
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← All subjects
        </Link>

        <header className="mt-4 mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            New subject
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Create a subject to track. The subject is scoped to your
            organization. The fields shown change with the category —
            each one comes from that category&apos;s prompts YAML.
          </p>
        </header>

        <NewSubjectForm categories={[...CATEGORIES]} schemas={schemas} />
      </main>
    </div>
  );
}
