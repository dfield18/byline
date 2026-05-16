import Link from "next/link";
import { ArrowRight, Radar } from "lucide-react";
import { Card } from "@/components/dashboard/ui";

const CTA_URL = "[CTA_URL_PLACEHOLDER]";
const SAMPLE_REPORT_URL = "[SAMPLE_REPORT_URL_PLACEHOLDER]";
const CONTACT_EMAIL = "[CONTACT_EMAIL_PLACEHOLDER]";

const PROBLEM_HEADLINE = "[PROBLEM_HEADLINE_PLACEHOLDER]";
const STAT = "[STAT_PLACEHOLDER]";
const STAT_SOURCE = "[STAT_SOURCE_PLACEHOLDER]";

const DEMO_SUBJECT = "[DEMO_SUBJECT_PLACEHOLDER]";

const SUBJECT_LIMITS = "[SUBJECT_LIMITS_PLACEHOLDER]";
const SNAPSHOT_DETAILS = "[SNAPSHOT_DETAILS_PLACEHOLDER]";
const INTEGRATION_LIST = "[INTEGRATION_LIST_PLACEHOLDER]";

const WHO_IT_IS_FOR: { title: string; description: string }[] = [
  { title: "[SEGMENT_1_PLACEHOLDER]", description: "[SEGMENT_1_COPY_PLACEHOLDER]" },
  { title: "[SEGMENT_2_PLACEHOLDER]", description: "[SEGMENT_2_COPY_PLACEHOLDER]" },
  { title: "[SEGMENT_3_PLACEHOLDER]", description: "[SEGMENT_3_COPY_PLACEHOLDER]" },
];

const DIFFERENTIATION_COPY = "[DIFFERENTIATION_COPY_PLACEHOLDER]";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <Problem />
        <ProductPreview />
        <Capabilities />
        <HowItWorks />
        <WhoItsFor />
        <Differentiation />
        <ClosingCTA />
      </main>
      <MarketingFooter />
    </div>
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
              The most influential editor in politics doesn&rsquo;t have a byline.
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-foreground/70">
              Millions of Americans turn to AI for answers about politics, policy,
              and the people shaping it. See how AI is framing your issue &mdash;
              and shape the story before your opponents do.
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
    { label: "Consumer protection", pct: 84 },
    { label: "Banking regulation", pct: 71 },
    { label: "Housing affordability", pct: 22, low: true },
    { label: "Corporate power", pct: 66 },
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
        <div className="mt-5 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-warning">
            Recommended action
          </div>
          <div className="mt-1 text-[12.5px] leading-snug text-foreground/85">
            Seed authoritative sources on housing affordability &mdash; the
            largest unowned gap in this snapshot.
          </div>
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
          {PROBLEM_HEADLINE}
        </h2>
        <div className="mt-12 flex flex-col items-center">
          <div className="font-display text-[64px] font-semibold leading-none tracking-[-0.03em] text-primary sm:text-[88px]">
            {STAT}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Source: {STAT_SOURCE}
          </div>
        </div>
        <p className="mx-auto mt-12 max-w-2xl text-[16.5px] leading-relaxed text-foreground/75">
          Every time someone asks an AI assistant about your candidate, your
          issue, or your organization, they get an answer. That answer is
          shaping opinions in real time &mdash; and most communications teams
          have no idea what it says.
        </p>
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
            A live read on how AI is framing {DEMO_SUBJECT}.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/70">
            Every snapshot pairs the AI&rsquo;s actual framing with the gap that
            matters, the sources driving it, and the move you can make this week.
          </p>
        </div>

        <Card className="relative overflow-hidden">
          {/* Placeholder for product screenshot. Replace with a real
              Brand Visibility snapshot annotated with 3–4 callouts. */}
          <div
            className="relative flex aspect-[16/9] items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--primary) 3%, transparent) 0%, color-mix(in oklab, var(--primary) 1%, transparent) 50%, transparent 100%)",
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="relative text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Placeholder
              </div>
              <div className="mt-2 text-[15px] text-foreground/65">
                Annotated dashboard screenshot &mdash; {DEMO_SUBJECT}
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
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <Card key={item.title} className="p-6">
              <div className="mb-3 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </div>
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
  const steps = [
    {
      title: "Define your subjects.",
      body: "Add the candidates, issues, organizations, or entities you want to track.",
      detail: SUBJECT_LIMITS,
    },
    {
      title: "We run weekly snapshots.",
      body: "Each snapshot queries major AI assistants across your topic areas.",
      detail: SNAPSHOT_DETAILS,
    },
    {
      title: "You get a structured brief.",
      body: "Headline gaps, evidence quotes, source attribution, and recommended actions — delivered in-app and via weekly email.",
      detail: null,
    },
    {
      title: "Take action with your team.",
      body: "Export findings, share snapshots with stakeholders, integrate with your existing comms workflows.",
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

function Differentiation() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-[1000px] px-6 py-24">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">
            What it isn&rsquo;t
          </div>
          <h2 className="font-display text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground sm:text-[34px]">
            Not social listening. Not generic AI search analytics.
          </h2>
        </div>
        <Card className="p-8">
          <p className="text-[16px] leading-relaxed text-foreground/80">
            {DIFFERENTIATION_COPY}
          </p>
          <div className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                What others measure
              </div>
              <div className="mt-2 text-[14.5px] leading-relaxed text-foreground/75">
                [DIFF_LEFT_COLUMN_PLACEHOLDER] &mdash; brand mentions, social
                share of voice, sentiment on public posts.
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                What byline measures
              </div>
              <div className="mt-2 text-[14.5px] leading-relaxed text-foreground/75">
                [DIFF_RIGHT_COLUMN_PLACEHOLDER] &mdash; what AI assistants
                actually tell your audience when asked about your issue.
              </div>
            </div>
          </div>
        </Card>
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
          [CLOSING_SUBHEAD_PLACEHOLDER] &mdash; one sentence reinforcing
          urgency.
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
          <a href="[METHODOLOGY_URL_PLACEHOLDER]" className="hover:text-foreground transition-colors">
            Methodology
          </a>
          <span>&copy; {new Date().getFullYear()} byline</span>
        </div>
      </div>
    </footer>
  );
}
