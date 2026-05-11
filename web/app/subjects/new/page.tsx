import Link from "next/link";
import { createSubjectAction } from "./actions";

/**
 * Subject creation form.
 *
 * v0 scope: a small set of category-agnostic fields (name + category)
 * plus a Person-specific block (since person is the most common
 * category in the corpus today). When the user picks Organization,
 * Issue, Policy, or Event, the Person fields become irrelevant and
 * are simply ignored by the API.
 *
 * Future: render category-specific field sets dynamically by calling
 * a `GET /api/categories/{slug}/setup-inputs` endpoint that returns the
 * setup_inputs schema from the YAML. For now, this is a single hand-
 * coded form covering the most common case.
 */
export default function NewSubjectPage() {
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
            Create a subject to track. The subject is scoped to your organization.
            After creation, run a refresh from the CLI (UI trigger coming soon)
            to populate findings.
          </p>
        </header>

        <form action={createSubjectAction} className="space-y-6">
          {/* Required across all categories */}
          <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Subject identity
            </legend>

            <Field
              label="Name"
              name="name"
              required
              helper="As it should appear in prompts (e.g., 'Marco Rubio', 'Heritage Foundation', 'the November 2023 firing of Sam Altman')"
            />

            <SelectField
              label="Category"
              name="category"
              required
              options={[
                { value: "", label: "Pick one…" },
                { value: "person", label: "Person (politician / public figure)" },
                { value: "organization", label: "Organization (think tank / company / group)" },
                { value: "issue", label: "Issue (contested topic)" },
                { value: "policy", label: "Policy (legislation / regulation)" },
                { value: "event", label: "Event (specific moment)" },
              ]}
              helper="Drives which prompt set will run on this subject"
            />
          </fieldset>

          {/* Person-specific (most common case) */}
          <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Person-specific fields
              <span className="ml-2 font-normal text-zinc-500">(ignored for non-Person categories)</span>
            </legend>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Role" name="si__role" helper="e.g., 'US Senator from Vermont'" />
              <Field label="Role category" name="si__role_category" helper="e.g., 'senators', 'governors'" />
              <Field label="Primary domain" name="si__primary_domain" helper="e.g., 'progressive economic policy'" />
              <Field label="Audience" name="si__audience" helper="e.g., 'the political left'" />
              <Field label="Contextual domain" name="si__contextual_domain" helper="e.g., 'progressive politicians in the US Senate'" />
              <Field label="Adjacent position" name="si__adjacent_position" helper="e.g., 'corporate influence in American politics'" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Pronoun (subject)" name="si__pronoun_subject" helper="he / she / they" />
              <Field label="Pronoun (be-verb)" name="si__pronoun_be" helper="is / are" />
              <Field label="Pronoun (possessive)" name="si__pronoun_possessive" helper="his / her / their" />
            </div>

            <SelectField
              label="2028 presidential candidate"
              name="si__presidential_candidate_2028"
              options={[
                { value: "false", label: "No" },
                { value: "true", label: "Yes" },
              ]}
            />
          </fieldset>

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Create subject
            </button>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Required fields for non-Person categories (organization /
            issue / policy / event) aren't surfaced yet in this form —
            the API accepts the create call but the next refresh will
            prompt for missing required setup_inputs via the CLI fallback.
            Category-specific forms are on the roadmap.
          </p>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  helper,
  required = false,
}: {
  label: string;
  name: string;
  helper?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        required={required}
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {helper && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{helper}</p>
      )}
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  helper,
  required = false,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  helper?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {helper && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{helper}</p>
      )}
    </div>
  );
}
