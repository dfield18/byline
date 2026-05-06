# AI Search Visibility for Public Affairs — Product Specification

> A specification document capturing positioning, landing page copy, and prompt methodology for an AI search visibility tool focused on the public affairs / political market.

---

## 1. Overview

### What this is

A tool that monitors how AI search platforms (ChatGPT, Claude, Gemini, and eventually others) characterize political subjects — politicians, organizations, policies, contested issues, and significant events — and tells users what to do about it.

### Who it's for

Public affairs firms, advocacy organizations, lobbying organizations, political campaigns, in-house communications and policy teams, trade associations, and similar buyers. The tool is positioned as **neutral / dual-use** — it serves both sides of the political spectrum.

### Core differentiators

The tool sits in the same broad category as corporate AI brand visibility tools (Profound, Otterly, Athena, Goodie, Peec, Daydream, etc.), but it is differentiated from them in two foundational ways. Both should be treated as primary positioning pillars, surfaced consistently in marketing, methodology, and product surfaces.

**1. Purpose-built for political and public affairs use cases.**

Existing AI visibility tools are designed for corporate brand monitoring. They optimize for questions like "Is my brand showing up in the AI's consideration set when someone asks about CRM platforms?" — useful for a SaaS company, but a poor fit for the actual work of public affairs. Political and PA work is fundamentally about **narrative, framing, and contested positions**, not consideration-set inclusion. The questions that matter are:

- How is my issue being characterized — and is the AI's framing the same as mine, or my opposition's?
- Whose narrative is winning when this debate comes up?
- Which sources is the AI treating as authoritative on contested political questions?
- Are my opponents' talking points showing up in answers when mine aren't?
- Has the framing of this event hardened into a particular narrative — and which one?

This product is built for those questions. That shows up across the system in deliberate, non-cosmetic ways:

- **Five categories specifically chosen for political/PA work** (Person, Organization, Policy, Issue, Event) — each with framing dimensions tuned to the contested nature of political subjects, not adapted from a corporate-brand template.
- **The Issue category** — for tracking contested debates with multiple opposing positions — has no real analog in the corporate visibility tools, which assume a single brand vs. competitors. It's a first-class category here because issues, not products, are the unit of work in PA.
- **Asymmetry analysis between paired prompts** (arguments-for vs. arguments-against, position-favorable A vs. position-favorable B) is built into the methodology because political framing is about contested sides, not single-direction sentiment.
- **Source attribution and authority mapping** are central, not peripheral, because the question of *whose voice the AI treats as credible on a political topic* is one of the highest-stakes findings for PA buyers.
- **Recommendations are framed as political work** — sources to engage, framings to test, counter-narratives to build, talking-point gaps to fill — not as marketing optimization.

A corporate tool retrofitted for PA produces shallow, ill-fitting findings. This is the opposite of that.

**2. Prescriptive, not just descriptive.**

Most AI monitoring tools deliver dashboards. This one delivers recommendations: which sources to engage, which language to test, which counter-narratives to build, where the leverage actually is. Every analytical view in the product ends with a ranked, actionable recommendation, not just a chart.

The two differentiators reinforce each other. The political/PA focus determines *what* gets measured; the prescriptive layer determines *what to do* about it. Together they make the product genuinely different from the corporate-visibility category — not a clone with different example imagery, but a structurally different product for a structurally different buyer.

---

## 2. Locked Product Decisions

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Positioning | **Neutral / dual-use** | Serves both sides; balanced examples; professional voice. |
| 2 | Product type | **Tool, not service** | Sold as software with self-serve onboarding, not as an intelligence engagement. Pricing is tiered SaaS. |
| 3 | Prompt visibility | **Full public transparency** | Methodology page publishes the literal prompt set per category. |
| 4 | Custom prompts | **Defer to v1.5** | v1 ships with curated prompt sets only. |
| 5 | Comparative prompts | **Let AI pick comparator unprompted** | Issue category is the exception (positions are user-specified). |
| 6 | Issue positions in v1 | **Support 2+ positions from v1** | Schema flexible; UI supports multi-position. |
| 7 | Contextual domain input | **Required, LLM-auto-suggested with override** | User accepts or edits a system-generated suggestion at onboarding. |

