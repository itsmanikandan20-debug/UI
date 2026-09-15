import { requireEnv, GEMINI_MODEL } from "./env";
import type { ComparisonOutcome, UIAnalysis } from "./types";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_ATTEMPTS_PER_MODEL = 2;
const MAX_MODEL_CANDIDATES = 5;
const MODEL_LIST_TTL_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

// Models Google no longer supports (or that don't take images / structured
// JSON well) show up as 404s or garbage output — never guess a fixed model
// name. Ask Google which models this key can actually use, so a retired or
// overloaded default doesn't strand the whole app again.
async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${apiKey}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const models: GeminiModelInfo[] = data?.models || [];
  const names = models
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => !/embedding|tts|image-generation|live|aqa/i.test(n));

  const flash = names.filter((n) => /flash/i.test(n));
  const pro = names.filter((n) => /pro/i.test(n) && !flash.includes(n));
  const rest = names.filter((n) => !flash.includes(n) && !pro.includes(n));
  return [...new Set([...flash, ...pro, ...rest])];
}

let cachedModels: string[] | null = null;
let cachedModelsAt = 0;

async function resolveModelCandidates(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (!cachedModels || now - cachedModelsAt > MODEL_LIST_TTL_MS) {
    cachedModels = await fetchAvailableModels(apiKey).catch(() => []);
    cachedModelsAt = now;
  }
  const discovered = cachedModels.length > 0 ? cachedModels : [GEMINI_MODEL];

  // An explicit GEMINI_MODEL env var is tried first, but we still keep
  // discovered models queued behind it as a safety net.
  const override = process.env.GEMINI_MODEL;
  const ordered = override ? [override, ...discovered.filter((m) => m !== override)] : discovered;
  return ordered.slice(0, MAX_MODEL_CANDIDATES);
}

async function callGeminiModel<T>(
  model: string,
  apiKey: string,
  parts: GeminiPart[],
  schema: object
): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let lastError = "";
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
        },
      }),
    });

    if (res.ok) break;

    const body = await res.text().catch(() => "");
    lastError = `${model} failed (${res.status}): ${body.slice(0, 300)}`;
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS_PER_MODEL) {
      throw new Error(lastError);
    }
    // Google's own servers being temporarily overloaded (503) or rate
    // limits (429) are transient — back off and try again rather than
    // failing the whole run over a momentary blip.
    await sleep(2 ** attempt * 500 + Math.random() * 300);
  }

  if (!res || !res.ok) {
    throw new Error(lastError || `${model} request failed.`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(
      blockReason ? `Gemini blocked the request: ${blockReason}` : "Gemini returned no content."
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }
}

async function callGemini<T>(parts: GeminiPart[], schema: object): Promise<T> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const candidates = await resolveModelCandidates(apiKey);

  let lastError = "";
  for (const model of candidates) {
    try {
      return await callGeminiModel<T>(model, apiKey, parts, schema);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Try the next available model instead of failing the whole run.
    }
  }
  throw new Error(lastError || "All Gemini models are currently unavailable.");
}

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    sectionType: { type: "STRING" },
    description: { type: "STRING" },
    layout: {
      type: "OBJECT",
      properties: {
        columns: { type: "INTEGER" },
        alignment: { type: "STRING" },
        hasTabs: { type: "BOOLEAN" },
        tabCount: { type: "INTEGER" },
        hasCards: { type: "BOOLEAN" },
        cardCount: { type: "INTEGER" },
        hasButtons: { type: "BOOLEAN" },
        buttonCount: { type: "INTEGER" },
        hasImages: { type: "BOOLEAN" },
        imagePosition: { type: "STRING" },
        textPosition: { type: "STRING" },
        spacingDensity: { type: "STRING" },
        visualHierarchy: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: [
        "columns",
        "alignment",
        "hasTabs",
        "tabCount",
        "hasCards",
        "cardCount",
        "hasButtons",
        "buttonCount",
        "hasImages",
        "imagePosition",
        "textPosition",
        "spacingDensity",
        "visualHierarchy",
      ],
    },
    searchQueries: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["sectionType", "description", "layout", "searchQueries"],
};

const ANALYSIS_PROMPT = `You are a senior UI/UX designer analyzing a submitted UI reference. It may be a
low-fidelity wireframe, a hand-drawn sketch, a high-fidelity design, a Figma
export, or a real website screenshot — treat all of these the same way.

Describe the STRUCTURE of the design, not its branding. Ignore exact colors,
fonts, logos, and copy. Focus on:
- overall section type (e.g. hero, tabbed feature section, pricing table,
  testimonial grid, navbar, footer, form)
- layout structure and number of columns
- text and image positioning relative to each other
- tabs, cards, buttons, containers
- alignment and spacing density
- relative proportions and visual hierarchy
- how components relate to each other spatially

Then write a single, dense sentence that captures the structural pattern —
the kind a designer would use to search for similar real websites — for
example: "Tabbed feature section with three tabs, heading and description on
the left, product image on the right, and a CTA button below the
description."

Finally, generate 4 to 6 distinct web-search queries that would help find
REAL, LIVE product/company/marketing websites that happen to CONTAIN a
similar UI section — not pages that are ABOUT UI design.

Critical: never use words like "component", "UI kit", "template",
"blocks", "design system", "library", "snippet", or a specific framework
name (shadcn, tailwind, bootstrap, etc). Those words return component
catalogs and template marketplaces, not real businesses' live websites.
Instead, phrase each query the way someone would search for an actual
product or company by the KIND of site and section, e.g. "saas startup
homepage feature section with tabs", "fintech app landing page two
column screenshot section", "b2b software website product showcase with
image right", "ecommerce brand homepage tabbed content switcher". Mix in
different industries/company types (saas, ecommerce, fintech, healthcare,
consumer app, agency, marketplace) across the queries so results aren't
all from the same niche. Still describe structure (columns, tabs, cards,
image/text placement), never brand names, colors, or exact copy.`;

