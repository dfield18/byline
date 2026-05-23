"use client";

/**
 * Sortable prompts table with CSV + PNG export. Pure client
 * component — sort state and export handlers live here so the page
 * shell stays a server component.
 *
 * Source data: SubjectOverview.per_prompt_coverage rows (already
 * scoped by the parent page's global topic/platform filters).
 * Metrics are derived from `platform_results` since the payload
 * doesn't carry pre-aggregated per-prompt sentiment / first-mention
 * yet — those columns can be added when the backend extends the
 * aggregator.
 */
import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Download,
  Image as ImageIcon,
} from "lucide-react";

import { Card } from "@/components/dashboard/ui";
// Type-only imports — SWC strips these at build time so the
// server-only @clerk/nextjs/server chain in lib/api.ts doesn't get
// pulled into the client bundle. Value calls (response fetching)
// go through the same-origin Next route proxy below instead.
import type { PromptResponse, SubjectOverview } from "@/lib/api";

type PromptRow = SubjectOverview["per_prompt_coverage"][number];

type DerivedRow = {
  prompt_id: number;
  prompt_text: string;
  topic: string;
  topic_label_raw: string | null;
  platforms_tested: { slug: string; name: string; present: boolean; mentioned: boolean | null; rank: number | null }[];
  responses: number;
  mentioned_count: number;
  mention_rate: number | null;
  avg_position: number | null;
  // First-Mention Rate — % of responses where subject was ranked #1.
  // Matches the existing top_result_rate methodology elsewhere in
  // the API: rank-1 count / total responses tested, not / mentioned
  // count, so values are directly comparable to Mention Rate.
  first_mention_rate: number | null;
  // Best Rank — minimum rank achieved across platforms where the
  // subject was actually mentioned. Surfaces the prompt's peak
  // placement; lower is better. Null when subject wasn't mentioned
  // anywhere or no platform had a measured rank.
  best_rank: number | null;
  // Rank Spread — max − min rank across mentioned platforms. 0 =
  // same rank everywhere; high = AI platforms disagree on
  // placement. Null when fewer than two ranked platforms.
  rank_spread: number | null;
};

type SortKey =
  | "prompt"
  | "topic"
  | "responses"
  | "mentioned"
  | "mention_rate"
  | "avg_position"
  | "first_mention_rate"
  | "best_rank"
  | "rank_spread";