### Implications worth being deliberate about

- **Full prompt transparency** means the prompt set is part of the public brand. Treat it as a versioned methodological artifact. Document changes publicly. Get the wording exactly right before launch.
- **Multi-position issue tracking from v1** means Issue is structurally more expensive than other categories (10–11+ named prompts vs. 8). Reflect this in pricing.
- **Auto-suggest at onboarding** means a small LLM call fires after subject + category selection to propose contextual domain (and other category-specific inputs). Users edit or accept.

---

## 3. Landing Page Specification

### Page structure

| Section | Purpose |
|---|---|
| 1. Hero | Establish the worldview |
| 2. Problem demonstrated | Show the AI's framing in real examples |
| 3. From signal to strategy | What you do with the product |
| 4. The dashboard that tells you what to do | Prescriptive differentiation |
| 5. How it works | Methodology and credibility |
| 6. Closing CTA | The free-audit activation |

---

### Section 1 — Hero

**Headline:**
> The most influential editor in politics doesn't have a byline.

**Subheadline:**
> Millions of Americans turn to AI for answers about politics, policy, and the people shaping it. See how ChatGPT, Claude, and Gemini frame your issue, whose narrative is breaking through, and shape the answer before your opponents do.

**Primary CTA:** *See my issue in the platform*
**Secondary CTA:** *Talk to the team*

**Voice notes:**
- The hero is magazine-toned, not SaaS-toned. Generous whitespace, single CTA emphasis, no dashboard screenshot above the fold.
- "Whose narrative is breaking through" replaced earlier drafts using "sources" — clearer to non-technical readers, more thematically coherent with "frame" and "shape the answer."

---

### Section 2 — Problem demonstrated

**Section headline:** *Here's what AI is telling people about your issue right now.*

**Structure:** Two or three real example tiles, each showing:
- The prompt a user might type (e.g., *"What are the arguments against [policy X]?"*)
- The actual AI answer (excerpted, with framing language highlighted)
- The sources it cited (logos or names)
- A one-line callout (e.g., *"Three of four sources lean one direction. The opposing view appears in a single sentence."*)

**Closing line:**
> *Most people asking these questions never see a second answer. They see this one.*

**Design notes:**
- Pick examples that are politically balanced — one where the left would feel under-represented, one where the right would, possibly one corporate/regulatory issue.
- Examples must be real (not mocked). The credibility of this section depends on the screenshots being authentic.

---

### Section 3 — From signal to strategy

**Section headline:** *From signal to strategy.*

**Three or four blocks, each a job-title verb headline + 2–3 sentences of concrete narrative:**

1. **Brief your principal before the meeting.**
   Walk into a strategy session knowing exactly how AI is currently framing your issue, which sources are driving that framing, and where the opening is. Pull a one-page narrative audit in the time it takes to grab coffee.

2. **Catch a narrative shift before it hardens.**
   Get alerted when AI answers about your issue start citing a new source, adopting new language, or tilting in a new direction. By the time it shows up in coverage, you've already drafted the response.

3. **Pressure-test your message.**
   Before you publish the op-ed, the explainer, or the press release, see whether the language and sources you're using are the ones the models already trust — and which would actually move the answer.

4. **Know what your opposition is winning.** *(optional fourth)*
   See which of your opponents' talking points are showing up in AI answers, which of yours aren't, and where you're losing ground in real time.

**Voice notes:**
- Asymmetric, conversational rhythm — not parallel-structured SaaS bullets.
- Each block names a real moment in a PA professional's week.

---

### Section 4 — The dashboard that tells you what to do

**Section headline:** *Most tools tell you what's happening. We tell you what to do.*

**Body:**
> Other AI monitoring platforms hand you charts and leave you to figure out the strategy. Ours doesn't. Every view in the product ends with a recommendation: which sources to engage, which language to adopt, which counter-narratives to build. Insight you can act on, not just look at.

**Pull quote / tagline:**
> *Insight is cheap. Direction is the product.*

**Design notes:**
- Recommendations must be issue-specific, not template-driven, ranked, and connected to actions the user can actually take.
- This section makes a promise the product has to keep — generic recommendations break the positioning.

---

### Section 5 — How it works

