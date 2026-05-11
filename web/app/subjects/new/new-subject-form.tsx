"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SetupInput, SetupInputsSchema } from "@/lib/api";
import { createSubjectAction } from "./actions";

type CategoryOption = { readonly value: string; readonly label: string };

export function NewSubjectForm({
  categories,
  schemas,
}: {
  categories: CategoryOption[];
  schemas: Record<string, SetupInputsSchema>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputs: SetupInput[] = useMemo(() => {
    if (!category) return [];
    // 'name' is collected by the top-level Name field. Don't render it
    // twice inside the category fields.
    return (schemas[category]?.setup_inputs ?? []).filter(
      (si) => si.key !== "name"
    );
  }, [category, schemas]);

  function updateValue(key: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!category) {
      setError("Pick a category");
      return;
    }
    const missing = inputs
      .filter((si) => si.required)
      .filter((si) => {
        const v = values[si.key];
        if (si.type === "boolean") return typeof v !== "boolean";
        return !v || (typeof v === "string" && !v.trim());
      });
    if (missing.length > 0) {
      setError(
        `Missing required field${missing.length === 1 ? "" : "s"}: ${missing
          .map((m) => m.label)
          .join(", ")}`
      );
      return;
    }

    const setup_inputs: Record<string, unknown> = { name: name.trim() };
    for (const si of inputs) {
      const v = values[si.key];
      if (si.type === "boolean") {
        setup_inputs[si.key] = v === true;
      } else if (typeof v === "string" && v.trim()) {
        setup_inputs[si.key] = v.trim();
      }
    }

    setSubmitting(true);
    const res = await createSubjectAction({
      name: name.trim(),
      category,
      setup_inputs,
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/subjects/${res.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Subject identity
        </legend>

        <TextField
          label="Name"
          required
          value={name}
          onChange={setName}
          helper="As it should appear in prompts (e.g., 'Marco Rubio', 'Heritage Foundation', 'the November 2023 firing of Sam Altman')"
        />

        <SelectField
          label="Category"
          required
          value={category}
          onChange={(v) => {
            setCategory(v);
            setValues({}); // clear per-category values when category changes
          }}
          options={[
            { value: "", label: "Pick one…" },
            ...categories.map((c) => ({ value: c.value, label: c.label })),
          ]}
          helper="Drives which prompt set will run on this subject"
        />
      </fieldset>

      {category && (
        <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <legend className="px-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {categories.find((c) => c.value === category)?.label} fields
          </legend>

          {inputs.map((si) => {
            const v = values[si.key];
            if (si.type === "boolean") {
              return (
                <SelectField
                  key={si.key}
                  label={si.label}
                  required={si.required}
                  helper={si.description ?? undefined}
                  value={v === true ? "true" : v === false ? "false" : ""}
                  onChange={(val) =>
                    updateValue(si.key, val === "true" ? true : val === "false" ? false : "")
                  }
                  options={[
                    { value: "", label: "Pick one…" },
                    { value: "true", label: "Yes" },
                    { value: "false", label: "No" },
                  ]}
                />
              );
            }
            return (
              <TextField
                key={si.key}
                label={si.label}
                required={si.required}
                helper={si.description ?? undefined}
                placeholder={si.example ?? undefined}
                value={typeof v === "string" ? v : ""}
                onChange={(val) => updateValue(si.key, val)}
              />
            );
          })}
        </fieldset>
      )}

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "Creating…" : "Create subject"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  helper,
  required = false,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <input
        type="text"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  options,
  helper,
  required = false,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  helper?: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <select
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