export async function analyzeUI(imageBase64: string, mimeType: string): Promise<UIAnalysis> {
  return callGemini<UIAnalysis>(
    [
      { text: ANALYSIS_PROMPT },
      { inlineData: { mimeType, data: imageBase64 } },
    ],
    ANALYSIS_SCHEMA
  );
}

const COMPARE_SCHEMA = {
  type: "OBJECT",
  properties: {
    bestCandidateIndex: { type: "INTEGER" },
    similarityScore: { type: "INTEGER" },
    confidence: { type: "STRING", enum: ["High", "Medium", "Low"] },
    explanation: { type: "STRING" },
    matchType: { type: "STRING", enum: ["exact", "likely", "broader", "fullpage"] },
  },
  required: ["bestCandidateIndex", "similarityScore", "confidence", "explanation", "matchType"],
};

const COMPARE_PROMPT = `You are comparing a user's submitted UI reference (first image) against
screenshots of INDIVIDUAL SECTIONS cropped from a real webpage, plus one
full-page screenshot of that same webpage included only as a last-resort
fallback. You are also given the structural analysis that was already
extracted from the reference — use it as ground truth for what to look for,
don't re-derive it from scratch.

Score using this checklist, roughly equally weighted unless one factor is
clearly dominant — go through each one explicitly before deciding:
1. Column count and arrangement (1 col vs 2 col vs 3+ col, symmetric vs
   asymmetric)
2. Tabs: present in both or neither, similar count
3. Cards: present in both or neither, similar count/arrangement
4. Buttons/CTAs: presence and rough position (inline vs standalone vs
   below content)
5. Image vs text position (left/right/above/below/none)
6. Spacing density and proportions (tight vs airy, roughly similar
   element sizing)
7. Overall visual hierarchy (what's most prominent, reading order)

STRICT RULES:
- Colors, fonts, logos, exact copy/wording, and branding must have
  essentially NO influence on the score.
- The webpage's general TOPIC, industry, or writing style/tone must have
  ZERO influence — a candidate about a totally different subject can still
  be a perfect structural match, and a candidate about a similar subject
  with different structure is NOT a good match. Judge the arrangement of
  boxes/tabs/columns/images on screen, not what the content is about.
- Prefer a cropped section candidate over the full-page fallback whenever
  ANY cropped candidate shares real structural similarity, even if
  imperfect. Only choose the full-page fallback when literally none of the
  cropped candidates resemble the reference's structure at all — this
  should be rare, not a default.
- Be honest about weak matches. If nothing here genuinely resembles the
  reference's structure, say so: use a low similarityScore (below 40) and
  confidence "Low" rather than inflating the score because you found the
  "least bad" option. A low-confidence, low-score result is a correct and
  expected answer when nothing matches well.

Candidates are provided in order, each preceded by a label line
"Candidate N: <description>". The last one is always labeled "Full page
(fallback)".

Respond with:
- bestCandidateIndex: the 0-based index of the best candidate (index of the
  first cropped candidate is 0)
- similarityScore: 0-100, how structurally similar the best candidate is,
  following the checklist and strict rules above
- confidence: "High" if you are confident this is the actual matching
  section, "Medium" if it's a plausible but uncertain match, "Low" if it's
  a weak or coincidental match
- matchType: "exact" if the crop precisely isolates the matching section,
  "likely" if it's a good crop but may include extra surrounding content,
  "broader" if only a larger surrounding crop was reasonably similar,
  "fullpage" if only the full page (not a specific section) resembles the
  reference
- explanation: one or two sentences, written for a designer, naming the
  SPECIFIC structural similarities or, for a weak match, specifically what
  doesn't line up (e.g. "Both use a three-tab navigation with a two-column
  layout, text on the left and product imagery on the right." or "No real
  match — this section is a single-column pricing table with no tabs or
  image, unlike the reference's tabbed two-column layout.")`;

export async function compareCandidates(
  userImageBase64: string,
  userMimeType: string,
  candidates: { label: string; imageBase64: string; mimeType: string }[],
  referenceAnalysis: UIAnalysis
): Promise<ComparisonOutcome> {
  const parts: GeminiPart[] = [
    { text: COMPARE_PROMPT },
    {
      text: `Reference's extracted structure (ground truth): ${JSON.stringify(referenceAnalysis)}`,
    },
    { text: "Reference (user's submitted UI):" },
    { inlineData: { mimeType: userMimeType, data: userImageBase64 } },
  ];
  for (const c of candidates) {
    parts.push({ text: `Candidate ${candidates.indexOf(c)}: ${c.label}` });
    parts.push({ inlineData: { mimeType: c.mimeType, data: c.imageBase64 } });
  }
  return callGemini<ComparisonOutcome>(parts, COMPARE_SCHEMA);
}
