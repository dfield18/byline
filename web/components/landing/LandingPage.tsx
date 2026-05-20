import Link from "next/link";
import { ArrowRight, FileText, Radar } from "lucide-react";
import {
  SiAnthropic,
  SiGooglegemini,
  SiOpenai,
  SiPerplexity,
} from "react-icons/si";
import type { IconType } from "react-icons";
import { Card } from "@/components/dashboard/ui";
import { ProductPreviewClient } from "@/components/landing/ProductPreviewClient";

// TODO: replace these three placeholders with real values before launch.
//   CTA_URL: booking URL (Calendly or similar)
//   SAMPLE_REPORT_URL: page or external link for "See a sample report"
//   CONTACT_EMAIL: address shown in the closing CTA
const CTA_URL = "[CTA_URL_PLACEHOLDER]";
const SAMPLE_REPORT_URL = "[SAMPLE_REPORT_URL_PLACEHOLDER]";
const CONTACT_EMAIL = "[CONTACT_EMAIL_PLACEHOLDER]";

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
    // other non-editable text. caret-transparent hides the text-
    // selection caret that would otherwise blink when a click lands
    // inside non-editable text (Tailwind class for
    // `caret-color: transparent`). Text stays selectable for copy-
    // paste — just no visible blinking caret on click. Links and
    // buttons keep their pointer cursor via the UA stylesheet
    // (for <a href>) and Tailwind preflight (for <button>), so
    // interactivity affordances are unaffected.
    <div className="min-h-screen cursor-default caret-transparent bg-background text-foreground">
      <MarketingNav />
      <main>
        <Hero />
        <PlatformsStrip />
        <MethodologyBanner />
        <Problem />
        <ProductPreview />
        <HowItWorks />
        <MidPageCTA />
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
      label: "Response Analysis",
      value:
        "Every response is classified by AI to extract sentiment, narratives, and sources.",
    },
    {
      label: "Recommended Actions",
      value:
        "Concrete next-week moves: what to brief, where to add authority, and which sources to influence.",
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
        <div className="grid items-start gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-l-2 border-primary pl-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary">
              Methodology
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/85">
              We track how ChatGPT, Claude, Gemini, and Perplexity describe
              your cause across fresh, stateless sessions.
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
              AI is shaping political narratives. Track what it says about you.
            </h1>
            <p className="mt-6 max-w-2xl text-[17.5px] leading-[1.6] text-foreground/85">
              <span className="font-semibold text-foreground">byline</span>
              {" "}monitors how the major AI platforms answer the questions
              that shape your candidate, issue, or industry.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <a
                href={CTA_URL}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] hover:opacity-95 transition-opacity"
              >
                Create free account
              </a>
              <a
                href={SAMPLE_REPORT_URL}
                className="group inline-flex items-center gap-2.5 rounded-md border border-border/80 bg-card/60 px-4 py-2.5 text-[14.5px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-border/80 bg-background/80 text-primary group-hover:border-primary/40">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                View sample report
                <ArrowRight className="h-3.5 w-3.5 text-foreground/55 transition-colors group-hover:text-primary" />
              </a>
            </div>
            {/* One-line beta clarifier under the CTAs. Replaces the
                earlier two-sentence paragraph; just enough to signal
                the price ($0) and friction ($0). */}
            <p className="mt-4 text-[14px] text-foreground/70">
              Free during beta. No credit card required.
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

