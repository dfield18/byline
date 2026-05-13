/**
 * Visual mockup port of the Lovable-designed AI Visibility Overview.
 *
 * All data is hardcoded (Elizabeth Warren demo data) — this is a
 * presentation-only page intended to validate the look/feel of the
 * future customer-facing dashboard. Live data, methodology gaps
 * (narrative clusters / bottom-line synth / key insights), and
 * subject parameterization will be wired in subsequent passes.
 */
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Compass,
  AlertOctagon,
  Megaphone,
  Info,
} from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Card, SectionTitle, Pill } from "@/components/dashboard/ui";
import {
  RecallChart,
  SovChart,
  TopResultChart,
  CompetitorBars,
  SourcesDonut,
} from "@/components/dashboard/Charts";

const headlineKpis = [
  {
    label: "AI Recall",
    value: "72%",
    sub: "Mentioned in relevant AI answers",
    delta: "+4.1",
    trend: "up" as const,
    spark: [61, 63, 62, 66, 68, 67, 70, 72],
  },
  {
    label: "Avg Sentiment",
    value: "+0.27",
    sub: "Mean across all AI answers",
    delta: "+0.04",
    trend: "up" as const,
    spark: [18, 20, 21, 22, 23, 24, 26, 27],
  },
  {
    label: "Risk Frame Rate",
    value: "19%",
    sub: "Answers with opposition framing",
    delta: "−0.4",
    trend: "down" as const,
    risk: true,
    spark: [22, 21, 23, 22, 20, 21, 19.5, 19],
  },
];

const narrativeMix = [
  { name: "Progressive Reformer", pct: 42, color: "var(--primary)", tone: "primary" },
  { name: "Consumer Advocate", pct: 24, color: "color-mix(in oklab, var(--primary) 55%, var(--muted-foreground))", tone: "muted" },
  { name: "Polarizing Figure", pct: 19, color: "var(--warning)", tone: "warning" },
  { name: "Policy Expert", pct: 15, color: "color-mix(in oklab, var(--muted-foreground) 70%, transparent)", tone: "muted" },
];

const prompts = [
  {
    text: "Which politicians are leading voices on corporate regulation?",
    model: "ChatGPT",
    mentioned: true,
    rank: 2,
    frame: "Progressive Reformer",
    excerpt:
      "Warren is frequently associated with consumer protection, antitrust, and Wall Street accountability.",
  },
  {
    text: "Who has shaped consumer financial protection policy in the US?",
    model: "Claude",
    mentioned: true,
    rank: 1,
    frame: "Consumer Advocate",
    excerpt:
      "Elizabeth Warren is widely regarded as the architect of the Consumer Financial Protection Bureau, established after the 2008 crisis.",
  },
  {
    text: "Which Democratic senators have a strong record on housing affordability?",
    model: "Perplexity",
    mentioned: false,
    rank: null,
    frame: "Absent from answer",
    excerpt:
      "Coverage focuses primarily on Sherrod Brown, Tina Smith, and Catherine Cortez Masto. Warren is mentioned only in adjacent economic context.",
  },
];

const sources = [
  { name: "Wikipedia", score: 94, type: "Reference" },
  { name: "The New York Times", score: 88, type: "Media" },
  { name: "Brookings Institution", score: 76, type: "Think Tank" },
  { name: "warren.senate.gov", score: 71, type: "Government" },
  { name: "Wall Street Journal", score: 64, type: "Media" },
  { name: "elizabethwarren.com", score: 58, type: "Owned" },
  { name: "CNN", score: 51, type: "Media" },
];

const competitorRows = [
  { name: "Joe Biden", sov: "31%", pos: "1.8", trr: "42%" },
  { name: "Alexandria Ocasio-Cortez", sov: "26%", pos: "2.0", trr: "37%" },
  { name: "Bernie Sanders", sov: "22%", pos: "2.2", trr: "33%" },
  { name: "Elizabeth Warren", sov: "18%", pos: "2.4", trr: "31%", you: true },
  { name: "Pete Buttigieg", sov: "12%", pos: "3.1", trr: "21%" },
];

const modelColors: Record<string, string> = {
  ChatGPT: "var(--success)",
  Gemini: "var(--primary)",
  Claude: "var(--gold)",
  Perplexity: "var(--chart-5)",
};

