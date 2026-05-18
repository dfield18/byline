import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  FileText,
  Globe,
  Radar,
  Search,
  Sparkles,
  Target,
  TextCursorInput,
  Zap,
} from "lucide-react";
import {
  SiAnthropic,
  SiGooglegemini,
  SiOpenai,
  SiPerplexity,
} from "react-icons/si";
import type { IconType } from "react-icons";
import { Card } from "@/components/dashboard/ui";

// TODO: replace these four placeholders with real values before launch.
//   CTA_URL: booking URL (Calendly or similar)
//   SAMPLE_REPORT_URL: page or external link for "See a sample report"
//   CONTACT_EMAIL: address shown in the closing CTA
//   DEMO_SUBJECT: name of the demo subject featured in the Product Preview section
const CTA_URL = "[CTA_URL_PLACEHOLDER]";
const SAMPLE_REPORT_URL = "[SAMPLE_REPORT_URL_PLACEHOLDER]";
const CONTACT_EMAIL = "[CONTACT_EMAIL_PLACEHOLDER]";

const DEMO_SUBJECT = "[DEMO_SUBJECT_PLACEHOLDER]";
// Fallback name rendered in the UI until DEMO_SUBJECT is set to a real value.
// Keeps the page from showing the literal `[..._PLACEHOLDER]` string.
const DEMO_SUBJECT_DISPLAY = DEMO_SUBJECT.startsWith("[")
  ? "Senator Maya Reyes"
  : DEMO_SUBJECT;

const WHO_IT_IS_FOR: { title: string; description: string }[] = [
  {
    title: "Public-affairs firms",
    description:
      "Brief principals and clients on how AI is framing the issues, reputations, and narratives they care about — with the sources driving each answer and where to push next.",
  },
  {
    title: "Advocacy organizations",
    description:
      "Track how AI describes your cause and your opponents’ — and see which surfaces to seed to move the narrative.",
  },
  {
    title: "Political campaigns",
    description:
      "Monitor how AI describes your candidate, your record, your contrast with the field, and emerging vulnerabilities — with recommended moves each week.",
  },
];