**Section headline options (pick one):**
- *Built on real measurement, not vibes.*
- *How we measure the answer.*

**Four blocks describing methodological choices in plain language:**

1. **Every major model, queried daily.**
   We run a curated set of prompts across ChatGPT, Claude, and Gemini every day — capturing not just what they say, but how their answers shift over time.

2. **Prompts that mirror real users.**
   Our questions are designed from real user behavior, not gamed for the dashboard. We measure what the AI tells *people*, not what we can get it to tell us.

3. **Framing scored, not guessed.**
   Each answer is scored across multiple dimensions — directional lean, source mix, descriptor tracking, talking-point penetration — using a consistent methodology applied identically to every subject.

4. **Sources, traced.**
   When a model cites or paraphrases a source, we identify it — building a real-time map of which voices the AI treats as authoritative on your issue.

**Link to:** `/methodology` — public page showing the literal prompt set per category, the rationale for each prompt, the named/unnamed split, and a versioning note.

---

### Section 6 — Closing CTA

**Closing headline:**
> The answer is being written right now.

**Body:**
> See what ChatGPT, Claude, and Gemini are saying about your issue — instantly, in the product. Free to start. No call required.

**Primary CTA:** *See my issue in the platform*
**Secondary line:** *Want to talk through what we'd build for your team? [Get in touch].*

**Trust band (below the CTA):**
- Logo strip: ChatGPT, Claude, Gemini, Perplexity, Grok (the platforms covered)
- Eventual: customer logos, press mentions
- Privacy note if relevant

---

## 4. Prompt System Specification

### Universal principles

These apply to every category and every prompt:

1. **Mirror real user behavior.** Prompts should look like what a curious, uninformed user types — not what a researcher would ask. Natural phrasing, no jargon, no leading questions.
2. **Cover multiple framing surfaces.** A single prompt produces one answer; the prompt set is designed to surface multiple framing dimensions (descriptive, evaluative, comparative, authority, prescriptive, adversarial).
3. **Don't lead the model.** Neutral phrasing produces the AI's actual default framing — which is what the tool measures.
4. **Hold prompts constant over time.** Trend tracking depends on asking the same question every time. Treat the prompt set as a published, versioned artifact.
5. **Vary phrasing across the set, not within it.** Different framing dimensions, not the same question reworded.
6. **Write prompts that scale across instances of the category.** Templates use `{variable}` placeholders.
7. **Roughly 8 named + 5 unnamed prompts per category.** 13 prompts per refresh cycle, identical across most categories for cost consistency.
8. **Avoid prompts that presuppose contested premises.** "What controversies has X been involved in?" presupposes controversies; "What are the main criticisms, controversies, or concerns about X?" allows for "none." Cleaner methodology, less hallucinated content.

### The two-layer architecture

Every category has two parallel prompt sets:

**Layer 1: Named prompts (8 per category)** — Measure framing depth. The subject's name appears explicitly in the prompt. Surface what the AI says when asked directly.

**Layer 2: Unnamed prompts (5 per category)** — Measure visibility and share of voice. The subject's name does NOT appear. Probe whether the subject organically surfaces in the broader topic neighborhood.

The two layers feed two distinct dashboard sections:
- **Visibility** (mention rate, share of voice, ranking position) — powered by unnamed prompts
- **Perception** (framing, sentiment, descriptors, sources cited) — powered by named prompts

### Categories

Five categories, each with a distinctive framing question:

| Category | Framing question |
|---|---|
| Person | How does the AI characterize this person — record, reputation, controversies, alignment, legitimacy? |
| Organization | How does the AI characterize this organization — mission, credibility, influence, alignment, track record? |
| Policy | How does the AI describe what this policy does, its effects, who supports/opposes, and the tradeoffs? |
| Issue | How does the AI characterize this contested topic — what frame dominates, whose narrative is centered? |
| Event | What happened, who's responsible, what does it mean, what's the lasting takeaway? |

---

### Category 1: Person

**Setup inputs:**