type SortDir = "asc" | "desc";

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmtPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtRank(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(1);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// CSV escaping per RFC 4180 — wrap any field containing comma /
// quote / newline in double quotes; double up embedded quotes.
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so Safari can still resolve the URL during
  // its own click dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Module-level so React doesn't tear down + remount the component on
// every parent render (React Compiler / react-hooks/static-components
// requires this — components defined inside another component reset
// their state each render). Receives the parent's sort state via
// props so the icon + active styling stay in sync.
function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = active
    ? activeDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${
        align === "right" ? "justify-end" : ""
      } ${active ? "text-foreground" : "text-foreground/65 hover:text-foreground"}`}
    >
      <span>{label}</span>
      <Icon
        className={`h-3 w-3 ${active ? "opacity-100" : "opacity-50"}`}
        aria-hidden
      />
    </button>
  );
}

// Parse markdown-style inline links — [text](url) — into React nodes
// so AI response citations like "([washingtonpost.com](https://…))"
// render as clickable text instead of raw markdown markup. The
// surrounding text + newlines are preserved verbatim (the parent
// keeps `whitespace-pre-wrap` so line breaks stay intact). Only
// handles the explicit markdown form; bare URLs in plain text are
// left as-is to avoid false positives.
function renderResponseText(text: string): React.ReactNode[] {
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const linkText = match[1];
    const url = match[2];
    parts.push(
      <a
        key={`l${parts.length}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm"
      >
        {linkText}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

// Renders the per-platform response panel under an expanded prompt
// row. Lives at module scope (same React-Compiler reason as
// SortHeader). Handles three states: undefined (collapsed, not yet
// requested), loading, ready (with the response list), and error.
// Each response card shows the model name + a mention badge + the
// full response text in a constrained scroll area.
// Number of characters shown in the per-platform preview before the
// reader has to click "Show full response" on that card. Long
// enough to convey the response's framing without making the panel
// scroll-heavy; short enough that the table stays scannable when
// multiple prompts are open at once.
const RESPONSE_PREVIEW_CHARS = 280;

function PromptResponsesPanel({
  state,
  platforms,
}: {
  state: ResponsesState | undefined;
  // Used as a fallback ordering / completeness hint when the
  // /responses endpoint returns fewer entries than the row's
  // platforms_tested set (e.g. some platforms had no run).
  platforms: PromptRow["platform_results"];
}) {
  // Per-platform expanded state, keyed by platform_slug. Resets
  // when this panel unmounts (i.e. when the parent prompt row is
  // collapsed) — acceptable trade-off for keeping state local
  // rather than threading it through to the table-level cache.
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(
    () => new Set(),
  );
  const togglePlatform = useCallback((slug: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  if (state === undefined || state.status === "loading") {
    return (
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Responses
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
          Loading responses…
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-warning">
          Responses
        </div>
        <div className="mt-2 text-[12.5px] text-warning">
          {state.message}
        </div>
      </div>
    );
  }
  if (state.responses.length === 0) {
    return (
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
          Responses
        </div>
        <div className="mt-2 text-[12.5px] text-muted-foreground">
          No responses captured for this prompt on the latest
          refresh.
        </div>
      </div>
    );
  }
  // Order responses by the same platform order the chip strip uses
  // so the expanded view reads consistently with the row above.
  const platformOrder = platforms.map((p) => p.slug);
  const ordered = [...state.responses].sort((a, b) => {
    const ai = platformOrder.indexOf(a.platform_slug);
    const bi = platformOrder.indexOf(b.platform_slug);
    if (ai === -1 && bi === -1) {
      return a.platform_slug.localeCompare(b.platform_slug);
    }
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
        Responses
      </div>
      <ul className="mt-3 space-y-3">
        {ordered.map((resp) => {
          const tone =
            resp.mentioned === true
              ? "bg-primary/15 text-primary"
              : resp.mentioned === false
                ? "bg-muted/60 text-foreground/70"
                : "bg-muted/40 text-foreground/55";
          const badge =
            resp.mentioned === true
              ? resp.rank !== null
                ? `Mentioned · rank ${resp.rank}`
                : "Mentioned"
              : resp.mentioned === false
                ? "Not mentioned"
                : "No extraction";
          const isExpanded = expandedPlatforms.has(resp.platform_slug);
          const hasContent = resp.success && !!resp.response_text;
          const text = resp.response_text || "";
          const isTruncated = text.length > RESPONSE_PREVIEW_CHARS;
          const previewText = isTruncated
            ? text.slice(0, RESPONSE_PREVIEW_CHARS).trimEnd() + "…"
            : text;
          return (
            <li
              key={resp.platform_slug}
              className="rounded-lg border border-border/60 bg-background/60 p-4"
            >
              {/* Header row — clickable when there's content to
                  expand. Clicking the card header (platform name +
                  badge) toggles the preview ↔ full-response view.
                  Plain non-clickable div when there's no content to
                  show (failed response or empty text), so the card
                  still renders cleanly. */}
              {hasContent ? (
                <button
                  type="button"
                  onClick={() => togglePlatform(resp.platform_slug)}
                  aria-expanded={isExpanded}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-foreground/55 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    <span className="text-[13px] font-semibold text-foreground">
                      {resp.platform_name}
                    </span>
                    {isTruncated && (
                      <span className="text-[10.5px] uppercase tracking-[0.06em] text-foreground/45">
                        {isExpanded ? "Hide full" : "Show full"}
                      </span>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] tabular-nums ${tone}`}
                  >
                    {badge}
                  </span>
                </button>
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="text-[13px] font-semibold text-foreground">
                    {resp.platform_name}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] tabular-nums ${tone}`}
                  >
                    {badge}
                  </span>
                </div>
              )}
              {!hasContent ? (
                <div className="mt-2 text-[12.5px] text-muted-foreground">
                  {resp.success
                    ? "Response was empty."
                    : "Response failed to generate."}
                </div>
              ) : isExpanded ? (
                // Full-response view — scrollable card with the
                // complete text. Focusable so keyboard users can
                // scroll long responses with arrow keys.
                <div
                  className="mt-2 max-h-[420px] overflow-y-auto rounded-md border border-border/40 bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]"
                  tabIndex={0}
                >
                  {renderResponseText(text)}
                </div>
              ) : (
                // Preview view — first RESPONSE_PREVIEW_CHARS of
                // the response text + "…" when truncated. Reader
                // gets a sense of the response's framing without
                // committing to the full text; click the header to
                // expand to the scrollable full view.
                <div className="mt-2 text-[13px] leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
                  {renderResponseText(previewText)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function deriveRow(p: PromptRow): DerivedRow {
  const tested = p.platform_results.filter((pr) => pr.present);
  const mentioned = tested.filter((pr) => pr.mentioned === true);
  const ranks = mentioned
    .map((pr) => pr.rank)
    .filter((r): r is number => r !== null && Number.isFinite(r));
  const rank1Count = mentioned.filter((pr) => pr.rank === 1).length;
  return {
    prompt_id: p.prompt_id,
    prompt_text: p.rendered || p.template || "(no text)",
    topic: p.topic_label ? capitalizeFirst(p.topic_label) : "—",
    topic_label_raw: p.topic_label,
    platforms_tested: p.platform_results,
    responses: tested.length,
    mentioned_count: mentioned.length,
    mention_rate:
      tested.length > 0 ? mentioned.length / tested.length : null,
    avg_position:
      ranks.length > 0
        ? ranks.reduce((s, r) => s + r, 0) / ranks.length
        : null,
    first_mention_rate:
      tested.length > 0 ? rank1Count / tested.length : null,
    best_rank: ranks.length > 0 ? Math.min(...ranks) : null,
    rank_spread:
      ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : null,
  };
}

type ResponsesState =
  | { status: "loading" }
  | { status: "ready"; responses: PromptResponse[] }
  | { status: "error"; message: string };

export function PromptsTable({
  rows,
  subjectId,
  subjectName,
  platformSlugFilter,
}: {
  rows: PromptRow[];
  // Subject ID for the lazy-fetch endpoint when a prompt is expanded.
  subjectId: number;
  subjectName: string;
  // Active platform filter slug (passed through so the platform
  // chip strip can dim non-matching platforms when a scope is set,
  // even though row inclusion is decided server-side).
  platformSlugFilter: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("mention_rate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"png" | null>(null);
  // Per-prompt expanded state keyed by prompt_id. Set instead of
  // single id so multiple rows can be open at once — comparing two
  // prompts side-by-side is a common read.
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(),
  );
  // Cached responses per prompt_id. Keyed lookup so subsequent
  // expands of the same row are instant (no re-fetch). Survives
  // collapse-then-re-expand within the session.
  const [responsesByPrompt, setResponsesByPrompt] = useState<
    Record<number, ResponsesState>
  >({});

  const ensureResponsesLoaded = useCallback(
    (promptId: number) => {
      setResponsesByPrompt((prev) => {
        if (prev[promptId]) return prev;
        return { ...prev, [promptId]: { status: "loading" } };
      });
      // Defer the fetch to a microtask so the loading state lands
      // first and the row re-renders with the spinner before the
      // network request blocks the React commit. Hits the
      // same-origin Next.js proxy at /api/subjects/.../responses
      // (defined in app/api/subjects/[id]/prompts/[promptId]/
      // responses/route.ts), which calls the server-only fetcher
      // in lib/api.ts. Direct lib/api.ts import would pull
      // @clerk/nextjs/server into the client bundle.
      void (async () => {
        try {
          const res = await fetch(
            `/api/subjects/${subjectId}/prompts/${promptId}/responses`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            const body = await res.text();
            throw new Error(
              `HTTP ${res.status}: ${body.slice(0, 200)}`,
            );
          }
          const data = (await res.json()) as {
            responses: PromptResponse[];
          };
          setResponsesByPrompt((prev) => ({
            ...prev,
            [promptId]: {
              status: "ready",
              responses: data.responses,
            },
          }));
        } catch (e) {
          setResponsesByPrompt((prev) => ({
            ...prev,
            [promptId]: {
              status: "error",
              message:
                e instanceof Error
                  ? e.message
                  : "Failed to load responses",
            },
          }));
        }
      })();
    },
    [subjectId],
  );

  const toggleExpanded = useCallback(
    (id: number) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
          // Kick off the fetch on first expand; the cache check
          // inside ensureResponsesLoaded makes re-expand instant.
          ensureResponsesLoaded(id);
        }
        return next;
      });
    },
    [ensureResponsesLoaded],
  );

  const derived = useMemo(() => rows.map(deriveRow), [rows]);

  const sorted = useMemo(() => {
    const arr = [...derived];
    const cmp = (a: DerivedRow, b: DerivedRow): number => {
      const dir = sortDir === "asc" ? 1 : -1;
      // Helper to push nulls to the bottom regardless of sort dir.
      const nullCmp = (
        x: number | null,
        y: number | null,
      ): number | null => {
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return null;
      };
      switch (sortKey) {
        case "prompt":
          return dir * a.prompt_text.localeCompare(b.prompt_text);
        case "topic":
          return dir * a.topic.localeCompare(b.topic);
        case "responses":
          return dir * (a.responses - b.responses);
        case "mentioned":
          return dir * (a.mentioned_count - b.mentioned_count);
        case "mention_rate": {
          const n = nullCmp(a.mention_rate, b.mention_rate);
          if (n !== null) return n;
          return dir * ((a.mention_rate ?? 0) - (b.mention_rate ?? 0));
        }
        case "avg_position": {
          const n = nullCmp(a.avg_position, b.avg_position);
          if (n !== null) return n;
          // Lower position is "better" → for desc sort the lowest
          // value should come first. Multiply by -dir so the
          // visual default (clicking once = "best first") matches
          // reader expectations.
          return -dir * ((a.avg_position ?? 0) - (b.avg_position ?? 0));
        }
        case "first_mention_rate": {
          const n = nullCmp(a.first_mention_rate, b.first_mention_rate);
          if (n !== null) return n;
          return (
            dir *
            ((a.first_mention_rate ?? 0) - (b.first_mention_rate ?? 0))
          );
        }
        case "best_rank": {
          const n = nullCmp(a.best_rank, b.best_rank);
          if (n !== null) return n;
          // Best Rank uses the same lower-is-better polarity as
          // avg_position, so flip the dir sign to match.
          return -dir * ((a.best_rank ?? 0) - (b.best_rank ?? 0));
        }
        case "rank_spread": {
          const n = nullCmp(a.rank_spread, b.rank_spread);
          if (n !== null) return n;
          // Lower spread is "better" (more consistent placement),
          // so flip the dir sign.
          return -dir * ((a.rank_spread ?? 0) - (b.rank_spread ?? 0));
        }
      }
    };
    arr.sort(cmp);
    return arr;
  }, [derived, sortKey, sortDir]);

  const onSort = useCallback(
    (key: SortKey) => {
      setSortKey((prev) => {
        if (prev === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return prev;
        }
        // Sensible default direction per column type — text asc,
        // numeric desc, position/spread asc (lower = better).
        setSortDir(
          key === "prompt" ||
          key === "topic" ||
          key === "avg_position" ||
          key === "best_rank" ||
          key === "rank_spread"
            ? "asc"
            : "desc",
        );
        return key;
      });
    },
    [],
  );

  const onExportCsv = useCallback(() => {
    const header = [
      "Prompt",
      "Topic",
      "Platforms tested",
      "Responses",
      "Mentioned",
      "Mention rate",
      "First-mention rate",
      "Avg position",
      "Best rank",
      "Rank spread",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const r of sorted) {
      const platforms = r.platforms_tested
        .filter((p) => p.present)
        .map((p) => p.name)
        .join("; ");
      lines.push(
        [
          r.prompt_text,
          r.topic,
          platforms,
          String(r.responses),
          String(r.mentioned_count),
          r.mention_rate === null
            ? ""
            : (Math.round(r.mention_rate * 1000) / 10).toFixed(1) + "%",
          r.first_mention_rate === null
            ? ""
            : (Math.round(r.first_mention_rate * 1000) / 10).toFixed(
                1,
              ) + "%",
          r.avg_position === null ? "" : r.avg_position.toFixed(2),
          r.best_rank === null ? "" : String(r.best_rank),
          r.rank_spread === null ? "" : String(r.rank_spread),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const csv = "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const slug = subjectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    downloadBlob(blob, `${slug}-prompts-${todayIso()}.csv`);
  }, [sorted, subjectName]);

  const onExportPng = useCallback(async () => {
    if (!cardRef.current) return;
    setExporting("png");
    try {
      // Dynamic import — keeps the html-to-image dep out of the
      // initial JS bundle for the (more common) read-only page
      // visit. The library is only fetched when the user actually
      // clicks Save PNG.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        cacheBust: true,
      });
      const slug = subjectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const link = document.createElement("a");
      link.download = `${slug}-prompts-${todayIso()}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(null);
    }
  }, [subjectName]);

  return (
    <Card className="p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="text-[12.5px] text-muted-foreground">
          {sorted.length}{" "}
          {sorted.length === 1 ? "prompt" : "prompts"} in the active
          scope
          <span className="ml-2 text-foreground/50">
            · Click any row to see the full prompt response.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/85 hover:bg-accent/40 transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onExportPng}
            disabled={exporting === "png"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-1.5 text-[12px] font-medium text-foreground/85 hover:bg-accent/40 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            {exporting === "png" ? "Exporting…" : "Export PNG"}
          </button>
        </div>
      </div>

      {/* The cardRef wraps just the table so the PNG snapshot
          doesn't include the export buttons themselves. */}
      <div ref={cardRef} className="bg-card">
        {sorted.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted-foreground">
            No prompts match the active filter scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/60">
                  {/* Empty header cell for the chevron toggle column.
                      Same width as the chevron button itself so the
                      column stays narrow. */}
                  <th className="w-6 py-3" aria-hidden />
                  <th className="py-3 pr-4">
                    <SortHeader
                      label="Prompt"
                      sortKey="prompt"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                    />
                  </th>
                  <th className="py-3 px-3">
                    <SortHeader
                      label="Topic"
                      sortKey="topic"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                    />
                  </th>
                  <th className="py-3 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/65">
                      Platforms
                    </span>
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Responses"
                      sortKey="responses"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Mentioned"
                      sortKey="mentioned"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Mention Rate"
                      sortKey="mention_rate"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="First-Mention Rate"
                      sortKey="first_mention_rate"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Avg Position"
                      sortKey="avg_position"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Best Rank"
                      sortKey="best_rank"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                  <th className="py-3 pl-3 text-right whitespace-nowrap">
                    <SortHeader
                      label="Rank Spread"
                      sortKey="rank_spread"
                      activeKey={sortKey}
                      activeDir={sortDir}
                      onSort={onSort}
                      align="right"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const isOpen = expanded.has(r.prompt_id);
                  return (
                  <Fragment key={r.prompt_id}>
                  <tr
                    className={`border-b border-border/30 last:border-0 text-[13.5px] cursor-pointer hover:bg-accent/30 transition-colors ${isOpen ? "bg-accent/20" : ""}`}
                    onClick={() => toggleExpanded(r.prompt_id)}
                  >
                    <td className="py-3.5 pl-1 pr-1 align-top">
                      <button
                        type="button"
                        // Stop propagation so the row's own onClick
                        // doesn't fire twice when the button is hit
                        // directly.
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(r.prompt_id);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-foreground/55 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-label={isOpen ? "Collapse prompt details" : "Expand prompt details"}
                        aria-expanded={isOpen}
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </td>
                    <td className="py-3.5 pr-4 max-w-[420px] align-top">
                      <span
                        className="line-clamp-2 text-foreground/90 [overflow-wrap:anywhere]"
                        title={r.prompt_text}
                      >
                        {r.prompt_text}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 align-top text-foreground/80">
                      {r.topic}
                    </td>
                    <td className="py-3.5 px-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {r.platforms_tested.map((p) => {
                          const dim =
                            !p.present ||
                            (platformSlugFilter !== "" &&
                              p.slug !== platformSlugFilter);
                          return (
                            <span
                              key={p.slug}
                              className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium tabular-nums ${
                                p.present && p.mentioned
                                  ? "bg-primary/15 text-primary"
                                  : p.present
                                    ? "bg-muted/60 text-foreground/70"
                                    : "bg-muted/30 text-foreground/40"
                              } ${dim && p.present ? "opacity-50" : ""}`}
                              title={
                                p.present
                                  ? p.mentioned === true
                                    ? `${p.name} — mentioned${p.rank !== null ? ` (rank ${p.rank})` : ""}`
                                    : p.mentioned === false
                                      ? `${p.name} — not mentioned`
                                      : `${p.name} — no extraction`
                                  : `${p.name} — not run on this prompt`
                              }
                            >
                              {p.name}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums text-foreground/85">
                      {r.responses}
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums text-foreground/85">
                      {r.mentioned_count}
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums font-semibold text-foreground">
                      {fmtPct(r.mention_rate)}
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums text-foreground/85">
                      {fmtPct(r.first_mention_rate)}
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums text-foreground/85">
                      {fmtRank(r.avg_position)}
                    </td>
                    <td className="py-3.5 px-3 align-top text-right tabular-nums text-foreground/85">
                      {r.best_rank === null ? "—" : r.best_rank}
                    </td>
                    <td className="py-3.5 pl-3 align-top text-right tabular-nums text-foreground/85">
                      {r.rank_spread === null ? "—" : r.rank_spread}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-accent/10 border-b border-border/30 last:border-0">
                      <td className="px-0 pb-5 pt-1" />
                      <td
                        colSpan={10}
                        className="px-3 pb-5 pt-1"
                      >
                        <div className="space-y-5">
                          <div>
                            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/55">
                              Full prompt
                            </div>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
                              {r.prompt_text}
                            </p>
                          </div>
                          <PromptResponsesPanel
                            state={responsesByPrompt[r.prompt_id]}
                            platforms={r.platforms_tested}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