export function LandingPage() {
  return (
    // cursor-default prevents the browser's text-I-beam pointer from
    // showing when the user hovers over headlines, body copy, and
    // other non-editable text. Links and buttons keep their pointer
    // cursor via the UA stylesheet (for <a href>) and Tailwind
    // preflight (for <button>), so interactivity affordances are
    // unaffected.
    <div className="min-h-screen cursor-default bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <PlatformsStrip />
        <Positioning />
        <MethodologyBanner />
        <Problem />
        <ProductPreview />
        <Capabilities />
        <MidPageCTA />
        <HowItWorks />
        <WhoItsFor />
        <ClosingCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

function PlatformsStrip() {
  // Actual brand marks via react-icons (wraps the CC0-licensed
  // simple-icons set). Icons render with currentColor so the
  // monochrome editorial treatment via text-foreground/N still
  // applies — no rainbow brand-color circus competing with the
  // rest of the page.
  const platforms: { name: string; icon: IconType }[] = [
    { name: "ChatGPT", icon: SiOpenai },
    { name: "Claude", icon: SiAnthropic },
    { name: "Gemini", icon: SiGooglegemini },
    { name: "Perplexity", icon: SiPerplexity },
  ];
  return (
    <section className="border-b border-border/80 bg-card/30">
      <div className="mx-auto max-w-[1200px] px-6 py-7">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
            Platforms monitored
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13.5px] font-medium text-foreground/80">
            {platforms.map((p) => {
              const Icon = p.icon;
              return (
                <span key={p.name} className="inline-flex items-center gap-1.5">
                  <Icon
                    className="h-3.5 w-3.5 text-foreground/70"
                    aria-hidden
                  />
                  <span>{p.name}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Positioning() {
  return (
    <section className="border-b border-border/80">
      <div className="mx-auto max-w-[900px] px-6 py-8 text-center">
        <p className="text-[16px] leading-relaxed text-foreground/85">
          AI is editing the political conversation.{" "}
          <span className="font-semibold text-foreground">byline</span>
          {" "}reads what it&rsquo;s writing.
        </p>
      </div>
    </section>
  );
}

function MethodologyBanner() {
  // Each stat answers a distinct buyer question (How often, how
  // rigorously? / What do I actually get? / What do I do next?) so
  // the section closes the most common objections a public-affairs
  // buyer raises when evaluating the tool. Platform coverage moved
  // up into the heading subtitle since it's the same beat as "what
  // we track" — kept the stats focused on cadence/output/action.
  const stats: { label: string; value: string }[] = [
    {
      label: "Snapshot Cadence",
      value:
        "Weekly prompt runs in two layers — named (your subject) and unnamed (its topic area). Same prompts each cycle.",
    },
    {
      label: "Recommended Actions",
      value:
        "Concrete next-week moves: what to brief, what to pre-empt, where to add authority, and which sources to influence.",
    },
  ];
  return (
    <section className="border-b border-border/80 bg-card/50">
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        {/* Single flat 4-column grid so all four areas (heading +
            3 stats) get equal width and consistent gaps. Previously
            a nested 2-col outer grid (320px heading + stats) gave
            the heading a noticeably wider column and used a
            different gap (24px) than the inner stat-to-stat gap
            (40px). All four cells now use the same left-border
            chrome too so the row reads as a coherent four-up. */}
        <div className="grid items-start gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border-l-2 border-primary pl-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary">
              Methodology
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/85">
              We track how ChatGPT, Claude, Gemini, and Perplexity describe
              your issue, organization, opponents, and policy landscape.
              Fresh, stateless sessions each cycle.
            </p>
          </div>
          {stats.map((s) => (
            <div key={s.label} className="border-l-2 border-border/80 pl-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground/70">
                {s.label}
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/85">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MidPageCTA() {
  return (
    <section className="border-b border-border/80">
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-5 text-center sm:flex-row sm:gap-8 sm:text-left">
          <div className="text-[17px] font-medium tracking-tight text-foreground">
            Try it free on your own subject.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href={CTA_URL}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-opacity hover:opacity-95"
            >
              Create your free account
            </a>
            <a
              href={SAMPLE_REPORT_URL}
              className="group inline-flex items-center gap-2.5 rounded-md border border-border/80 bg-card/60 px-4 py-2 text-[14px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-border/80 bg-background/80 text-primary group-hover:border-primary/40">
                <FileText className="h-3 w-3" strokeWidth={1.75} />
              </span>
              See a sample report
              <ArrowRight className="h-3.5 w-3.5 text-foreground/55 transition-colors group-hover:text-primary" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Radar className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            byline
          </span>
          <span className="ml-1 rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-primary">
            Beta
          </span>
        </Link>

        <nav className="ml-8 hidden gap-6 text-sm text-foreground/80 md:flex">
          <Link href="#how-it-works" className="hover:text-foreground transition-colors">
            How it works
          </Link>
          <Link href="#capabilities" className="hover:text-foreground transition-colors">
            Product
          </Link>
          <Link href="#audience" className="hover:text-foreground transition-colors">
            Who it&rsquo;s for
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* /subjects is auth-gated by proxy.ts, so clicking redirects
              signed-out visitors to the Clerk sign-in flow. */}
          <Link
            href="/subjects"
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-foreground/85 hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <a
            href={CTA_URL}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:opacity-95 transition-opacity"
          >
            Create free account
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-border/80">
      <div className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className="mb-5 text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">
              AI Narrative Intelligence for Public Affairs
            </div>
            <h1 className="font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-[46px] md:text-[54px]">
              The most influential editor in politics has no byline.
            </h1>
            <p className="mt-6 max-w-2xl text-[17.5px] leading-[1.6] text-foreground/85">
              Get ahead of what AI is writing about your candidate, issue,
              or organization &mdash; across every major AI platform.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <a
                href={CTA_URL}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:opacity-95 transition-opacity"
              >
                Create your free account
              </a>
              <a
                href={SAMPLE_REPORT_URL}
                className="group inline-flex items-center gap-2.5 rounded-md border border-border/80 bg-card/60 px-4 py-2.5 text-[14.5px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-border/80 bg-background/80 text-primary group-hover:border-primary/40">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                See a sample report
                <ArrowRight className="h-3.5 w-3.5 text-foreground/55 transition-colors group-hover:text-primary" />
              </a>
            </div>
            {/* Beta clarifier — sits beneath the CTAs so a visitor
                immediately understands the two paths are both free
                while the product is in beta. */}
            <p className="mt-4 text-[15px] leading-relaxed text-foreground/75">
              <span className="font-medium text-foreground/90">byline</span>{" "}
              is in beta &mdash; free to use for now. Browse a sample
              report, or create an account to run your own.
            </p>
          </div>

          <div className="lg:col-span-5">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

// Stylized sample of byline's Competitive Snapshot — Share of
// Voice bars across the focal subject + top peers AI surfaces on
// the same topic areas. The dashboard pairs these bars with a
// metric table; the hero side panel keeps only the bars since
// the table is too dense for this width. Copy is realistic
// J.D. Vance peer data so the visual reads as authentic product
// output rather than a stylized illustration.
function HeroVisual() {
  const competitors: { name: string; sov: number; isSubject?: boolean }[] = [
    { name: "Donald Trump", sov: 92 },
    { name: "J.D. Vance", sov: 48, isSubject: true },
    { name: "Marco Rubio", sov: 31 },
    { name: "Ron DeSantis", sov: 28 },
    { name: "Vivek Ramaswamy", sov: 18 },
  ];
  return (
    <Card className="relative overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 60%)",
        }}
      />
      <div className="relative">
        {/* Card header — mirrors the live dashboard's Competitive
            Snapshot header (eyebrow + subject name + entities-
            tracked pill) so a visitor sees an authentic-looking
            module, not a marketing mock. */}
        <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-border/80">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/65">
              Competitive Snapshot
            </div>
            <div className="mt-0.5 font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              J.D. Vance
            </div>
          </div>
          <div className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-primary whitespace-nowrap">
            {competitors.length} entities
          </div>
        </div>

        <div className="mt-5 mb-3 text-[10px] uppercase tracking-wider text-foreground/65">
          Share of voice (% of answers)
        </div>

        {/* Bars — focal subject gets the strongest primary tint +
            a "You" pill; peers fade to lower opacity so the focal
            row reads first. */}
        <div className="space-y-3">
          {competitors.map((c) => (
            <div key={c.name}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`truncate text-[12.5px] ${
                      c.isSubject
                        ? "font-semibold text-foreground"
                        : "text-foreground/85"
                    }`}
                  >
                    {c.name}
                  </span>
                  {c.isSubject && (
                    <span className="rounded-sm bg-primary/15 text-primary text-[9px] font-semibold uppercase tracking-[0.08em] px-1 py-0.5">
                      You
                    </span>
                  )}
                </div>
                <span className="text-[12px] font-semibold tabular-nums text-foreground/85">
                  {c.sov}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${c.sov}%`,
                    background: "var(--primary)",
                    opacity: c.isSubject ? 1 : 0.55,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Problem() {
  return (
    <section className="border-b border-border/80 bg-card/40">
      <div className="mx-auto max-w-[900px] px-6 py-20 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          Why this matters
        </div>
        <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
          AI is the new front door to the internet.
        </h2>
        <div className="mt-12 flex flex-col items-center">
          <div className="font-display text-[64px] font-semibold leading-none tracking-[-0.03em] text-primary sm:text-[88px]">
            50%
          </div>
          <div className="mt-3 max-w-md text-[15.5px] leading-relaxed text-foreground/85">
            of US consumers now intentionally seek out AI-powered search.
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <a
              href="https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/new-front-door-to-the-internet-winning-in-the-age-of-ai-search"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline hover:text-foreground transition-colors"
            >
              McKinsey, <em>New Front Door to the Internet</em>, August 2025
            </a>
          </div>
        </div>
        {/* Two-column callout grid — the prior stacked-paragraph
            block read as a wall of text. Splitting into side-by-side
            panels with a subtle white card background against the
            section's faint card tint makes each beat scannable as a
            standalone supporting point. Single column stacks on
            mobile. */}
        <div className="mt-14 grid grid-cols-1 gap-5 text-left md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background p-5 text-[15.5px] leading-relaxed text-foreground/85 md:p-6">
            <p>
              Half of consumers now intentionally use AI-powered search. Among
              those who&apos;ve tried it, 44% say it&apos;s already their primary
              source for online information, beating traditional search at 31%.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-5 text-[15.5px] leading-relaxed text-foreground/85 md:p-6">
            <p>
              Voters ask ChatGPT, Claude, Gemini, and Perplexity what they
              once asked Google &mdash; candidates, records, and policies.
              They get an answer, not a link. Most comms teams have no idea
              what it says.
            </p>
          </div>
        </div>
        {/* Elevated takeaway — distinct visual register from the
            callouts above: thicker left border, primary-tinted wash,
            larger and slightly weightier type, generous mt-16 so it
            reads as a separate beat rather than another supporting
            paragraph. */}
        <div className="mx-auto mt-16 max-w-2xl rounded-md border-l-4 border-primary bg-primary/[0.05] px-6 py-5 text-left text-[17px] font-medium leading-relaxed text-foreground/90">
          AI search is becoming a persuasion channel. Most campaigns and
          advocacy teams are not monitoring it yet.
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="border-b border-border/80">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            What you see
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            A live read on how AI is framing {DEMO_SUBJECT_DISPLAY}.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/85">
            Every snapshot pairs the AI&rsquo;s actual framing with the gap that
            matters, the sources driving it, and the move you can make this week.
          </p>
        </div>

        {/* Stylized mock of an AI Visibility Snapshot. Stand-in until a
            real annotated screenshot ships. Numbers are illustrative. */}
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, transparent) 0%, transparent 60%)",
            }}
          />
          <div className="relative">
            {/* Top row: subject + period */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border/80 pb-5">
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground/80">
                  AI Visibility Snapshot
                </div>
                <div className="font-display text-[20px] font-semibold tracking-[-0.01em] text-foreground">
                  {DEMO_SUBJECT_DISPLAY}
                </div>
              </div>
              <div className="text-[11.5px] font-medium text-foreground/75">
                Last 7 days · 4 platforms
              </div>
            </div>

            {/* KPI tiles */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Mention rate", value: "68%", delta: "+5 pts", trend: "up" },
                { label: "Avg sentiment", value: "+0.18", delta: "+0.04", trend: "up" },
                { label: "Risk frame rate", value: "24%", delta: "−2 pts", trend: "down" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-md border border-border/80 bg-background/60 p-4"
                >
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
                    {kpi.label}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-display text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                      {kpi.value}
                    </span>
                    <span className="text-[11.5px] font-semibold text-success">
                      {kpi.trend === "up" ? "▲" : "▼"} {kpi.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Narrative mix */}
            <div className="mt-8">
              <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground/80">
                Dominant narrative
              </div>
              <div className="space-y-2.5">
                {[
                  { label: "Progressive reformer", pct: 42, tone: "primary" as const },
                  { label: "Consumer advocate", pct: 28, tone: "muted" as const },
                  { label: "Polarizing figure", pct: 18, tone: "warning" as const },
                  { label: "Other", pct: 12, tone: "muted" as const },
                ].map((n) => (
                  <div key={n.label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 text-[13px] text-foreground/85">
                      {n.label}
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${n.pct}%`,
                          background:
                            n.tone === "primary"
                              ? "var(--primary)"
                              : n.tone === "warning"
                                ? "var(--warning)"
                                : "color-mix(in oklab, var(--muted-foreground) 75%, transparent)",
                        }}
                      />
                    </div>
                    <div className="w-10 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-foreground/85">
                      {n.pct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended move */}
            <div className="mt-7 rounded-md border border-primary/30 bg-primary/[0.05] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary">
                    Recommended move
                  </div>
                  <div className="text-[14px] leading-relaxed text-foreground/90">
                    Seed independent sources on housing affordability &mdash;
                    the largest unowned gap in this snapshot.
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap pt-1 text-[11.5px] font-semibold text-primary">
                  Read brief →
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Capabilities() {
  const items: {
    title: string;
    body: string;
    icon: typeof Target;
  }[] = [
    {
      title: "Uncover hidden narratives",
      icon: Target,
      body: "See how AI assistants frame your issues, candidates, and organizations across ChatGPT, Claude, and Gemini.",
    },
    {
      title: "Topic-level gaps",
      icon: Search,
      body: "Spot vulnerabilities and blind spots before your opponents exploit them, and identify where AI underweights your strongest assets.",
    },
    {
      title: "Source intelligence",
      icon: Globe,
      body: "See which publications, sites, and platforms are shaping AI's answers about you.",
    },
    {
      title: "Recommended moves",
      icon: Zap,
      body: "Get specific, executable actions from every snapshot — which surfaces to seed, where to pre-empt, what to brief.",
    },
  ];
  return (
    <section id="capabilities" className="border-b border-border/80 bg-card/40">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            What it does
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            Built for narrative, not brand mentions.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/85">
            Most AI visibility tools count mentions. byline explains the story
            AI is telling about what you care about &mdash; and where the
            framing is shifting.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="h-full p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.08] text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="text-[16px] font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/85">
                  {item.body}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  // Each step now carries a UI-evocative lucide glyph instead of a
  // numeric badge — shifts the section's register from "generic
  // process steps" to "software features" and aligns visually with
  // the Capabilities cards above (same primary-tinted square tile
  // chrome). Icons chosen to hint at the actual UI surface for each
  // step (input field, AI spark, bar chart, action).
  const steps: { title: string; body: string; icon: typeof Sparkles }[] = [
    {
      title: "Choose what you care about.",
      icon: TextCursorInput,
      body: "Add the candidates, issues, or organizations you want to track.",
    },
    {
      title: "Ask the questions voters, journalists, and policy makers are asking.",
      icon: Sparkles,
      body: "The platform queries ChatGPT, Claude, Gemini, and Perplexity exactly the way real audiences do.",
    },
    {
      title: "Track how AI answers frame the subject.",
      icon: BarChart3,
      body: "Each snapshot shows the dominant narrative and the sources shaping it.",
    },
    {
      title: "Turn narrative gaps into comms strategy.",
      icon: Zap,
      body: "Get specific next-week moves — what to brief, where to pre-empt, what to seed.",
    },
  ];
  return (
    <section id="how-it-works" className="border-b border-border/80">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            How it works
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            From subjects to action in four steps.
          </h2>
        </div>
        <ol className="grid gap-7 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <Card className="h-full p-6 md:p-7">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.08] text-primary">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-[16px] font-semibold leading-snug tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-foreground/85">
                    {step.body}
                  </p>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function WhoItsFor() {
  return (
    <section id="audience" className="border-b border-border/80 bg-card/40">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Who it&rsquo;s for
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            Built for the teams shaping the political conversation.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHO_IT_IS_FOR.map((seg) => (
            <Card key={seg.title} className="p-6">
              <h3 className="text-[15.5px] font-semibold tracking-tight text-foreground">
                {seg.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-foreground/85">
                {seg.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCTA() {
  return (
    <section className="border-b border-border/80">
      <div className="mx-auto max-w-[800px] px-6 py-24 text-center">
        <h2 className="font-display text-[36px] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[48px]">
          Find out what AI is saying about your issue.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-foreground/85">
          Lock in free access during our beta period and instantly see the
          briefing AI is already giving your audience.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href={CTA_URL}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:opacity-95 transition-opacity"
          >
            Create your free account
          </a>
          <div className="text-[13.5px] text-foreground/75">
            or email us at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-primary hover:text-foreground transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="bg-card/40">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-6 py-12 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Radar className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            byline
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            AI narrative intelligence for public affairs
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <a href="[PRIVACY_URL_PLACEHOLDER]" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="[TERMS_URL_PLACEHOLDER]" className="hover:text-foreground transition-colors">
            Terms
          </a>
          {/* Methodology link points at the McKinsey report cited in
              the Problem section above as an interim target until a
              dedicated /methodology page exists. New tab + noopener
              for the external link. */}
          <a
            href="https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/new-front-door-to-the-internet-winning-in-the-age-of-ai-search"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Methodology
          </a>
          <span>&copy; {new Date().getFullYear()} byline</span>
        </div>
      </div>
    </footer>
  );
}