| Input | Description | Example |
|---|---|---|
| `{name}` | Person's name | Bernie Sanders |
| `{role}` | Primary public role | US Senator from Vermont |
| `{domain}` | Primary substantive area | progressive economic policy |
| `{audience}` | Audience whose perception matters most | the political left |
| `{contextual_domain}` | Neighborhood for unnamed prompts | progressive politicians in the US Senate |
| `{adjacent_position}` | Domain-level proxy for opposition framing | corporate influence in American politics |

**Layer 1: Named prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Descriptive baseline | Who is `{name}` and what are they known for? |
| 2 | Substantive record | What is `{name}`'s record on `{domain}`? |
| 3 | Adversarial / criticism | What are the main criticisms, controversies, or concerns about `{name}`? |
| 4 | Perception framing | How is `{name}` viewed by `{audience}`? |
| 5 | Network framing | Who are `{name}`'s allies and political opponents? |
| 6 | Comparative framing | How does `{name}` compare to similar political figures? |
| 7 | Adversarial defense test | What are the strongest criticisms of `{name}`? |
| 8 | Currency check | What is `{name}` currently focused on? |

**Layer 2: Unnamed prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Top-of-mind | Who are the most influential `{contextual_domain}` today? |
| 2 | Domain leadership | Who is leading on `{domain}` in the US right now? |
| 3 | Recommendation framing | Who should I follow to understand `{domain}`? |
| 4 | Authority framing | Who are the most trusted voices on `{domain}`? |
| 5 | Adjacent position | Who are the most prominent voices on `{adjacent_position}`? |