// Stylized sample of byline's Narrative Mix surface — the
// cluster-share bars that live on the dashboard hero's right
// column. Pairs with the page H1 ("AI is shaping political
// narratives") by literally showing the narratives AI is
// producing about the subject. Mirrors the live
// DominantNarrativePanel: same opacity ramp by position,
// same warning-tone treatment for risk-frame clusters.
function HeroVisual() {
  const clusters: { name: string; pct: number; negative?: boolean }[] = [
    { name: "Administration Role and Influence", pct: 40 },
    { name: "Conservative Populism and Policies", pct: 35 },
    { name: "Author and Commentator", pct: 10 },
    { name: "Political Opportunism Critiques", pct: 10, negative: true },
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
        {/* Card header — mirrors the live Narrative Mix section
            title (eyebrow + subject name + meta). */}
        <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-border/80">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/65">
              Narrative Mix
            </div>
            <div className="mt-0.5 font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              J.D. Vance
            </div>
          </div>
          <div className="text-[10.5px] font-medium text-foreground/70 whitespace-nowrap">
            Last 7 days
          </div>
        </div>

        {/* Cluster bars — same opacity ramp (0.6 / 0.45 / 0.3 /
            0.2) and warning-color override for risk-frame clusters
            as the live dashboard's DominantNarrativePanel. */}
        <ul className="mt-6 space-y-5">
          {clusters.map((c, i) => {
            const opacity =
              i === 0 ? 0.6 : i === 1 ? 0.45 : i === 2 ? 0.3 : 0.2;
            return (
              <li key={c.name}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-foreground/65">{c.name}</span>
                  <span className="tabular-nums text-[11.5px] text-foreground/55">
                    {c.pct}%
                  </span>
                </div>
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/80">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${c.pct}%`,
                      background: c.negative
                        ? "var(--warning)"
                        : "var(--primary)",
                      opacity: c.negative ? 0.75 : opacity,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
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
            of US consumers now turn to AI for answers &mdash; and 44% of
            those who&apos;ve tried it now prefer it to Google.
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
        {/* Persuasion-magnitude stat — same big-number + caption +
            source-link pattern as the 50% above. The two stats now
            sit as a structural pair (each with a long detail-rich
            caption underneath) rather than being separated by a
            text-callout block. */}
        <div className="mt-14 flex flex-col items-center">
          <div className="font-display text-[64px] font-semibold leading-none tracking-[-0.03em] text-primary sm:text-[88px]">
            4×
          </div>
          <div className="mt-3 max-w-md text-[15.5px] leading-relaxed text-foreground/85">
            A brief AI chatbot conversation shifted voters&apos; views on
            candidates and policies up to four times more than traditional
            political ads.
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <a
              href="https://www.technologyreview.com/2025/12/04/1128824/ai-chatbots-can-sway-voters-better-than-political-advertisements/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline hover:text-foreground transition-colors"
            >
              Cornell-led studies, <em>Nature</em> &amp; <em>Science</em>,
              December 2025
            </a>
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
            A live read on how AI is framing political figures.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/85">
            Every brief pairs the AI&rsquo;s actual framing with the gap that
            matters, the sources driving it, and the move you can make this
            week. Toggle between two real subjects below.
          </p>
        </div>

        {/* Interactive product preview — moved into a client component
            so the subject toggle can be a useState. The brief content
            mirrors what the live dashboard generates for each subject
            (J.D. Vance's brief uses the actual production output; AOC's
            is a plausible composition matching the same format). */}
        <ProductPreviewClient />
      </div>
    </section>
  );
}

function HowItWorks() {
  // Merged section: combines the prior "What it does" differentiator
  // headline with the "How it works" process steps. Rendered as a
  // numbered vertical timeline (large primary digits + connecting
  // line + per-step title/body) rather than a card grid, so it
  // reads as a distinct visual register from the icon-card grids
  // used elsewhere on the page. Section bg-card/40 picks up the
  // alt-bg slot vacated by the deleted Capabilities section so the
  // page rhythm stays intact.
  const steps: { title: string; body: string }[] = [
    {
      title: "Choose what you care about.",
      body: "Add the candidates, issues, or organizations you want to track.",
    },
    {
      title: "We ask what your audiences ask.",
      body: "byline queries ChatGPT, Claude, Gemini, and Perplexity the way voters, journalists, and policymakers actually do.",
    },
    {
      title: "See the narrative — and what’s driving it.",
      body: "Each snapshot shows the dominant framing across platforms, where opponents could exploit a gap, and the sources shaping every answer.",
    },
    {
      title: "Turn gaps into moves.",
      body: "Get specific, executable next-week actions: which sources to seed, where to pre-empt, what to brief.",
    },
  ];
  return (
    <section id="how-it-works" className="border-b border-border/80 bg-card/40">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            How it works
          </div>
          <h2 className="font-display text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[40px]">
            Built for narrative, not brand mentions.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-foreground/85">
            Most AI visibility tools count mentions.{" "}
            <span className="font-semibold text-foreground">byline</span>{" "}
            shows the story AI is telling about what you care about &mdash;
            and turns it into your next move.
          </p>
        </div>
        {/* Numbered vertical timeline. Each step is a 2-col grid row
            (number circle | title + body). A thin connecting line
            runs through the center of the number column on every
            step except the last, joining the circles into a
            continuous timeline. Number circles sit at z-10 so the
            line disappears behind them. */}
        <ol className="mx-auto max-w-3xl">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="relative grid grid-cols-[auto_1fr] gap-x-6 pb-12 last:pb-0"
            >
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[23px] top-12 bottom-0 w-px bg-border/80"
                />
              )}
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-background">
                <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-primary tabular-nums">
                  {i + 1}
                </span>
              </div>
              <div className="pt-2">
                <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
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
