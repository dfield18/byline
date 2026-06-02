"use client";

/**
 * Byline marketing landing page.
 *
 * PARITY PORT of byline-landing.html (the source of truth). Single client
 * component on purpose — no sub-component decomposition until parity is
 * confirmed. Class names and the IDs the script depends on (console,
 * lc-topic, lc-cursor, lc-cards, lc-verdict, lc-resume, hero-input) are
 * preserved exactly. Styles live in ./landing.css; fonts come from the
 * next/font Inter wired in app/layout.tsx.
 *
 * The hero "live narrative monitor" animation, FAQ accordion, and
 * scroll-reveal are ported verbatim from the original inline <script> into
 * the useEffect below — kept imperative, with full cleanup (cancel loops,
 * clear the kickoff timer, disconnect observers, remove listeners) so it is
 * StrictMode-safe and leak-free.
 *
 * Placeholders ([prior company], [N], [ logo ], etc.) and CTA href="#"
 * values are intentionally left in place — see the TODO comments and the
 * project brief. Do not fill or hide them here.
 */

import { useEffect, useRef } from "react";
import "./landing.css";

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ----- mock narrative data (illustrative; order: ChatGPT, Gemini, Perplexity) -----
    const TOPICS = [
      { q: "Donald Trump", m: [
        { sent: "mix", label: "MIXED",   text: "Emphasizes legal challenges and democratic risk." },
        { sent: "neu", label: "NEUTRAL", text: "Focuses on electoral influence and institutional conflict." },
        { sent: "neu", label: "NEUTRAL", text: "Highlights recent polling and court coverage." },
      ] },
      { q: "AI regulation", m: [
        { sent: "neu", label: "NEUTRAL",    text: "Frames it as safety versus innovation." },
        { sent: "pos", label: "SUPPORTIVE", text: "Leans toward the case for consumer guardrails." },
        { sent: "neu", label: "NEUTRAL",    text: "Lays out the current bills and state of play." },
      ] },
      { q: "inflation", m: [
        { sent: "neu", label: "NEUTRAL", text: "Attributes the trend to several drivers; assigns no blame." },
        { sent: "neu", label: "NEUTRAL", text: "Centers the Fed's response and policy mechanism." },
        { sent: "neu", label: "NEUTRAL", text: "Sticks closely to the latest sourced figures." },
      ] },
      { q: "James Talarico", m: [
        { sent: "pos", label: "SUPPORTIVE", text: "Leads with his education record; favorable tone." },
        { sent: "neu", label: "NEUTRAL",    text: "Straight biography; notes a rising national profile." },
        { sent: "neu", label: "NEUTRAL",    text: "Cites recent coverage and growing attention." },
      ] },
    ];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const topicEl = root.querySelector<HTMLElement>("#lc-topic");
    const cards = [...root.querySelectorAll<HTMLElement>("#lc-cards .lc-card")];
    const verdictEl = root.querySelector<HTMLElement>("#lc-verdict");
    const resumeBtn = root.querySelector<HTMLElement>("#lc-resume");
    const heroInput = root.querySelector<HTMLInputElement>("#hero-input");
    const askBtn = root.querySelector<HTMLElement>("#lc-ask-btn");
    const consoleEl = root.querySelector<HTMLElement>("#console");
    const SENT_COLORS: Record<string, string> = { pos: "#3f7d52", neu: "#8a7a4e", neg: "#a85248", mix: "#5d5a7c" };
    let runId = 0;

    if (!topicEl || !verdictEl || !resumeBtn || !heroInput) return;

    async function typeOut(el: HTMLElement, text: string, speed: number, id: number) {
      el.textContent = "";
      for (const ch of text) { if (id !== runId) return false; el.textContent += ch; await sleep(speed); }
      return true;
    }

    function resetCards() {
      cards.forEach((c) => {
        c.classList.remove("active", "done");
        const t = c.querySelector<HTMLElement>(".lc-text");
        if (t) t.textContent = "";
        const s = c.querySelector<HTMLElement>(".lc-sent");
        if (s) { s.className = "lc-sent"; s.textContent = ""; }
      });
      verdictEl!.className = "lc-verdict"; verdictEl!.innerHTML = "";
    }

    function showVerdict(m: { sent: string; label: string; text: string }[]) {
      const distinct = new Set(m.map((x) => x.label)).size;
      let lead: string, rest: string;
      if (distinct === 1) { lead = "Rare consensus —"; rest = "all three assistants frame it the same way."; }
      else if (distinct === 2) { lead = "Framing splits —"; rest = "the assistants divide into two camps."; }
      else { lead = "Three assistants —"; rest = "three different framings of the same question."; }
      const dots = m.map((x) => '<i style="background:' + SENT_COLORS[x.sent] + '"></i>').join("");
      verdictEl!.innerHTML = '<span class="dot3">' + dots + "</span><span><b>" + lead + "</b> " + rest + "</span>";
      verdictEl!.classList.add("show");
    }

    async function playTopic(t: { q: string; m: { sent: string; label: string; text: string }[] }, id: number) {
      resetCards();
      const ok = await typeOut(topicEl!, t.q, 52, id);
      if (!ok || id !== runId) return;
      await sleep(340); if (id !== runId) return;
      for (let i = 0; i < t.m.length; i++) {
        if (id !== runId) return;
        cards[i].classList.add("active");
        const textEl = cards[i].querySelector<HTMLElement>(".lc-text")!;
        textEl.innerHTML = '<span class="lc-dots"><i></i><i></i><i></i></span>';
        await sleep(480); if (id !== runId) return;
        await typeOut(textEl, t.m[i].text, 13, id);
        if (id !== runId) return;
        const sChip = cards[i].querySelector<HTMLElement>(".lc-sent")!;
        sChip.className = "lc-sent show " + t.m[i].sent; sChip.textContent = t.m[i].label;
        cards[i].classList.remove("active"); cards[i].classList.add("done");
        await sleep(120);
      }
      if (id !== runId) return;
      showVerdict(t.m);
    }

    let consoleVisible = true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let autoActive = false;

    async function autoLoop() {
      const id = ++runId;
      autoActive = true;
      resumeBtn!.classList.remove("show");
      heroInput!.value = "";
      let i = 0;
      while (id === runId) {
        while (id === runId && !consoleVisible) { await sleep(300); }
        if (id !== runId) return;
        await playTopic(TOPICS[i], id);
        if (id !== runId) return;
        await sleep(2800); if (id !== runId) return;
        i = (i + 1) % TOPICS.length;
      }
    }

    function askOwn() {
      const raw = (heroInput!.value || "").trim();
      if (!raw) return;
      const safe = raw.replace(/[<>]/g, "");
      const id = ++runId; // cancels the auto loop
      autoActive = false;
      const t = { q: safe, m: [
        { sent: "neu", label: "NEUTRAL", text: "Leads with background and current relevance." },
        { sent: "neu", label: "NEUTRAL", text: "Notes where opinion is most divided." },
        { sent: "neu", label: "NEUTRAL", text: "Aggregates current reporting with citations." },
      ] };
      playTopic(t, id).then(() => { if (id === runId) resumeBtn!.classList.add("show"); });
    }

    function resumeAuto() { autoLoop(); }

    function onHeroKeydown(e: KeyboardEvent) { if (e.key === "Enter") askOwn(); }

    function toggleFaq(btn: HTMLElement) {
      const item = btn.parentElement!;
      const ans = btn.nextElementSibling as HTMLElement;
      const isOpen = item.classList.contains("open");
      root!.querySelectorAll<HTMLElement>(".faq-item").forEach((i) => {
        i.classList.remove("open");
        const a = i.querySelector<HTMLElement>(".faq-a");
        if (a) a.style.maxHeight = "";
      });
      if (!isOpen) {
        item.classList.add("open");
        ans.style.maxHeight = ans.scrollHeight + "px";
      }
    }

    // ----- wire listeners -----
    heroInput.addEventListener("keydown", onHeroKeydown);
    askBtn?.addEventListener("click", askOwn);
    resumeBtn.addEventListener("click", resumeAuto);
    const faqButtons = [...root.querySelectorAll<HTMLElement>(".faq-q")];
    const faqHandlers = faqButtons.map((b) => {
      const h = () => toggleFaq(b);
      b.addEventListener("click", h);
      return h;
    });

    // pause/resume the auto demo as the console scrolls in and out of view
    let consoleObserver: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && consoleEl) {
      consoleObserver = new IntersectionObserver((entries) => {
        consoleVisible = entries[0].isIntersecting;
      }, { threshold: 0.25 });
      consoleObserver.observe(consoleEl);
    }

    // scroll reveal
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revealObserver.unobserve(en.target); } });
    }, { threshold: 0.12 });
    root.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

    // kick off once layout settles
    const kickoff = setTimeout(autoLoop, 500);

    return () => {
      runId++; // invalidate any running autoLoop / typeOut / playTopic
      clearTimeout(kickoff);
      consoleObserver?.disconnect();
      revealObserver.disconnect();
      heroInput.removeEventListener("keydown", onHeroKeydown);
      askBtn?.removeEventListener("click", askOwn);
      resumeBtn.removeEventListener("click", resumeAuto);
      faqButtons.forEach((b, idx) => b.removeEventListener("click", faqHandlers[idx]));
    };
  }, []);

  return (
    <div ref={rootRef}>
      {/* announcement bar */}
      <div className="topbar">
        <b>Now in open beta</b><span className="dot">·</span>Free to use, no account required
      </div>

      {/* nav */}
      <nav>
        <div className="wrap nav-inner">
          {/* TODO: point logo at the real home/app route once it exists */}
          <a className="logo" href="#"><span className="mark">B</span>Byline</a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#product">Product</a>
            <a href="#why">Why now</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            {/* in-page scroll anchor — keep */}
            <a href="#cta" className="btn btn-accent">Analyze your issue</a>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">AI narrative intelligence for public affairs</div>
          <h1>AI is shaping political narratives.<span className="line2">See how it frames your issue.</span></h1>

          {/* live console centerpiece */}
          <div className="console reveal" id="console">
            <div className="lc-head">
              <span className="lc-mark">B</span>
              <span className="dom">Live narrative monitor</span>
              <span className="lc-live"><span className="pulse"></span>LIVE</span>
            </div>

            <div className="lc-q"><span className="lead">What is AI saying about </span><span className="topic" id="lc-topic"></span><span className="cursor" id="lc-cursor"></span></div>

            <div className="lc-cards" id="lc-cards">
              <div className="lc-card"><div className="lg gpt"><svg viewBox="0 0 24 24"><path fill="#fff" d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">ChatGPT</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
              <div className="lc-card"><div className="lg gem"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">Gemini</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
              <div className="lc-card"><div className="lg pplx"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><circle cx="12" cy="12" r="8" /><path d="M12 4v16" strokeLinecap="round" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">Perplexity</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
            </div>

            <div className="lc-verdict" id="lc-verdict"></div>

            <div className="lc-foot">
              <div className="askrow">
                <span className="lbl">Try it — enter any issue, client, or public figure</span>
                <button className="resume" id="lc-resume">↻ Resume live demo</button>
              </div>
              <div className="lc-ask">
                <input id="hero-input" type="text" placeholder="Type a name or issue…" autoComplete="off" />
                <button className="btn btn-accent" id="lc-ask-btn">See the narrative</button>
              </div>
            </div>
          </div>

          <p className="subhead reveal">Byline tracks how the major AI assistants describe the people and issues you represent — and alerts you when the narrative shifts.</p>

        </div>
      </header>

      {/* audience strip */}
      <div className="strip">
        <div className="wrap">
          <div className="eg">Narrative intelligence built for <b>public affairs</b> — not brand marketing.</div>
          <div className="aud">
            <span>Government relations</span>
            <span>Advocacy organizations</span>
            <span>Campaigns &amp; PACs</span>
            <span>Corporate public affairs</span>
            <span>Communications agencies</span>
          </div>
        </div>
      </div>

      {/* credibility — TODO(user): fill [prior company]/[organization] + real logos, or hide this whole block */}
      <div className="cred">
        <div className="wrap reveal">
          <p className="cred-line">Built by analysts and engineers from <span className="ph">[prior company]</span>, <span className="ph">[prior company]</span>, and <span className="ph">[organization]</span> — people who&apos;ve worked inside political data, analytics, and communications.</p>
          <div className="cred-logos">
            <span>[ logo ]</span><span>[ logo ]</span><span>[ logo ]</span><span>[ logo ]</span>
          </div>
        </div>
      </div>

      {/* why now */}
      <section className="block why" id="why">
        <div className="wrap">
          <div className="center reveal">
            <div className="sec-tag">Why it matters now</div>
            <h2 className="sec-h">AI is the new front door to the internet.</h2>
          </div>

          <div className="stat-row">
            <div className="stat-card reveal">
              <div className="stat-num">50%</div>
              <p>of U.S. consumers now intentionally seek out AI answers — and <b>44%</b> of AI-search adopters prefer them to Google.</p>
              <a className="stat-src" href="https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/new-front-door-to-the-internet-winning-in-the-age-of-ai-search" target="_blank" rel="noopener">McKinsey · New Front Door to the Internet · Aug 2025 ↗</a>
            </div>
            <div className="stat-card reveal">
              <div className="stat-num">4×</div>
              <p>A brief AI chatbot conversation shifted voters&apos; views <b>4× more</b> than traditional political ads.</p>
              <a className="stat-src" href="https://www.technologyreview.com/2025/12/04/1128824/ai-chatbots-can-sway-voters-better-than-political-advertisements/" target="_blank" rel="noopener">Cornell-led studies, Nature &amp; Science · Dec 2025 ↗</a>
            </div>
          </div>

          <div className="why-grid">
            <div className="why-card reveal">
              <div className="k">Invisible</div>
              <h3>You can&apos;t manage what you can&apos;t see</h3>
              <p>Media monitoring tracks what&apos;s published. It doesn&apos;t tell you what a model says privately to one person at a time, millions of times a day.</p>
            </div>
            <div className="why-card reveal">
              <div className="k">Shifting</div>
              <h3>The framing changes without warning</h3>
              <p>A model update, a new source, a viral story — and overnight the narrative about your issue can turn. Most teams find out far too late.</p>
            </div>
            <div className="why-card reveal">
              <div className="k">Authoritative</div>
              <h3>People treat the answer as the truth</h3>
              <p>Unlike a search results page, an AI answer arrives as a single confident summary. Its framing carries unusual weight — and it&apos;s repeated at scale.</p>
            </div>
          </div>

          <p className="why-close reveal">AI search is becoming a persuasion channel — and most campaigns and advocacy teams <b>aren&apos;t monitoring it yet.</b></p>
        </div>
      </section>

      {/* how it works */}
      <section className="block" id="how">
        <div className="wrap">
          <div className="center reveal">
            <div className="sec-tag">How it works</div>
            <h2 className="sec-h">From &quot;I wonder what AI says&quot; to a daily read on the narrative.</h2>
          </div>
          <div className="steps">
            <div className="step reveal">
              <div className="num">1</div>
              <div className="step-body">
                <h3>Tell us what to watch</h3>
                <p>Add the people, issues, bills, and organizations you represent or monitor. Setup takes minutes.</p>
              </div>
            </div>
            <div className="step reveal">
              <div className="num">2</div>
              <div className="step-body">
                <h3>We ask the AI assistants</h3>
                <p>Byline queries ChatGPT, Gemini, and Claude daily with the questions real users ask — and captures exactly how each one responds.</p>
              </div>
            </div>
            <div className="step reveal">
              <div className="num">3</div>
              <div className="step-body">
                <h3>See framing, track shifts</h3>
                <p>Compare how each model frames your topic, watch sentiment move over time, and get alerted the moment the narrative turns.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* use cases */}
      <section className="block" id="use-cases" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="center reveal">
            <div className="sec-tag">Use cases</div>
            <h2 className="sec-h">What teams actually use Byline for.</h2>
          </div>
          <div className="use-grid">
            <div className="use-card reveal">
              <div className="uk">Before a hearing</div>
              <h3>Walk in knowing the narrative</h3>
              <p>Track how the assistants describe your client or principal in the days before testimony — and catch an unfavorable framing before the committee does.</p>
            </div>
            <div className="use-card reveal">
              <div className="uk">Around a key vote</div>
              <h3>See how a bill is being explained</h3>
              <p>Watch how AI summarizes a bill or ballot measure to the public, and spot where it&apos;s absorbing the opposition&apos;s talking points.</p>
            </div>
            <div className="use-card reveal">
              <div className="uk">Watching the other side</div>
              <h3>Track the opposition&apos;s framing</h3>
              <p>Monitor how the models describe your opponent or the other side&apos;s issue, and get ahead of a storyline as it starts to move.</p>
            </div>
          </div>
        </div>
      </section>

      {/* product / "screenshots" */}
      <section className="block" id="product" style={{ paddingTop: 14, paddingBottom: 96, borderTop: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginTop: 74 }}>
            <div className="sec-tag">The product</div>
            <h2 className="sec-h">Everything the models say about you — in one place.</h2>
          </div>

          {/* feature 1: framing comparison */}
          <div className="feature">
            <div className="feat-copy reveal">
              <h3>See exactly how each model frames your issue</h3>
              <p>Stop guessing. Byline shows you the literal framing each assistant uses — what it leads with, what it leaves out, and the tone it strikes.</p>
              <div className="bullets">
                <div>Side-by-side responses across ChatGPT, Gemini, and Claude</div>
                <div>Sentiment and emphasis scored on every answer</div>
                <div>The exact prompts behind each result, fully transparent</div>
              </div>
            </div>
            <div className="panel reveal">
              <div className="panel-head"><span className="tl"><span></span><span></span><span></span></span><span className="ttl">Issue: Carbon pricing — model framing</span></div>
              <div className="panel-body">
                <div className="row-model"><div className="m-logo gpt">G</div><div className="m-body"><div className="m-top"><span className="m-name">ChatGPT</span><span className="sent neu">NEUTRAL</span></div><div className="m-text">Leads with economic mechanism; notes bipartisan proposals; flags cost-of-living debate.</div></div></div>
                <div className="row-model"><div className="m-logo gem">G</div><div className="m-body"><div className="m-top"><span className="m-name">Gemini</span><span className="sent pos">SUPPORTIVE</span></div><div className="m-text">Frames as a leading climate tool; emphasizes economist consensus on efficiency.</div></div></div>
                <div className="row-model"><div className="m-logo cla">C</div><div className="m-body"><div className="m-top"><span className="m-name">Claude</span><span className="sent neu">NEUTRAL</span></div><div className="m-text">Balances projected emissions impact against regressive-burden criticism.</div></div></div>
              </div>
            </div>
          </div>

          {/* feature 2: chart + alert */}
          <div className="feature rev">
            <div className="panel reveal">
              <div className="panel-head"><span className="tl"><span></span><span></span><span></span></span><span className="ttl">Sentiment over time — your client</span></div>
              <div className="panel-body">
                <div className="chart">
                  <div className="grid-l" style={{ top: 0 }}></div>
                  <div className="grid-l" style={{ top: "50%" }}></div>
                  <div className="grid-l" style={{ bottom: 0 }}></div>
                  <svg viewBox="0 0 400 160" preserveAspectRatio="none">
                    <polyline fill="none" stroke="#3f7d52" strokeWidth="2.5"
                      points="0,52 50,46 100,55 150,42 200,60 250,72 300,108 350,124 400,132" />
                    <circle cx="300" cy="108" r="4.5" fill="#a85248" />
                    <circle cx="400" cy="132" r="4.5" fill="#a85248" />
                  </svg>
                </div>
                <div className="alert-card">
                  <div className="ico">!</div>
                  <div className="at"><b>Narrative shift detected.</b> In the last 8 days, Gemini moved from <b>neutral</b> to <b>critical</b> when describing your client&apos;s record on healthcare.</div>
                </div>
              </div>
            </div>
            <div className="feat-copy reveal">
              <h3>Catch the narrative turning — before it spreads</h3>
              <p>AI framing drifts quietly. Byline watches every day and pings you the moment sentiment moves, so you&apos;re never the last to know.</p>
              <div className="bullets">
                <div>Daily sentiment tracking across every model</div>
                <div>Automatic alerts when framing or emphasis shifts</div>
                <div>Pinpoint which model changed, and what changed</div>
              </div>
            </div>
          </div>

          {/* feature 3: spectrum */}
          <div className="feature">
            <div className="feat-copy reveal">
              <h3>Understand the framing, not just the score</h3>
              <p>Break any topic down by the themes the models emphasize — so your team knows where to push, correct the record, or get ahead of a storyline.</p>
              <div className="bullets">
                <div>Theme and talking-point breakdown per topic</div>
                <div>Source patterns the models lean on</div>
                <div>Export-ready briefs for principals and clients</div>
              </div>
            </div>
            <div className="panel reveal">
              <div className="panel-head"><span className="tl"><span></span><span></span><span></span></span><span className="ttl">Topic: &quot;AI regulation&quot; — emphasis breakdown</span></div>
              <div className="panel-body spec">
                <div><div className="lbl"><span>Consumer safety / risk</span><span>41%</span></div><div className="bar"><i style={{ width: "41%", background: "#16161a" }}></i></div></div>
                <div><div className="lbl"><span>Innovation / competitiveness</span><span>28%</span></div><div className="bar"><i style={{ width: "28%", background: "#6b6b73" }}></i></div></div>
                <div><div className="lbl"><span>Jobs / labor impact</span><span>19%</span></div><div className="bar"><i style={{ width: "19%", background: "#9a9aa2" }}></i></div></div>
                <div><div className="lbl"><span>National security</span><span>12%</span></div><div className="bar"><i style={{ width: "12%", background: "#c9c8bf" }}></i></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* what you get */}
      <section className="block" id="what-you-get" style={{ background: "var(--bg-sand)", paddingTop: 104, paddingBottom: 104, borderTop: "1px solid var(--line-strong)", borderBottom: "1px solid var(--line-strong)" }}>
        <div className="wrap">
          <div className="center reveal">
            <div className="sec-tag">What you get</div>
            <h2 className="sec-h">Byline does the reporting for you.</h2>
            <p className="sec-sub">Daily AI monitoring becomes finished deliverables — a brief, an alert, a dashboard, a report — that you forward straight to a principal or client.</p>
          </div>

          {/* featured: weekly brief */}
          <div className="get-featured reveal">
            <div className="gf-copy">
              <div className="gk">The flagship deliverable</div>
              <h3>A weekly narrative brief</h3>
              <p className="gd">A one-page read on how AI is framing your issues this week — written in plain language and ready to forward to a principal or client, every Monday morning.</p>
            </div>
            <div className="gf-mock">
              <div className="get-mock">
                <div className="gm-bar"><span className="gm-ic">B</span>Weekly Narrative Brief<span className="gm-meta">Mon, 8:00 AM</span></div>
                <div className="gm-body">
                  <div className="brief-h">Your watchlist this week</div>
                  <div className="brief-sub">4 topics · 4 assistants · 112 queries</div>
                  <div className="brief-line"><span className="bdot" style={{ background: "#a85248" }}></span><span><b>Your client</b> — framing turned more critical on healthcare across two models.</span></div>
                  <div className="brief-line"><span className="bdot" style={{ background: "#3f7d52" }}></span><span><b>Carbon pricing</b> — held neutral; economist-consensus framing strengthened.</span></div>
                  <div className="brief-line"><span className="bdot" style={{ background: "#8a7a4e" }}></span><span><b>The opposition</b> — picked up your counter-argument in 1 of 4 assistants.</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* supporting deliverables */}
          <div className="get-grid">

            {/* alert */}
            <div className="get-card reveal">
              <div className="gk">Deliverable</div>
              <h3>Real-time shift alerts</h3>
              <p className="gd">The moment the framing on a tracked topic moves, you get a push to email or Slack — before it spreads.</p>
              <div className="get-mock">
                <div className="gm-bar"><span className="gm-ic">B</span>Alert · #public-affairs<span className="gm-meta">just now</span></div>
                <div className="gm-body">
                  <div className="alert-mock">
                    <div className="ab">!</div>
                    <div className="at"><b>Narrative shift detected.</b> Gemini moved from <b>neutral</b> to <b>critical</b> when describing your client&apos;s record on healthcare.<span className="when">Detected 2 hours ago · view the prompt &amp; response →</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* dashboard */}
            <div className="get-card reveal">
              <div className="gk">Deliverable</div>
              <h3>A live shareable dashboard</h3>
              <p className="gd">A single link your whole team can open to see where every tracked topic stands, updated daily.</p>
              <div className="get-mock">
                <div className="gm-bar"><span className="gm-ic">B</span>Watchlist dashboard<span className="gm-meta">updated 2h ago</span></div>
                <div className="gm-body">
                  <div className="dash-row"><span className="dn">Your client</span><span className="dv"><span className="dash-pill neg">▼ Critical</span></span></div>
                  <div className="dash-row"><span className="dn">Carbon pricing</span><span className="dv"><span className="dash-pill neu">Neutral</span></span></div>
                  <div className="dash-row"><span className="dn">AI regulation</span><span className="dv"><span className="dash-pill neu">Stable</span></span></div>
                  <div className="dash-row"><span className="dn">The opposition</span><span className="dv"><span className="dash-pill pos">▲ Supportive</span></span></div>
                </div>
              </div>
            </div>

            {/* export */}
            <div className="get-card reveal">
              <div className="gk">Deliverable</div>
              <h3>Exportable reports &amp; raw data</h3>
              <p className="gd">Pull a polished report for a deck, or the underlying prompts and responses for your own analysis.</p>
              <div className="get-mock">
                <div className="gm-bar"><span className="gm-ic">B</span>Export<span className="gm-meta">3 formats</span></div>
                <div className="gm-body">
                  <div className="exp-row"><span className="exp-ic"></span><span className="en">Narrative report</span><span className="ef">PDF</span></div>
                  <div className="exp-row"><span className="exp-ic"></span><span className="en">Sentiment &amp; framing data</span><span className="ef">CSV</span></div>
                  <div className="exp-row"><span className="exp-ic"></span><span className="en">Prompts &amp; raw responses</span><span className="ef">JSON</span></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* methodology — TODO(user): fill [N] / cadence / scoring approach / methodology link */}
      <section className="block" id="methodology" style={{ background: "var(--bg)", borderTop: "1px solid var(--line-strong)", paddingTop: 104 }}>
        <div className="wrap">
          <div className="center reveal">
            <div className="sec-tag">Methodology</div>
            <h2 className="sec-h">How we measure — and why you can trust it.</h2>
            <p className="sec-sub">Byline is a measurement tool first. Here&apos;s exactly how the numbers are produced.</p>
          </div>
          <div className="method-grid">
            <div className="method-card reveal">
              <div className="mk"><i></i>Real questions</div>
              <p>We query each model with the questions real users actually ask about your topics — <span className="ph">[N]</span> prompts per topic, refined together with your team.</p>
            </div>
            <div className="method-card reveal">
              <div className="mk"><i></i>Daily cadence</div>
              <p>Every model is checked <span className="ph">[every day / every N hours]</span>, so you see the narrative move as it happens — not weeks later.</p>
            </div>
            <div className="method-card reveal">
              <div className="mk"><i></i>Transparent scoring</div>
              <p>Each response is scored for sentiment, emphasis, and the themes it leads with, using <span className="ph">[your scoring approach — e.g., a calibrated rubric checked against human labels]</span>.</p>
            </div>
            <div className="method-card reveal">
              <div className="mk"><i></i>Built to be verifiable</div>
              <p>We never treat a single answer as truth. You see patterns across repeated queries over time — and the <b>exact prompt and raw response</b> behind every data point.</p>
            </div>
          </div>
          <p className="method-note">Nonpartisan by design: the same neutral prompts are used across every topic, regardless of party or position. <span className="ph">[Add link to full methodology / data sourcing.]</span></p>
        </div>
      </section>

      {/* faq */}
      <section className="block" id="faq">
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 0 }}>
            <div className="sec-tag">Questions</div>
            <h2 className="sec-h">Everything you&apos;d want to ask.</h2>
          </div>
          <div className="faq-layout">
            <div className="faq-visual reveal">
              <div className="v-head">Live snapshot — your watchlist</div>
              <div className="v-body">
                <div className="mini-metric"><span className="mn">Your client</span><span className="mv"><span className="trend dn">▼ Critical</span></span></div>
                <div className="mini-metric"><span className="mn">Carbon pricing</span><span className="mv"><span className="trend up">▲ Neutral</span></span></div>
                <div className="mini-metric"><span className="mn">AI regulation</span><span className="mv">Stable</span></div>
                <div className="mini-metric"><span className="mn">The opposition</span><span className="mv"><span className="trend up">▲ Supportive</span></span></div>
                <div className="mini-metric"><span className="mn">Models tracked</span><span className="mv">3 · updated 2h ago</span></div>
              </div>
            </div>
            <div className="faq-list">
              <div className="faq-item">
                <button className="faq-q">How is this different from media monitoring like Meltwater or Cision?<span className="pm">+</span></button>
                <div className="faq-a"><p>Those tools track published media — articles, posts, broadcasts. Byline tracks what AI assistants say directly to users in private, one conversation at a time. It&apos;s a new surface that traditional monitoring can&apos;t see.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q">Which models do you track, and how often?<span className="pm">+</span></button>
                <div className="faq-a"><p>We query the leading consumer assistants — currently ChatGPT, Gemini, and Claude — on a daily cadence using the kinds of questions real users actually ask. Frequency and model coverage are expanding through the beta.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q">How do you handle hallucinations and reliability?<span className="pm">+</span></button>
                <div className="faq-a"><p>We don&apos;t treat any single answer as ground truth. Byline measures patterns across repeated queries and over time, and always shows you the exact prompt and raw response behind every data point so you can verify it yourself.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q">Is Byline partisan? Who can use it?<span className="pm">+</span></button>
                <div className="faq-a"><p>Byline is a neutral measurement tool. It&apos;s used across the political spectrum — by anyone who needs to understand how AI describes their issues, clients, or opponents. We don&apos;t editorialize the data.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q">What does &quot;beta&quot; mean, and will it stay free?<span className="pm">+</span></button>
                <div className="faq-a"><p>During the open beta, Byline is free to use with no account or payment required. We&apos;re refining the product with early users. Paid plans will come later — beta participants will get advance notice and preferred terms.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q">What about data privacy?<span className="pm">+</span></button>
                <div className="faq-a"><p>Your watchlists and what you track are private to your team. We query public-facing AI assistants with neutral prompts and never share what you&apos;re monitoring.</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* closing cta */}
      <section className="block cta" id="cta">
        <div className="wrap">
          <div className="cta-inner reveal">
            <h2 className="sec-h">See what AI is saying about your issue.</h2>
            <p className="sec-sub center">Enter an issue to compare how leading AI models frame it — and identify the narratives taking shape.</p>
            <div className="cta-actions">
              {/* TODO(user): point at the real app-entry / signup destination */}
              <a href="#" className="btn btn-accent btn-xl">Analyze your issue</a>
            </div>
            <div className="fine">Free during the beta · No account required · Nonpartisan by design</div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer>
        <div className="wrap">
          <div className="foot">
            <div>
              {/* TODO: point logo at the real home/app route once it exists */}
              <a className="logo" href="#"><span className="mark">B</span>Byline</a>
              <p>AI narrative intelligence for public affairs, advocacy, and campaigns.</p>
            </div>
            <div className="foot-links">
              <div className="foot-col">
                <h4>Product</h4>
                <a href="#how">How it works</a>
                <a href="#product">Features</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="foot-col">
                <h4>Company</h4>
                {/* TODO(user): real About / Contact pages */}
                <a href="#">About</a>
                <a href="#methodology">Methodology</a>
                <a href="#">Contact</a>
              </div>
              <div className="foot-col">
                <h4>Legal</h4>
                {/* TODO(user): real Privacy / Terms pages */}
                <a href="#">Privacy</a>
                <a href="#">Terms</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 Byline. All rights reserved.</span>
            <span>A neutral measurement tool. Not affiliated with any party, campaign, or AI provider.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