function ModelDot({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: modelColors[name] }} />
      {name}
    </span>
  );
}

function TrendBadge({ trend, value }: { trend: "up" | "down" | "flat"; value: string }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  // For risk metrics, "down" is good; we color by direction directly here
  const color =
    trend === "up" ? "text-success" : trend === "down" ? "text-success" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {value}
    </span>
  );
}

function KpiTooltipIcon({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-3 w-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-md border border-border bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground opacity-0 group-hover:opacity-100 transition-opacity z-30 shadow-lg">
        {text}
      </span>
    </span>
  );
}

export default function DashboardPreviewPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header />

        <main className="flex-1 px-4 md:px-8 py-10 space-y-10 max-w-[1500px] w-full mx-auto">
          {/* HERO — executive briefing card */}
          <section>
            <div className="flex items-center justify-between gap-4 mb-4 px-1">
              <div className="text-xs text-foreground/55">
                AI Visibility Snapshot · Last 30 days
              </div>
              <div className="text-xs text-foreground/55 whitespace-nowrap">
                Last updated 14 minutes ago
              </div>
            </div>

            <Card className="relative overflow-hidden p-7 md:p-10 border-border/60">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--primary) 5%, transparent) 0%, color-mix(in oklab, var(--primary) 1.5%, transparent) 35%, transparent 70%)",
                }}
              />
              <div
                className="absolute -top-24 -right-24 h-64 w-64 rounded-full pointer-events-none opacity-60"
                style={{
                  background:
                    "radial-gradient(circle, color-mix(in oklab, var(--primary) 8%, transparent) 0%, transparent 70%)",
                }}
              />

              <div className="relative grid lg:grid-cols-5 gap-8 lg:gap-12">
                {/* LEFT: title + bottom line + 3 stats */}
                <div className="lg:col-span-3 flex flex-col">
                  <h1 className="font-display text-[24px] md:text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                    AI Narrative Brief: Elizabeth Warren
                  </h1>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/70 max-w-xl">
                    How major AI platforms describe Warren across voter-facing and
                    public-affairs prompts.
                  </p>

                  {/* Bottom line — analyst briefing note */}
                  <div
                    className="mt-6 relative pl-5 pr-4 py-4 rounded-md"
                    style={{
                      background:
                        "color-mix(in oklab, var(--primary) 6%, transparent)",
                    }}
                  >
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary mb-1.5">
                      Bottom line
                    </div>
                    <p className="text-[17px] leading-relaxed font-semibold tracking-[-0.005em] text-foreground">
                      AI platforms still define Warren primarily through consumer protection
                      and banking regulation. Her newer cost-of-living and housing message
                      is not yet breaking through.
                    </p>
                  </div>

                  <div className="mt-7 grid grid-cols-3 gap-8 pt-6 border-t border-border/50">
                    {headlineKpis.map((k) => (
                      <div key={k.label} className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground/75">
                          <span className="truncate">{k.label}</span>
                          <KpiTooltipIcon text={k.sub} />
                        </div>
                        <div className="mt-2 flex items-baseline gap-2.5">
                          <div
                            className={`font-display text-[28px] leading-none font-semibold tracking-[-0.02em] ${
                              k.risk ? "text-warning" : "text-foreground"
                            }`}
                          >
                            {k.value}
                          </div>
                          <TrendBadge trend={k.trend} value={k.delta} />
                        </div>
                        <div className="mt-1.5 text-[12px] text-foreground/55 leading-snug">
                          {k.sub}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT: Dominant Narrative — ranked bars */}
                <div className="lg:col-span-2 lg:border-l lg:border-border/50 lg:pl-12">
                  <div className="text-[12px] font-semibold text-foreground/70">Dominant narrative</div>

                  <div className="mt-2 font-display text-[24px] leading-tight font-semibold tracking-[-0.02em] text-foreground">
                    Progressive Reformer
                  </div>
                  <div className="mt-1.5 text-[13px] text-foreground/60">
                    Appears in <span className="text-foreground font-semibold">42%</span> of AI
                    answers about Warren
                  </div>

                  {/* Ranked horizontal bars */}
                  <ul className="mt-7 space-y-5">
                    {narrativeMix.map((n) => (
                      <li key={n.name}>
                        <div className="flex items-center justify-between text-[13px] mb-1.5">
                          <span className="text-foreground/85 font-medium">{n.name}</span>
                          <span className="text-foreground/55 tabular-nums text-[12px]">
                            {n.pct}%
                          </span>
                        </div>
                        <div className="relative h-1.5 w-full rounded-full bg-muted/80 overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${(n.pct / 42) * 100}%`,
                              background: n.color,
                              opacity: n.tone === "primary" ? 1 : n.tone === "warning" ? 0.85 : 0.55,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </section>

          {/* STRATEGIC TAKEAWAYS — one primary, two secondary */}
          <section>
            <SectionTitle
              eyebrow="Strategic Takeaways"
              title="What stands out this period"
              description="The most important shifts in how AI platforms currently describe Elizabeth Warren."
            />
            <Card className="p-2 md:p-3">
              <ul className="divide-y divide-border/60">
                {[
                  {
                    icon: AlertOctagon,
                    eyebrow: "Message gap",
                    eyebrowClass: "text-warning",
                    dotClass: "bg-warning",
                    title: "AI underweights Warren's cost-of-living message",
                    body: (
                      <>
                        Warren appears in only{" "}
                        <span className="font-semibold text-foreground">8%</span> of
                        housing-affordability prompts versus{" "}
                        <span className="font-semibold text-foreground">42%</span> of
                        banking-regulation prompts.
                      </>
                    ),
                  },
                  {
                    icon: Compass,
                    eyebrow: "Opposition frame",
                    eyebrowClass: "text-foreground/55",
                    dotClass: "bg-foreground/30",
                    title: "Business prompts trigger opposition framing",
                    body: "Anti-business and polarizing frames appear most often in economy and business queries, especially on Gemini and Perplexity.",
                  },
                  {
                    icon: Megaphone,
                    eyebrow: "Strongest asset",
                    eyebrowClass: "text-primary/80",
                    dotClass: "bg-primary",
                    title: "Consumer protection remains the strongest association",
                    body: "Across models, AI consistently links Warren with consumer protection, banking regulation, antitrust, and corporate accountability.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.eyebrow}
                      className="relative grid grid-cols-[auto_1fr] gap-5 px-5 md:px-6 py-5"
                    >
                      <span className={`absolute left-0 top-5 bottom-5 w-[2px] rounded-full ${item.dotClass}`} />
                      <div className="pt-0.5">
                        <Icon className={`h-4 w-4 ${item.eyebrowClass}`} />
                      </div>
                      <div className="min-w-0">
                        <div className={`text-[11.5px] font-semibold uppercase tracking-[0.06em] ${item.eyebrowClass}`}>
                          {item.eyebrow}
                        </div>
                        <div className="mt-1 text-[16px] font-semibold tracking-[-0.01em] text-foreground leading-snug">
                          {item.title}
                        </div>
                        <p className="mt-1.5 text-[13.5px] text-foreground/70 leading-relaxed max-w-3xl">
                          {item.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>

          {/* WHAT AI IS ACTUALLY SAYING */}
          <section>
            <SectionTitle
              eyebrow="Evidence"
              title="What AI is actually saying"
              description="Sample answers from recent voter-facing and public-affairs prompts."
            />
            <div className="grid md:grid-cols-3 gap-4">
              {prompts.map((p, i) => (
                <Card key={i} className="p-5 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <ModelDot name={p.model} />
                    {p.mentioned ? (
                      <Pill tone="success">Mentioned · #{p.rank}</Pill>
                    ) : (
                      <Pill tone="destructive">Not mentioned</Pill>
                    )}
                  </div>
                  <div className="text-[13px] font-semibold text-foreground mb-3 leading-snug">
                    &ldquo;{p.text}&rdquo;
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed flex-1 border-l-2 border-primary/40 pl-3 italic">
                    {p.excerpt}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
                    Frame:{" "}
                    <span className={p.mentioned ? "text-foreground font-medium" : "text-warning font-medium"}>
                      {p.frame}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* VISIBILITY TRENDS */}
          <section>
            <SectionTitle
              eyebrow="Visibility Trends"
              title="How visibility has shifted"
              description="Movement across the headline metrics over the last 8 weeks."
            />
            <div className="grid md:grid-cols-3 gap-4">
              {[
                {
                  title: "AI Recall",
                  value: "72%",
                  delta: "+11 pts",
                  chart: <RecallChart />,
                  meaning:
                    "Recall climbed steadily as recent regulatory hearings drove a fresh wave of media citations.",
                },
                {
                  title: "Share of Voice",
                  value: "18%",
                  delta: "+4 pts",
                  chart: <SovChart />,
                  meaning:
                    "Sustained gains versus the tracked competitive set, led by Claude and Perplexity in policy queries.",
                },
                {
                  title: "First Mention Rate",
                  value: "31%",
                  delta: "+5 pts",
                  chart: <TopResultChart />,
                  meaning:
                    "Volatile week to week — driven by news cycles around banking oversight and CFPB actions.",
                },
              ].map((c) => (
                <Card key={c.title} className="p-5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {c.title}
                      </div>
                      <div className="text-2xl font-semibold tracking-tight mt-1">{c.value}</div>
                    </div>
                    <TrendBadge trend="up" value={c.delta} />
                  </div>
                  <div className="mt-3">{c.chart}</div>
                  <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground leading-relaxed">
                    {c.meaning}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* COMPETITIVE SNAPSHOT */}
          <Card className="p-6">
            <SectionTitle
              eyebrow="Competitive Snapshot"
              title="How Warren compares to peers"
              description="Share of voice and visibility against a tracked set of comparable political figures."
              right={<Pill tone="primary">5 entities tracked</Pill>}
            />
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                  Share of Voice (% of answers)
                </div>
                <CompetitorBars />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="px-3 py-2.5 font-medium">Entity</th>
                      <th className="px-3 py-2.5 font-medium text-right">Share</th>
                      <th className="px-3 py-2.5 font-medium text-right">Avg Pos</th>
                      <th className="px-3 py-2.5 font-medium text-right">First Mention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorRows.map((c) => (
                      <tr
                        key={c.name}
                        className={`border-b border-border/60 ${
                          c.you ? "bg-primary/5" : "hover:bg-accent/40"
                        } transition-colors`}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className={c.you ? "font-semibold" : "font-medium"}>
                              {c.name}
                            </span>
                            {c.you && <Pill tone="primary">You</Pill>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono">{c.sov}</td>
                        <td className="px-3 py-3 text-right font-mono">{c.pos}</td>
                        <td className="px-3 py-3 text-right font-mono">{c.trr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* SOURCES SHAPING AI ANSWERS */}
          <Card className="p-6">
            <SectionTitle
              eyebrow="Sources"
              title="Sources shaping AI answers"
              description="The publications and pages most often cited or paraphrased in AI responses about Warren."
            />
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Ranked list */}
              <div className="space-y-1">
                <div className="grid grid-cols-12 text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-2 border-b border-border">
                  <div className="col-span-6">Source</div>
                  <div className="col-span-3 text-right">Influence</div>
                  <div className="col-span-3 text-right">Type</div>
                </div>
                {sources.map((s, idx) => (
                  <div
                    key={s.name}
                    className="grid grid-cols-12 items-center gap-2 px-3 py-2.5 rounded-md hover:bg-accent/60 transition-colors text-sm"
                  >
                    <div className="col-span-6 flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-muted-foreground tabular-nums w-4">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{s.name}</span>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${s.score}%` }} />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">{s.score}</span>
                      </div>
                    </div>
                    <div className="col-span-3 text-right">
                      <Pill tone="neutral">{s.type}</Pill>
                    </div>
                  </div>
                ))}
              </div>

              {/* Donut — same sources, visualized as proportional influence */}
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                  Influence share
                </div>
                <SourcesDonut data={sources} />
                <div className="mt-2 text-center text-[11px] text-muted-foreground">
                  {sources.length} sources tracked
                </div>
              </div>
            </div>
          </Card>

          <footer className="pt-6 pb-8 border-t border-border/40">
            <p className="text-center text-[11.5px] text-foreground/60 leading-relaxed">
              Based on{" "}
              <span className="font-semibold text-foreground/80 tabular-nums">1,284</span>{" "}
              AI responses across{" "}
              <span className="font-semibold text-foreground/80">4 platforms</span>{" "}
              over the last 30 days.{" "}
              <a href="#" className="text-primary hover:underline">
                Methodology →
              </a>
            </p>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Brand Visibility · AI Narrative Intelligence for Public Affairs ·{" "}
              <span className="text-foreground/70">Demo data shown</span>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
