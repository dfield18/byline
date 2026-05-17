import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
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

const SUBJECT_LIMITS =
  "Up to 25 subjects per organization on the standard plan.";
const SNAPSHOT_DETAILS =
  "Each subject runs roughly 13 prompts per cycle across ChatGPT, Claude, Gemini, and Perplexity — refreshed weekly.";
const INTEGRATION_LIST =
  "Export to CSV, share snapshots via link, or send a weekly brief by email.";

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
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <PlatformsStrip />
        <Positioning />
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
  const platforms = ["ChatGPT", "Claude", "Gemini", "Perplexity"];
  return (
    <section className="border-b border-border/60 bg-card/30">
      <div className="mx-auto max-w-[1200px] px-6 py-7">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Platforms monitored
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-medium text-foreground/80">
            {platforms.map((p, i) => (
              <span key={p} className="inline-flex items-center gap-6">
                {p}
                {i < platforms.length - 1 && (
                  <span className="text-foreground/25" aria-hidden>
                    ·
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Positioning() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[900px] px-6 py-10 text-center">
        <p className="text-[15.5px] leading-relaxed text-foreground/70">
          <span className="font-semibold text-foreground">byline</span> monitors
          AI-generated answers the way media teams monitor press coverage.
        </p>
      </div>
    </section>
  );
}

function MidPageCTA() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="flex flex-col items-center justify-center gap-5 text-center sm:flex-row sm:gap-8 sm:text-left">
          <div className="text-[17px] font-medium tracking-tight text-foreground">
            See it on your own subject.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a
              href={CTA_URL}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-opacity hover:opacity-95"
            >
              Book a demo
            </a>
            <a
              href={SAMPLE_REPORT_URL}
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary transition-colors hover:text-foreground"
            >
              See a sample report
              <ArrowRight className="h-3.5 w-3.5" />
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
        </Link>

        <nav className="ml-8 hidden gap-6 text-sm text-foreground/70 md:flex">
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
            className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-foreground/75 hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <a
            href={CTA_URL}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:opacity-95 transition-opacity"
          >
            Book a demo
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
              AI Narrative Intelligence
            </div>
            <h1 className="font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-[52px] md:text-[60px]">
              The most influential editor in politics has no byline.
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-foreground/70">
              Track how ChatGPT, Claude, Gemini, and Perplexity describe your
              candidate, issue, or organization &mdash; and see where your
              narrative is gaining or losing ground.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <a
                href={CTA_URL}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:opacity-95 transition-opacity"
              >
                Book a demo
              </a>
              <a
                href={SAMPLE_REPORT_URL}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-primary hover:text-foreground transition-colors"
              >
                See a sample report
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-5">
            <HeroVisual />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  const topics = [
    { label: "Climate policy", pct: 84 },
    { label: "Immigration", pct: 71 },
    { label: "Voting rights", pct: 22, low: true },
    { label: "Healthcare access", pct: 66 },
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
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Topic recall
          </div>
          <div className="text-[10px] text-muted-foreground">Last 30 days</div>
        </div>
        <div className="mt-5 space-y-3.5">
          {topics.map((t) => (
            <div key={t.label}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] text-foreground/85">{t.label}</span>
                <span
                  className={`text-[12px] font-semibold ${
                    t.low ? "text-warning" : "text-foreground/80"
                  }`}
                >
                  {t.pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${t.pct}%`,
                    background: t.low
                      ? "var(--warning)"
                      : "var(--primary)",
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
    <section className="border-b border-border/60 bg-card/40">
      <div className="mx-auto max-w-[900px] px-6 py-24 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
          The problem
        </div>
        <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
          AI is the new front door to the internet.
        </h2>
        <div className="mt-12 flex flex-col items-center">
          <div className="font-display text-[64px] font-semibold leading-none tracking-[-0.03em] text-primary sm:text-[88px]">
            50%
          </div>
          <div className="mt-3 max-w-md text-[15px] leading-relaxed text-foreground/75">
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
        <div className="mx-auto mt-12 max-w-2xl space-y-5 text-[16.5px] leading-relaxed text-foreground/75">
          <p>
            Half of consumers now intentionally use AI-powered search. Among
            those who&apos;ve tried it, 44% say it&apos;s already their primary
            source for online information, beating traditional search at 31%.
          </p>
          <p>
            Voters ask ChatGPT, Gemini, Claude, and Google&apos;s AI features
            the same questions they used to type into Google — about
            candidates, records, policies, and the organizations shaping them.
            The AI doesn&apos;t link them to your press release, your op-ed,
            or your fact sheet. It gives them an answer. Most communications
            teams have no idea what that answer says.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-2xl rounded-md border-l-2 border-primary/60 bg-card/60 px-5 py-4 text-left text-[15px] leading-relaxed text-foreground/85">
          AI search is becoming a persuasion channel. Most campaigns and
          advocacy teams are not monitoring it yet.
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
            What you see
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            A live read on how AI is framing {DEMO_SUBJECT_DISPLAY}.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/70">
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border/60 pb-5">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  AI Visibility Snapshot
                </div>
                <div className="font-display text-[20px] font-semibold tracking-[-0.01em] text-foreground">
                  {DEMO_SUBJECT_DISPLAY}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground">
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
                  className="rounded-md border border-border/60 bg-background/60 p-4"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {kpi.label}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="font-display text-[24px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                      {kpi.value}
                    </span>
                    <span className="text-[11px] font-medium text-success">
                      {kpi.trend === "up" ? "▲" : "▼"} {kpi.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Narrative mix */}
            <div className="mt-8">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
                    <div className="w-40 shrink-0 text-[12.5px] text-foreground/80">
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
                                : "color-mix(in oklab, var(--muted-foreground) 55%, transparent)",
                        }}
                      />
                    </div>
                    <div className="w-10 shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground/80">
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
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                    Recommended move
                  </div>
                  <div className="text-[13.5px] leading-relaxed text-foreground/85">
                    Seed independent sources on housing affordability &mdash;
                    the largest unowned gap in this snapshot.
                  </div>
                </div>
                <div className="shrink-0 whitespace-nowrap pt-1 text-[11px] font-medium text-primary">
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
  const items = [
    {
      title: "Narrative tracking",
      body: "See how AI assistants frame your issues, candidates, and organizations across ChatGPT, Claude, and Gemini.",
    },
    {
      title: "Topic-level gaps",
      body: "Identify where AI underweights your strongest assets — and where your opponents are breaking through.",
    },
    {
      title: "Source intelligence",
      body: "See which publications, sites, and platforms are shaping AI's answers about you.",
    },
    {
      title: "Recommended moves",
      body: "Get specific, executable actions from every snapshot — which surfaces to seed, where to pre-empt, what to brief.",
    },
  ];
  return (
    <section id="capabilities" className="border-b border-border/60 bg-card/40">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
            What it does
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            Built for narrative, not brand mentions.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/70">
            Most AI visibility tools count mentions. byline explains the story
            AI is telling &mdash; what answer engines actually say about your
            candidate, issue, or organization, and where the framing is
            shifting.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <Card key={item.title} className="p-6">
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-foreground/70">
                {item.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: { title: string; body: string; detail: string | null }[] = [
    {
      title: "Choose the race, issue, or organization.",
      body: "Pick the candidates, policy debates, or organizations you want to track. byline handles the prompt design.",
      detail: SUBJECT_LIMITS,
    },
    {
      title: "Ask the questions voters, journalists, and stakeholders are asking.",
      body: "We run those questions across ChatGPT, Claude, Gemini, and Perplexity — the same way real audiences encounter the topic.",
      detail: SNAPSHOT_DETAILS,
    },
    {
      title: "Track how AI answers frame the subject.",
      body: "Each snapshot surfaces the dominant narrative, where you’re strongest or weakest, and the sources driving the answer.",
      detail: null,
    },
    {
      title: "Turn narrative gaps into comms strategy.",
      body: "Headline gaps, evidence quotes, and concrete next-week moves — what to brief, where to pre-empt, which surfaces to seed.",
      detail: INTEGRATION_LIST,
    },
  ];
  return (
    <section id="how-it-works" className="border-b border-border/60">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
            How it works
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            From subjects to action in four steps.
          </h2>
        </div>
        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[12px] font-semibold tabular-nums text-primary">
                {i + 1}
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-foreground/70">
                {step.body}
              </p>
              {step.detail && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  {step.detail}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhoItsFor() {
  return (
    <section id="audience" className="border-b border-border/60 bg-card/40">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
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
              <p className="mt-2 text-[14px] leading-relaxed text-foreground/70">
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
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[800px] px-6 py-28 text-center">
        <h2 className="font-display text-[36px] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-[48px]">
          Find out what AI is saying about your issue.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-foreground/70">
          See the briefing AI is already giving your audience.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href={CTA_URL}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:opacity-95 transition-opacity"
          >
            Book a demo
          </a>
          <div className="text-[13.5px] text-foreground/65">
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
