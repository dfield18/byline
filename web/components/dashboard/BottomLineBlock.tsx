// Shared "Bottom line" hero used by both the Overview Vitals card and
// the Visibility briefing. Extracted from app/subjects/[id]/page.tsx
// so the two spokes' top-of-page verdicts share identical typography
// (text-[16px] md:text-[17px] font-medium tracking-tight) and the
// same title/body split treatment. Before extraction, Visibility
// hand-rolled the hero at text-[15.5px] leading-relaxed and skipped
// the splitBottomLine helper entirely — two heroes, two recipes.
//
// Title/body split is driven by `splitBottomLine` below; the caller
// decides via `bodyTone` whether the body clause is a gap/contrast
// punchline (warning-toned left rule) or a neutral elaboration.

// Split a Bottom Line string into a bold title clause + a regular
// elaboration line so the rendered block can mirror the Strongest
// Asset takeaway's two-line hierarchy. Handles the three sentence
// shapes our bottom_line generators emit:
//   1. Em-dash separated:  "claim — supporting metric"
//      → title "claim", body "supporting metric"
//   2. Parenthetical:      "claim (supporting metric)."
//      → title "claim", body "supporting metric"
//   3. No separator:       "claim only."
//      → title is the whole string, no body
// Trailing period on the body is preserved; title gets no terminal
// punctuation to match Strongest Asset's title convention.
export function splitBottomLine(text: string): {
  title: string;
  body: string | null;
} {
  const trimmed = text.trim();
  // Em-dash split (covers buildGapBottomLine + _compute_bottom_line's
  // gap-only branch). Uses the actual em-dash char with optional
  // whitespace either side.
  const emDash = trimmed.match(/^(.+?)\s*—\s*(.+?)\.?\s*$/);
  if (emDash) {
    return { title: emDash[1].trim(), body: emDash[2].trim() + "." };
  }
  // Parenthetical split (covers _compute_bottom_line's strong-only
  // branch and most LLM-polished outputs that follow that template).
  const paren = trimmed.match(/^(.+?)\s*\((.+?)\)\.?\s*$/);
  if (paren) {
    return { title: paren[1].trim(), body: paren[2].trim() + "." };
  }
  // No splittable separator (covers strong-and-gap variant + any
  // polish output that the LLM rephrased into a single clause).
  return { title: trimmed, body: null };
}

export function BottomLineBlock({
  text,
  bodyTone,
}: {
  text: string;
  // "warning" → render the body with a warning-toned left rule for
  // gap/contrast verdicts ("…but only 25% on Y"). "neutral" → plain
  // body text. Caller decides based on whether the verdict came
  // from a templated gap composer (always a gap) vs a server-polished
  // summary (could be praise or strong-asset — painting those amber
  // would be a tone mismatch).
  bodyTone?: "warning" | "neutral";
}) {
  const { title, body } = splitBottomLine(text);
  return (
    // Vitals-tier treatment — verdict leads the card; text-wrap:
    // balance splits the title evenly across lines instead of
    // dropping a single word onto a second line.
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
        Bottom line
      </div>
      <div className="mt-1.5 text-[16px] md:text-[17px] font-medium leading-[1.4] tracking-tight text-foreground [text-wrap:balance] max-w-[90%]">
        {title}
      </div>
      {body && (
        // Punchline pad: a thin warning-toned left rule + tighter
        // top spacing makes the contrast clause read as a deliberate
        // "but…" callout. Only applied when the caller signals the
        // body IS a gap/contrast (bodyTone="warning"). For server-
        // polished strong-asset verdicts, the rule would mislabel
        // the verdict's mood — so we render the body plain in those
        // cases.
        <p
          className={`mt-2 max-w-[90%] text-[16px] md:text-[17px] text-foreground/85 leading-[1.4] tracking-tight [text-wrap:balance] ${
            bodyTone === "warning" ? "border-l-2 border-warning/60 pl-3" : ""
          }`}
        >
          {body}
        </p>
      )}
    </div>
  );
}
