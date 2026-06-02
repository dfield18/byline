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
  // Pre-fetch every category's schema server-side so the client form can
  // render the right fields instantly on category change — no extra
  // round trip, no loading state. The (dashboard) layout already wraps
  // this in the sidebar/header chrome, so the page only renders content.
  const schemas: Record<string, SetupInputsSchema> = {};
  await Promise.all(
    CATEGORIES.map(async (c) => {
      schemas[c.value] = await getSetupInputsSchema(c.value);
    }),
  );

  return (
    <>
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

      <div className="page-head">
        <div>
          <h1>New subject</h1>
          <p>
            Create a subject to track. It&apos;s scoped to your workspace. The
            fields shown change with the category — each one comes from that
            category&apos;s prompts schema.
          </p>
        </div>
      </div>

      <NewSubjectForm categories={[...CATEGORIES]} schemas={schemas} />
    </>
  );
}