**Special notes:**
- The "currency check" prompt (#8) is unique to this category — surfaces whether the AI's view of the person is up to date.
- Comparative prompt #6 lets the AI pick the comparator unprompted.

---

### Category 2: Organization

**Setup inputs:**

| Input | Description | Example |
|---|---|---|
| `{name}` | Organization's name | Heritage Foundation |
| `{type}` | Kind of organization | conservative think tank |
| `{domain}` | Primary substantive area | conservative policy and governance |
| `{contextual_domain}` | Neighborhood for unnamed prompts | think tanks shaping conservative policy in the US |
| `{adjacent_domain}` | Broader domain for visibility framing | influential voices on US economic and social policy |

**Layer 1: Named prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Descriptive baseline | What is `{name}` and what does it do? |
| 2 | Orientation / interests | What is known about how `{name}` is funded and whose interests they represent? |
| 3 | Credibility framing | Is `{name}` considered credible and trustworthy? |
| 4 | Political alignment | How is `{name}` viewed politically — left, right, or neutral? |
| 5 | Substantive track record | What is `{name}`'s track record on `{domain}`? |
| 6 | Comparative framing | How does `{name}` compare to similar organizations? |
| 7 | Adversarial / criticism | What are the main criticisms, controversies, or concerns about `{name}`? |
| 8 | Influence framing | How influential is `{name}` and what kind of impact have they had? |

**Layer 2: Unnamed prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Top-of-mind | What are the most influential `{contextual_domain}` today? |
| 2 | Domain leadership | Which organizations are leading on `{domain}`? |
| 3 | Authority framing | Which think tanks or research organizations are most trusted on `{domain}`? |
| 4 | Recommendation framing | Which `{contextual_domain}` should journalists or policymakers pay attention to? |
| 5 | Adjacent visibility | Who are the major institutional voices in `{adjacent_domain}`? |

**Special notes:**
- High-priority extraction target: **descriptors** the AI attaches to the org ("nonpartisan," "industry-funded," "progressive," "grassroots").
- Disambiguation matters for orgs with generic or shared names ("Heritage," "Common Cause"). Use string match + LLM verification on ambiguous cases.

---

### Category 3: Policy

**Setup inputs:**

| Input | Description | Example |
|---|---|---|
| `{name}` | Policy's name | the Inflation Reduction Act |
| `{type}` | Kind of policy | federal legislation |
| `{domain}` | Substantive area | climate, healthcare, and tax policy |
| `{contextual_domain}` | Neighborhood for unnamed prompts | major US federal legislation on climate and healthcare |
| `{problem_addressed}` | Problem the policy addresses | climate change, drug pricing, and corporate tax avoidance |

**Layer 1: Named prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Descriptive baseline | What is `{name}` and what does it do? |
| 2 | Favorable case | What are the arguments in favor of `{name}`? |
| 3 | Adversarial case | What are the arguments against `{name}`? |
| 4 | Effects framing | What are the expected or actual effects of `{name}`? |
| 5 | Coalition framing | Who supports and who opposes `{name}`, and why? |
| 6 | Prescriptive framing (enacted) | Should `{name}` be expanded, scaled back, or repealed? |
| 6 | Prescriptive framing (proposed) | Should `{name}` be passed, rejected, or modified? |
| 7 | Comparative framing | How does `{name}` compare to alternative approaches? |
| 8 | Adversarial / criticism | What are the main criticisms or concerns about `{name}`? |

**Layer 2: Unnamed prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Top-of-mind | What are the most important pieces of `{contextual_domain}` in recent years? |
| 2 | Problem-driven | What policies have been proposed or enacted to address `{problem_addressed}`? |
| 3 | Effectiveness framing | Which policies have been most effective at addressing `{problem_addressed}`? |
| 4 | Authority framing | What do experts identify as the most consequential `{contextual_domain}`? |
| 5 | Adjacent visibility | What are the major laws shaping `{domain}` today? |

**Special notes:**
- Prompt #6 phrasing is **conditional on policy status**: enacted vs. proposed.
- Asking arguments-for and arguments-against in **separate prompts** (rather than combined) is critical — the asymmetry between the two responses is the core finding.
- High-priority extraction target: **terminology drift** — which name or framing the AI defaults to ("Inflation Reduction Act" vs. "Biden's spending bill" vs. "the climate and healthcare law").
- High-priority extraction target: **named entities in coalition responses** — supporters and opponents named by the AI. These feed the recommendation engine directly.

---

### Category 4: Issue / debate

**Setup inputs:**

| Input | Description | Example |
|---|---|---|
| `{name}` | Issue | AI regulation in the United States |
| `{position_a}` | One major position | strict government regulation of AI development |
| `{position_b}` | Opposing major position | a light-touch, innovation-first approach to AI |
| `{position_c}`, `{position_d}` | Optional additional positions | (varies) |
| `{domain}` | Substantive area | technology policy and AI governance |
| `{contextual_domain}` | Neighborhood for unnamed prompts | major debates in US technology policy |
| `{geography_or_scope}` | Optional scope qualifier | the United States |

**Layer 1: Named prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Descriptive baseline | What is the debate over `{name}` about? |
| 2 | Perspective mapping | What are the main perspectives on `{name}`? |
| 3 | Position-favorable A | What is the case for `{position_a}`? |
| 4 | Position-favorable B | What is the case for `{position_b}`? |
| 4+N | Position-favorable C, D, ... | What is the case for `{position_c}`? *(repeat per position)* |
| 5 | Authority framing | What do experts say about `{name}`? |
| 6 | Stakes framing | What's at stake in the debate over `{name}`? |
| 7 | Causal framing | What's driving the debate over `{name}` right now? |
| 8 | Prescriptive framing | What should be done about `{name}`? |

**Layer 2: Unnamed prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Top-of-mind | What are the most important `{contextual_domain}` today? |
| 2 | Pressing-debate framing | What are the most pressing policy debates in `{domain}`? |
| 3 | Domain controversy | What controversies are dominating `{domain}` in `{geography_or_scope}` right now? |
| 4 | Authority framing | Which debates in `{domain}` are most important according to experts? |
| 5 | Public concern framing | What are people most concerned about when it comes to `{domain}`? |

**Special notes:**
- This is the **only category where users must specify positions** at onboarding. The system suggests positions via LLM ("Common framings of this debate: A vs. B vs. C — pick or define your own"); user accepts or edits.
- Multi-position support from v1: 2 positions is the default, 3+ supported. Total prompts = 7 fixed + N positions = 9 to 11+ named prompts depending on position count.
- High-priority extraction target: **whether user-defined positions appear in the AI's perspective mapping** (prompt #2). If they don't, the AI's mental model of the debate doesn't match the user's preferred frame — a meaningful finding.
- High-priority extraction target: **labels the AI uses for the issue** in unnamed prompts (e.g., "AI regulation" vs. "AI safety" vs. "AI governance").

---

### Category 5: Event / moment

**Setup inputs:**

| Input | Description | Example |
|---|---|---|
| `{name}` | Event name or short description | the November 2023 firing of Sam Altman by the OpenAI board |
| `{date_or_period}` | When it happened | November 2023 |
| `{domain}` | Substantive area | AI industry governance and corporate leadership |
| `{contextual_domain}` | Neighborhood for unnamed prompts | major events in the AI industry |
| `{adjacent_period}` | Broader scope for visibility | tech industry controversies in recent years |

**Layer 1: Named prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Descriptive baseline | What happened with `{name}`? |
| 2 | Responsibility framing | Who is responsible for `{name}` and what role did each party play? |
| 3 | Causal framing | Why did `{name}` happen? |
| 4 | Evaluative framing | Was `{name}` handled well or poorly? |
| 5 | Consequence framing | What were the consequences of `{name}`? |
| 6 | Interpretive framing | How is `{name}` understood or remembered today? |
| 7 | Lessons framing | What lessons should be drawn from `{name}`? |
| 8 | Adversarial / criticism | What are the main criticisms or controversies surrounding `{name}`? |

**Layer 2: Unnamed prompts**

| # | Dimension | Template |
|---|---|---|
| 1 | Top-of-mind | What were the most significant `{contextual_domain}` in `{date_or_period}` and recently? |
| 2 | Domain-shaping | What events have most shaped `{domain}` in recent years? |
| 3 | Controversy framing | What are the biggest controversies that have happened in `{contextual_domain}`? |
| 4 | Authority framing | Which moments in `{domain}` do experts consider most consequential? |
| 5 | Adjacent visibility | What were the defining `{adjacent_period}`? |

**Special notes:**
- Events have a **strong temporal dimension**. The interpretive prompt (#6) asks how the event is *understood today*, while the descriptive prompt (#1) reflects the event itself. Comparing the two reveals **narrative drift** — one of the most distinctive findings this category produces.
- For very recent events, the AI may have no training data. Distinguish "the AI doesn't characterize this event" from "the AI cannot characterize this event because of training cutoff."
- Events should be **linkable** to other tracked subjects (Person, Organization) in the data model, even if v1 doesn't expose the linking in UI.

---

### Cross-category summary

| Category | Named | Unnamed | Total | Distinctive prompt |
|---|---|---|---|---|
| Person | 8 | 5 | 13 | Currency check (#8) |
| Organization | 8 | 5 | 13 | Influence framing (#8) |
| Policy | 8 | 5 | 13 | For/against split (#2 + #3) |
| Issue | 8+N | 5 | 13+N | Position-favorable split (#3 + #4 + …) |
| Event | 8 | 5 | 13 | Interpretive/temporal (#6) |

---

## 5. Onboarding Flow

When a user adds a new tracked subject:

1. **User enters subject name + selects category** (Person / Organization / Policy / Issue / Event).
2. **System runs an LLM-suggestion call** to propose category-specific inputs:
   - `{role}`, `{domain}`, `{audience}`, `{contextual_domain}`, etc.
   - For Issue: suggested `{position_a}`, `{position_b}`, optional `{position_c}`.
3. **User reviews and edits** the suggestions in editable form.
4. **System validates** (especially for Issue: are the positions distinct? do they oppose? are they articulated as positions and not vague labels?).
5. **Tracking begins.** First refresh runs immediately to populate the dashboard with current-state data.

The suggestion call is cheap (single Gemini Flash-Lite or similar) but UX matters — suggestions need to be good enough that users mostly accept them. Show users *why* the suggestion was made.

---

## 6. Architectural Commitments for Extensibility

The product will need ongoing edits after launch — landing page copy, prompt wording, new prompts, new categories, methodology adjustments, configuration changes. The architectural decisions below ensure these edits can happen without painful refactors. These should be treated as build constraints, not optional optimizations.

### Landing page: content separated from components

Landing page copy must NOT be hardcoded into Next.js components.

**Pattern:** All copy lives in markdown or MDX files in `/content/landing/` (or equivalent). Components accept content as props; content is loaded from the markdown files at build time.

**Section order:** The order in which sections render is data-driven via a config file (e.g., `/content/landing/page-config.json`). Reordering sections is a one-line edit, not a JSX restructure.

**Examples:**
- Hero component: takes `headline`, `subheadline`, `primaryCta`, `secondaryCta` as props.
- Three-block sections (e.g., "From signal to strategy"): take an array of blocks as a prop, rendered in order.
- Page composition: a top-level component reads the section list from config and renders each section in order.

**Rationale:** Editing copy frequently (testing headlines, swapping examples, updating CTAs) without a code deploy is critical. Markdown-in-repo gives version control on copy changes (e.g., A/B test history) while keeping the workflow lightweight. CMS adoption can come later if non-technical teammates start editing copy.

### Prompts: stored as versioned data, never hardcoded

Prompts must NOT be hardcoded in the query engine as string literals.

**Storage pattern:** Prompts live in a database table with the following schema:

```
prompts
├── id (primary key)
├── category (person | organization | policy | issue | event)
├── layer (named | unnamed)
├── position (the # within the category, e.g., 1-8 for named, 1-5 for unnamed)
├── dimension (label for the framing dimension, e.g., "descriptive baseline")
├── template (prompt text with {variable} placeholders)
├── version (semver, e.g., "1.0.0")
├── active (boolean — only one version per (category, layer, position) slot active at a time)
├── created_at
├── deprecated_at (when this version was retired, null if active)
└── retirement_reason (why it was changed)
```

**Query engine must be category-agnostic.** It takes a subject + category as input, looks up the active prompts for that category, fills template variables, runs queries. It has no hardcoded knowledge of what categories exist or what prompts they contain.

**Adding a new category** is a data operation: insert a new category enum value, insert 13 new prompt rows, expose the category in the onboarding UI's category selector. No query engine changes.

**Editing an existing prompt** is a data operation: insert a new prompt row with an incremented version, mark the old one inactive. The next refresh cycle uses the new prompt.

**Methodology version surfacing:** Every analysis output row is tagged with the prompt versions that produced it. When prompts change, the dashboard surfaces a visible marker on the timeline ("Methodology updated on [date] — comparisons across this line should be interpreted with caution"). This protects historical data integrity while allowing methodology evolution.

### Analysis methodology: versioned alongside the data

Analysis methodology (framing scoring, mention detection, source extraction) will evolve over time. Every analysis output must be tagged with the methodology version that produced it.

**Pattern:**
- Configurable parameters (scoring weights, descriptor lists, thresholds) live in a `scoring_config` database table with versioning, the same way prompts do.
- Algorithmic logic that must live in code is versioned via explicit semver tags applied to the results (`methodology_version` field on every analysis output row).
- When the methodology changes, the new version applies to new data. Historical data either stays under the old version or is re-analyzed with the new version (stored as a separate analysis pass).

**Why this matters:** Without methodology versioning, an algorithm change silently breaks all historical comparisons. With it, the dashboard can correctly flag where comparisons are valid and where they need an asterisk.

### Configuration: environment + database, not code

- **Environment variables** for things that change per environment: API keys, base refresh frequencies, debug flags, model endpoints.
- **Configuration database tables** for things that might change at runtime without a deploy: active model list per pricing tier, max subjects per plan, refresh cadence per tier.

**Rule of thumb:** Anything you might want to change without rebuilding the application is data, not code.

### Onboarding flow: modular and swappable

Onboarding must NOT be a monolithic single-page form.

**Pattern:** Each onboarding step is its own React component with a clean interface (takes data in, calls a callback when done). A parent component orchestrates the flow, choosing which steps to show in which order based on the selected category and user type.

**This enables:**
- Adding a new step (e.g., "specify additional positions for multi-position issues") without rewriting the whole flow
- Reordering steps
- Skipping steps for certain categories (e.g., the "specify positions" step is Issue-only)
- Swapping the LLM-suggestion logic without touching the form components

### What is and isn't editable without a deploy

| Edit type | Method | Requires deploy? |
|---|---|---|
| Landing page copy | Edit markdown files, push to git | Yes (fast, ~60s on Vercel) |
| Section order on landing page | Edit page-config.json, push to git | Yes (fast) |
| Add a prompt to an existing category | Insert row in `prompts` table | No |
| Edit a prompt's template wording | Insert new row in `prompts` table with incremented version, deactivate old | No |
| Add a new category | Insert prompt rows + expose category in onboarding selector | Onboarding selector requires deploy; rest is data |
| Change methodology scoring weight | Insert row in `scoring_config` table | No |
| Change refresh frequency for a tier | Edit configuration table | No |
| Add a new pricing tier | Configuration table + UI surfacing | UI requires deploy; config is data |
| Add a new onboarding step | Build new step component, register in flow orchestrator | Yes |
| Change LLM-suggestion logic | Edit suggestion service code | Yes |

The principle: anything that's expected to change frequently after launch is data; anything that's structurally about how the system works is code.

---

## 7. Build Phasing (Recommended)

**Phase 1: Audit, end-to-end, on a single hardcoded subject.**
Build the query engine, analysis layer, and static report output for one subject. No dashboard, no auth. Goal: validate that the audit is good.

**Phase 2: Self-serve audit on any subject.**
Add input flow, basic auth, email gating, the LLM-suggestion onboarding step. Audit delivered as a clean web report or PDF.

**Phase 3: Dashboard and ongoing tracking.**
Three views (Visibility, Perception, Recommendations). Historical tracking, daily refresh. The recommendation engine becomes a real component, not a placeholder.

**Phase 4: Alerts, exports, paid tier.**
Email digests, PDF exports, subscription billing. By now you should have real users telling you what they want.

**Phase 5: Everything else.**
More models (Perplexity, Grok), API access, team features, white-label. Driven by real user feedback.

---

## 8. Components Not Yet Specified

The following are mentioned but require their own dedicated specification before build:

- **Analysis layer** — How raw model responses become structured findings. Includes framing scoring methodology, source extraction, descriptor tracking, mention-rate detection (with disambiguation), terminology drift detection, and asymmetry analysis between paired prompts.
- **Recommendation engine** — How findings become ranked, actionable suggestions. Likely rules-based with LLM polish in v1; more sophisticated approaches in v1.5+.
- **Dashboard design** — Three views (Visibility, Perception, Recommendations) plus the audit report layout. Aesthetic reference: intelligence product (Bloomberg terminal, Morning Consult report), not marketing analytics dashboard.
- **Audit flow specifics** — The synchronous audit experience, what's in the free tier vs. paid, the loading state design, the PDF artifact.
- **Retention layer** — Email digests, alert design, multi-issue tracking, the recurring engagement features.
- **Pricing and packaging** — Tier structure, what's included at each tier, how Issue tracking is priced relative to other categories.

---

## 9. Reference: Stack and Operational Notes

These reflect the user's existing technical context and prior tooling decisions:

- **Models queried (v1):** ChatGPT, Claude, Gemini. Add Perplexity in v1.5; Grok later.
- **Refresh cadence:** Daily for tracked subjects. On-demand re-query available.
- **Cheap classifier for analysis layer:** Gemini Flash-Lite (cost-effective; user has prior experience with this pattern from earlier projects).
- **Storage:** Postgres on Railway. Keep raw model responses indefinitely (storage is cheap; re-analysis with new methodologies is a real edge).
- **Backend:** FastAPI.
- **Frontend:** Next.js / Vercel.
- **Methodology versioning:** Public `/methodology` page versioned (e.g., "Methodology v1.0, last updated [date]"). Document changes publicly.

---

## 10. Open Questions Logged for Future Decisions

- **Pricing model details** — Tier structure, per-subject vs. per-seat vs. per-issue pricing, how Issue category's higher cost is handled.
- **Free audit scope** — What's included in the free version vs. unlocked in paid (likely: free = current snapshot on one issue; paid = ongoing tracking, alerts, multi-issue, recommendations, exports).
- **Disambiguation logic for unnamed-prompt mention detection** — Specific approach for orgs and people with common or shared names.
- **Marketing channel: the public briefing** — A monthly or weekly newsletter using the product to comment on the current state of AI-generated political narrative. Strong fit for the user's existing writing strengths; treat as marketing infrastructure, not a v1 product feature.

---

*End of specification. This document captures the landing page positioning and copy, the five-category prompt system, and the locked product decisions as of the planning conversation. Subsequent specifications should cover the analysis layer, recommendation engine, dashboard, audit flow, and retention layer.*
