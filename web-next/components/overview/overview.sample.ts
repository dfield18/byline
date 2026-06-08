import type { OverviewData } from "./OverviewDashboard";

/**
 * A fully-populated example payload matching `OverviewData`. Useful for Storybook,
 * visual tests, and the loading/empty states' parity. Not used in production
 * (the real adapter in ./adapt.ts maps the live SubjectOverview API).
 */
export const overviewSample: OverviewData = {
  subject: "J.D. Vance",
  category: "Politician",
  updatedLabel: "updated Jun 5, 2026",
  snapshotLabel: "Jun 5, 2026",
  comparedWith: "previous run 7 days earlier",
  comparisonLabel: "Change vs previous snapshot — May 29, 2026 (7 days earlier)",
  bottomLine:
    "Mentioned in 50% of AI answers — down 30 pp and now 4th of 5 tracked rivals — with neutral sentiment and a strong association to conservatism but no link yet to the post-Trump GOP storyline.",
  kpis: [
    { id: "mention", label: "mention rate", value: "50%", delta: "↓ 30 pp", deltaDirection: "down", spark: [66, 100, 66, 100, 100, 83, 83, 100, 50, 70, 80, 50], info: "Share of AI answers that mention this subject at all. Higher means the subject surfaces more often when these prompts are asked." },
    { id: "sentiment", label: "avg sentiment", value: "-0.04", delta: "↑ 2 pp", deltaDirection: "up", spark: [-0.1, -0.08, -0.12, -0.05, -0.06, -0.02, -0.09, -0.04, -0.07, -0.05, -0.06, -0.04], info: "Average tone of AI answers about this subject, scored from −1 (negative) to +1 (positive). Around 0 is neutral.", scale: { value: -0.04, min: -1, max: 1 } },
    { id: "risk", label: "risk framing", value: "0%", delta: "none detected", deltaDirection: "neutral", spark: [10, 8, 0, 5, 0, 0, 4, 0, 0, 0, 0, 0], info: "Share of answers that frame the subject around controversy, scandal, extremism, or reputational risk. Lower is better." },
    { id: "citation", label: "citation rate", value: "15%", delta: "↑ 10 pp", deltaDirection: "up", spark: [4, 5, 6, 5, 8, 7, 10, 9, 12, 11, 13, 15], info: "Share of AI answers that cite or link an external source when discussing this subject." },
  ],
  trendLabels: ["Mar 21", "Mar 28", "Apr 4", "Apr 11", "Apr 18", "Apr 25", "May 2", "May 9", "May 16", "May 23", "May 30", "Jun 5"],
  themes: [
    { id: "issues", label: "Issues", status: "surfaces on 3 of 5", sentiment: "neutral", trend: "flat" },
    { id: "recent-news", label: "Recent news", status: "high salience", sentiment: "mixed", trend: "up" },
    { id: "candidate", label: "Candidate", status: "rank #3", sentiment: "neutral", trend: "down" },
    { id: "race", label: "Race", status: "trails 2 rivals", sentiment: "critical", trend: "down" },
  ],
  mentionTrend: [
    { id: "vance", name: "J.D. Vance", isSubject: true, points: [66, 100, 66, 100, 100, 83, 83, 100, 50, 70, 80, 50] },
    { id: "trump", name: "Donald Trump", isSubject: false, points: [83, 100, 83, 100, 100, 50, 100, 100, 90, 80, 60, 90] },
    { id: "desantis", name: "Ron DeSantis", isSubject: false, points: [100, 83, 100, 100, 100, 100, 100, 100, 70, 60, 60, 80] },
  ],
  competitors: [
    { id: "trump", name: "Donald Trump", mentionRate: 90, avgRank: 2.8, topAnswerRate: 70, isSubject: false },
    { id: "desantis", name: "Ron DeSantis", mentionRate: 80, avgRank: 6.1, topAnswerRate: 0, isSubject: false },
    { id: "vance", name: "J.D. Vance", mentionRate: 50, avgRank: 1.8, topAnswerRate: 30, isSubject: true },
    { id: "ramaswamy", name: "Vivek Ramaswamy", mentionRate: 50, avgRank: 3.2, topAnswerRate: 0, isSubject: false },
    { id: "rubio", name: "Marco Rubio", mentionRate: 40, avgRank: 3.0, topAnswerRate: 0, isSubject: false },
  ],
  drivers: [
    { id: "conservatism", label: "Future of American conservatism", association: "strong" },
    { id: "populist", label: "Populist conservative policy", association: "moderate" },
    { id: "railway", label: "Railway safety", association: "weak" },
    { id: "fraud", label: "Fraud in government programs", association: "missing" },
    { id: "posttrump", label: "Post-Trump GOP", association: "missing" },
  ],
  coverage: {
    platforms: [
      { slug: "chatgpt", name: "ChatGPT" },
      { slug: "gemini", name: "Gemini" },
    ],
    rows: [
      {
        id: "conservatism",
        label: "Future of American conservatism",
        full: "Future of American conservatism",
        level: "strong",
        cells: [
          { slug: "chatgpt", mentioned: true, present: true, rank: 1, percentile: 100 },
          { slug: "gemini", mentioned: true, present: true, rank: 2, percentile: 80 },
        ],
      },
      {
        id: "populist",
        label: "Populist conservative policy",
        full: "Populist conservative policy",
        level: "moderate",
        cells: [
          { slug: "chatgpt", mentioned: true, present: true, rank: 3, percentile: 60 },
          { slug: "gemini", mentioned: false, present: true, rank: null, percentile: null },
        ],
      },
      {
        id: "posttrump",
        label: "Post-Trump GOP",
        full: "Post-Trump GOP",
        level: "missing",
        cells: [
          { slug: "chatgpt", mentioned: false, present: true, rank: null, percentile: null },
          { slug: "gemini", mentioned: false, present: false, rank: null, percentile: null },
        ],
      },
    ],
  },
  models: [
    {
      id: "gemini",
      name: "Gemini",
      summary:
        "J.D. Vance is an American politician, author, and venture capitalist who currently serves as the 50th Vice President of the United States in Donald Trump's second administration.",
      sentiment: "neutral",
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      summary:
        "J.D. Vance has moved from a conventional conservative/elite background toward an economic-nationalist, populist conservative posture: protectionist trade measures, tighter immigration, and selective pro-worker positions.",
      sentiment: "neutral",
    },
  ],
  sources: [
    { id: "news", label: "News", share: 64, count: 32 },
    { id: "reference", label: "Reference", share: 26, count: 13 },
    { id: "social", label: "Social Media", share: 10, count: 5 },
  ],
  topSources: [
    { id: "wikipedia.org", name: "Wikipedia", type: "Reference", citations: 11 },
    { id: "nytimes.com", name: "nytimes.com", type: "News", citations: 7 },
    { id: "politico.com", name: "politico.com", type: "News", citations: 6 },
    { id: "x.com", name: "x.com", type: "Social Media", citations: 5 },
    { id: "wsj.com", name: "wsj.com", type: "News", citations: 4 },
  ],
  sourceTotalLabel: "50 citations",
  recommendations: [
    {
      id: "oped",
      title: "Op-ed on GOP leadership",
      rationale:
        "AI fails to associate the Vice President with the topic 'Republican leaders shaping the post-Trump GOP', a significant visibility gap.",
      navigateTo: "candidate",
    },
    {
      id: "wiki",
      title: "Update Wikipedia page",
      rationale:
        "Wikipedia is the most influential source in the data, yet the dominant narrative cluster lacks specifics from his VP tenure.",
    },
    {
      id: "brief",
      title: "Issue brief on conservatism",
      rationale:
        "Reinforces the subject's strongest topic area by connecting it to recent, substantive anti-fraud work.",
      navigateTo: "issues",
    },
  ],
};
