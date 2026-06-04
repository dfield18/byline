"use client";

import { useState } from "react";
import type { PromptPreviewModelResult, PromptPreviewResult } from "@/lib/api";
import { previewPromptAction } from "./preview-actions";

const MODELS = [
  { slug: "chatgpt", name: "ChatGPT" },
  { slug: "gemini", name: "Gemini" },
  { slug: "claude", name: "Claude" },
  { slug: "perplexity", name: "Perplexity" },
] as const;

function sentimentTone(v: number): { cls: string; word: string } {
  if (v > 0.1) return { cls: "pos", word: "Positive" };
  if (v < -0.1) return { cls: "neg", word: "Negative" };
  return { cls: "neu", word: "Neutral" };
}

function formatSent(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
}

function ResultCard({ r }: { r: PromptPreviewModelResult }) {
  const name = MODELS.find((m) => m.slug === r.model)?.name ?? r.model;
  const tone = r.sentiment !== null ? sentimentTone(r.sentiment) : null;
  return (
    <div className="pp-result">
      <div className="pp-result-head">
        <span className="pp-result-name">{name}</span>
        {r.grounded && <span className="pp-tag">grounded</span>}
        {tone && (
          <span className={`tone-pill ${tone.cls}`}>
            {tone.word} {formatSent(r.sentiment as number)}
          </span>
        )}
        {r.subject_mentioned === true && (
          <span className="pstat yes">
            Mentioned{r.mention_rank ? ` #${r.mention_rank}` : ""}
          </span>
        )}
        {r.subject_mentioned === false && (
          <span className="pstat miss">Not mentioned</span>
        )}
      </div>
      {r.error ? (
        <p className="pp-result-error">{r.error}</p>
      ) : (
        <p className="pp-result-text">{r.response}</p>
      )}
    </div>
  );
}

export function PromptPreviewPanel({ subject }: { subject: string }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["chatgpt", "gemini"]),
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PromptPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const canRun = text.trim().length >= 10 && selected.size > 0 && !pending;

  async function onPreview() {
    setError(null);
    setResult(null);
    setPending(true);
    const res = await previewPromptAction(
      text,
      MODELS.filter((m) => selected.has(m.slug)).map((m) => m.slug),
      subject,
    );
    setPending(false);
    if (res.ok) setResult(res.data);
    else setError(res.error);
  }

  return (
    <div className="pp-panel">
      <div className="pp-head">
        <div className="pp-title">Try a prompt</div>
        <div className="pp-sub">
          Run an ad-hoc prompt about <b>{subject}</b> across the models and see
          how each one answers, scored the same way as a tracked refresh.
          Nothing is saved.
        </div>
      </div>

      <textarea
        className="pp-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`e.g. How do experts describe ${subject}'s record?`}
        rows={3}
      />

      <div className="pp-models">
        {MODELS.map((m) => (
          <label
            key={m.slug}
            className={`pp-model${selected.has(m.slug) ? " on" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.has(m.slug)}
              onChange={() => toggle(m.slug)}
            />
            {m.name}
          </label>
        ))}
      </div>

      <div className="pp-actions">
        <button
          type="button"
          className="dash-btn dash-btn-accent"
          disabled={!canRun}
          onClick={onPreview}
        >
          {pending ? "Running…" : "Preview"}
        </button>
        {pending && (
          <span className="pp-hint">
            Querying {selected.size} model{selected.size === 1 ? "" : "s"} live —
            this can take up to a minute.
          </span>
        )}
      </div>

      {error && <div className="pp-error">{error}</div>}

      {result && (
        <div className="pp-results">
          {result.results.map((r) => (
            <ResultCard key={r.model} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
