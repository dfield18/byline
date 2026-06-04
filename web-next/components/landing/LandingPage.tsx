"use client";

/**
 * Byline marketing landing page.
 *
 * PARITY PORT of byline-landing.html (the source of truth). Single client
 * component on purpose — no sub-component decomposition until parity is
 * confirmed. Class names and the IDs the script depends on (console,
 * lc-topic, lc-cursor, lc-cards, lc-resume, hero-input) are
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

    // ----- mock narrative data (illustrative; order: ChatGPT, Claude, Gemini, Perplexity) -----
    const TOPICS = [
      { q: "Donald Trump", m: [
        { sent: "mix", label: "MIXED",   text: "Emphasizes legal challenges and democratic risk." },
        { sent: "neu", label: "NEUTRAL", text: "Lays out the competing legal and political interpretations side by side." },
        { sent: "neu", label: "NEUTRAL", text: "Focuses on electoral influence and institutional conflict." },
        { sent: "neu", label: "NEUTRAL", text: "Highlights recent polling and court coverage." },
      ] },
      { q: "AI regulation", m: [
        { sent: "neu", label: "NEUTRAL",    text: "Frames it as safety versus innovation." },
        { sent: "neu", label: "NEUTRAL",    text: "Maps the trade-offs between consumer guardrails and innovation." },
        { sent: "pos", label: "SUPPORTIVE", text: "Leans toward the case for consumer guardrails." },
        { sent: "neu", label: "NEUTRAL",    text: "Lays out the current bills and state of play." },
      ] },
      { q: "inflation", m: [
        { sent: "neu", label: "NEUTRAL", text: "Attributes the trend to several drivers; assigns no blame." },
        { sent: "neu", label: "NEUTRAL", text: "Distinguishes cyclical from structural causes." },
        { sent: "neu", label: "NEUTRAL", text: "Centers the Fed's response and policy mechanism." },
        { sent: "neu", label: "NEUTRAL", text: "Sticks closely to the latest sourced figures." },
      ] },
      { q: "James Talarico", m: [
        { sent: "pos", label: "SUPPORTIVE", text: "Leads with his education record; favorable tone." },
        { sent: "neu", label: "NEUTRAL",    text: "Gives a balanced read of his record and rising profile." },
        { sent: "neu", label: "NEUTRAL",    text: "Straight biography; notes a rising national profile." },
        { sent: "neu", label: "NEUTRAL",    text: "Cites recent coverage and growing attention." },
      ] },
    ];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const topicEl = root.querySelector<HTMLElement>("#lc-topic");
    const cards = [...root.querySelectorAll<HTMLElement>("#lc-cards .lc-card")];
    const resumeBtn = root.querySelector<HTMLElement>("#lc-resume");
    const heroInput = root.querySelector<HTMLInputElement>("#hero-input");
    const askBtn = root.querySelector<HTMLButtonElement>("#lc-ask-btn");
    const consoleEl = root.querySelector<HTMLElement>("#console");
    const nextEl = root.querySelector<HTMLElement>("#lc-next");
    const askLbl = root.querySelector<HTMLElement>(".askrow .lbl");
    const askLblDefault = askLbl?.textContent ?? "";
    let runId = 0;

    if (!topicEl || !resumeBtn || !heroInput) return;

    async function typeOut(el: HTMLElement, text: string, speed: number, id: number) {
      el.textContent = "";
      for (const ch of text) { if (id !== runId) return false; el.textContent += ch; await sleep(speed); }
      return true;
    }

    function resetCards() {
      cards.forEach((c) => {
        c.classList.remove("active", "done", "muted");
        const t = c.querySelector<HTMLElement>(".lc-text");
        if (t) t.textContent = "";
        const s = c.querySelector<HTMLElement>(".lc-sent");
        if (s) { s.className = "lc-sent"; s.textContent = ""; }
      });
      if (nextEl) nextEl.classList.remove("show");
    }

    // ----- real-run helpers (the user-submitted path hits the live API) -----
    // Card order in the markup: ChatGPT, Claude, Gemini, Perplexity.
    const CARD_INDEX: Record<string, number> = { chatgpt: 0, claude: 1, gemini: 2, perplexity: 3 };

    function sentChip(v: number | null): { cls: string; label: string } | null {
      if (v === null || v === undefined) return null;
      if (v > 0.1) return { cls: "pos", label: "SUPPORTIVE" };
      if (v < -0.1) return { cls: "neg", label: "CRITICAL" };
      return { cls: "neu", label: "NEUTRAL" };
    }

    // First sentence of the real response, capped — the card is a single line.
    function excerpt(text: string): string {
      const clean = (text || "").replace(/\s+/g, " ").trim();
      if (!clean) return "";
      const m = clean.match(/^.*?[.!?](\s|$)/);
      let s = m ? m[0].trim() : clean;
      if (s.length > 140) s = s.slice(0, 137).trimEnd() + "…";
      return s;
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
        // brief "up next" loader during the pause so the cycle reads as
        // moving on to the next topic
        if (nextEl) nextEl.classList.add("show");
        await sleep(2800); if (id !== runId) return;
        if (nextEl) nextEl.classList.remove("show");
        i = (i + 1) % TOPICS.length;
      }
    }

    function setLbl(text: string, isErr: boolean) {
      if (!askLbl) return;
      askLbl.textContent = text;
      askLbl.classList.toggle("err", isErr);
    }

    // Real run: type the topic, put every card into a loading state, then call
    // the public demo endpoint and fill each card with the model's real
    // sentiment + a one-line excerpt of its actual answer. Models without a
    // key (no result returned) collapse to a muted "Live soon" card.
    async function askOwn() {
      const raw = (heroInput!.value || "").trim();
      if (!raw) return;
      const safe = raw.replace(/[<>]/g, "").slice(0, 80);
      const id = ++runId; // cancels the auto loop
      autoActive = false;
      if (askBtn) askBtn.disabled = true;
      resumeBtn!.classList.remove("show");

      resetCards();
      const typed = await typeOut(topicEl!, safe, 46, id);
      if (!typed || id !== runId) { if (askBtn) askBtn.disabled = false; return; }

      // every card → loading
      cards.forEach((c) => {
        c.classList.add("active");
        c.classList.remove("done", "muted");
        const t = c.querySelector<HTMLElement>(".lc-text");
        if (t) t.innerHTML = '<span class="lc-dots"><i></i><i></i><i></i></span>';
        const s = c.querySelector<HTMLElement>(".lc-sent");
        if (s) { s.className = "lc-sent"; s.textContent = ""; }
      });
      // A ticking elapsed counter so the wait reads as "working", not frozen —
      // grounded model calls take ~10-15s and the cards otherwise just sit on
      // dots. Cleared on every exit path below.
      let elapsed = 0;
      setLbl("Reading live results across models… 0s", false);
      const ticker = window.setInterval(() => {
        if (id !== runId) return;
        elapsed += 1;
        setLbl(`Reading live results across models… ${elapsed}s`, false);
      }, 1000);

      type DemoResult = {
        model: string; response: string | null; sentiment: number | null;
        subject_mentioned: boolean | null; mention_rank: number | null;
        grounded: boolean; error: string | null;
      };
      let results: DemoResult[];
      try {
        const res = await fetch("/api/demo/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: safe }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "The live demo is unavailable right now.");
        results = (payload?.results ?? []) as DemoResult[];
      } catch (err) {
        window.clearInterval(ticker);
        if (id !== runId) return;
        resetCards();
        setLbl(err instanceof Error ? err.message : String(err), true);
        if (askBtn) askBtn.disabled = false;
        resumeBtn!.classList.add("show");
        return;
      }
      window.clearInterval(ticker);
      if (id !== runId) { if (askBtn) askBtn.disabled = false; return; }

      setLbl(askLblDefault, false);
      const byModel: Record<string, DemoResult> = {};
      for (const r of results) byModel[r.model] = r;

      for (let i = 0; i < cards.length; i++) {
        if (id !== runId) return;
        const slug = Object.keys(CARD_INDEX).find((k) => CARD_INDEX[k] === i);
        const r = slug ? byModel[slug] : undefined;
        const card = cards[i];
        const textEl = card.querySelector<HTMLElement>(".lc-text")!;
        const sChip = card.querySelector<HTMLElement>(".lc-sent")!;

        if (!r || r.error || !r.response) {
          // model not part of this demo (no key yet) — muted placeholder
          card.classList.remove("active");
          card.classList.add("done", "muted");
          textEl.textContent = "Live soon";
          sChip.className = "lc-sent"; sChip.textContent = "";
          continue;
        }

        card.classList.add("active");
        card.classList.remove("muted");
        const ok = await typeOut(textEl, excerpt(r.response), 11, id);
        if (!ok || id !== runId) return;
        const chip = sentChip(r.sentiment);
        if (chip) { sChip.className = "lc-sent show " + chip.cls; sChip.textContent = chip.label; }
        card.classList.remove("active");
        card.classList.add("done");
        await sleep(120);
      }

      if (askBtn) askBtn.disabled = false;
      if (id === runId) resumeBtn!.classList.add("show");
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
        <span className="beta-pulse" aria-hidden></span><b>Now in open beta</b><span className="dot">·</span>Free to use, no account required
      </div>

      {/* nav */}
      <nav>
        <div className="wrap nav-inner">
          {/* TODO: point logo at the real home/app route once it exists */}
          <a className="logo" href="/"><span className="mark">B</span>Byline</a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#product">Product</a>
            <a href="#why">Why now</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-right">
            {/* in-page scroll anchor — keep */}
            <a href="#cta" className="btn btn-ghost">Get started</a>
          </div>
        </div>
      </nav>

      {/* masthead hairline — content-width editorial rule under the nav */}
      <div className="masthead-rule"><div className="wrap"></div></div>

      {/* hero */}
      <header className="hero">
        <div className="wrap">
          <div className="eyebrow">AI narrative intelligence for public affairs</div>
          <h1>AI is shaping<br />public narratives.</h1>
          <p className="hero-deck">See how it <span className="accent-word">frames</span> your issue.</p>

          <div className="hero-cta">
            {/* in-page scroll anchor — matches the nav target */}
            <a href="#cta" className="btn btn-accent btn-lg">Analyze your narrative</a>
          </div>

          {/* live console centerpiece */}
          <div className="console reveal" id="console">
            <div className="lc-head">
              <span className="lc-mark">B</span>
              <span className="dom">Cross-model readout</span>
              <span className="lc-updated"><span className="lc-updated-dot" aria-hidden></span>Updated 2m ago</span>
            </div>

            <div className="lc-q"><span className="lead">What is AI saying about </span><span className="topic" id="lc-topic"></span><span className="cursor" id="lc-cursor"></span></div>

            <div className="lc-cards" id="lc-cards">
              <div className="lc-card"><div className="lg gpt"><svg viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">ChatGPT</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
              <div className="lc-card"><div className="lg cla"><svg viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">Claude</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
              <div className="lc-card"><div className="lg gem"><svg viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">Gemini</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
              <div className="lc-card"><div className="lg pplx"><svg viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z" /></svg></div><div className="bd"><div className="nm-row"><span className="nm">Perplexity</span><span className="lc-sent"></span></div><div className="lc-text"></div></div></div>
            </div>

            <div className="lc-next" id="lc-next" aria-hidden>
              <span className="lc-next-lbl">Up next</span>
              <span className="lc-dots"><i></i><i></i><i></i></span>
            </div>

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

        </div>
      </header>

      {/* differentiator strip — the audience pills moved down to Use cases */}
      <div className="strip">
        <div className="wrap">
          <div className="eg" style={{ marginBottom: 0 }}>Narrative intelligence built for <b>public affairs</b> — not brand marketing.</div>
        </div>
      </div>

      {/* monitored assistants — coverage strip (was the founder-credibility
          placeholder; repurposed to show which models Byline reads) */}
      <div className="cred">
        <div className="wrap reveal">
          <p className="cred-line">Byline reads what every major AI assistant says — side by side, on any issue.</p>
          <div className="cred-logos">
            <span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" /></svg>ChatGPT</span>
            <span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" /></svg>Gemini</span>
            <span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z" /></svg>Perplexity</span>
            <span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" /></svg>Claude</span>
          </div>
        </div>
      </div>

      {/* brand thesis — serif pull-quote, lead-in to the stakes */}
      <section className="thesis">
        <div className="wrap">
          <p className="thesis-line">The most influential editor in politics doesn&rsquo;t have a <span className="accent-word">byline</span>.</p>
        </div>
      </section>

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
                <p>Add the people, issues, bills, and organizations you represent or monitor.</p>
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
            <div className="aud" style={{ marginTop: 24 }}>
              <span>Government relations</span>
              <span>Advocacy organizations</span>
              <span>Campaigns &amp; PACs</span>
              <span>Corporate public affairs</span>
              <span>Communications agencies</span>
            </div>
          </div>
          <div className="use-grid">
            <div className="use-card reveal">
              <div className="uk">Before a hearing</div>
              <h3>Walk in knowing the narrative</h3>
              <p>Track how the leading models describe your client or principal in the days before testimony — and catch an unfavorable framing before the committee does.</p>
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
              <div className="v-head">Snapshot — your watchlist</div>
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
              <a href="#" className="btn btn-accent btn-xl">Analyze your narrative</a>
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
              <a className="logo" href="/"><span className="mark">B</span>Byline</a>
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
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
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
