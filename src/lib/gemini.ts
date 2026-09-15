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
REAL websites containing a similar UI SECTION or design pattern. Queries
should describe structure (columns, tabs, cards, image/text placement,
section type), never brand names, colors, or exact copy. Vary the phrasing
and specificity across queries, e.g. "saas website tabbed feature section
text left image right", "website two column feature section product
screenshot", "landing page three tab navigation content switcher".`;

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
screenshots of candidate sections cropped from a real webpage, plus one
full-page screenshot of that same webpage as a fallback.

Judge similarity based PRIMARILY on structure:
- layout and column count
- component arrangement (tabs, cards, buttons, containers)
- spatial relationships (what's left/right/above/below what)
- image vs text positioning
- proportions and spacing
- visual hierarchy

Colors, fonts, logos, exact copy, and branding should have MUCH LESS
influence on the score. A rough wireframe should be able to score highly
against a polished, fully-branded website section if the underlying
structure matches. Do not penalize a candidate just because it uses
different colors or content than the reference.

Candidates are provided in order, each preceded by a label line
"Candidate N: <description>". The last one is always labeled "Full page
(fallback)".

Pick the single best-matching candidate. Respond with:
- bestCandidateIndex: the 0-based index of the best candidate (index of the
  first cropped candidate is 0; use the full-page fallback's index only if
  no cropped candidate is a reasonable structural match)
- similarityScore: 0-100, how structurally similar the best candidate is
- confidence: "High" if you are confident this is the actual matching
  section, "Medium" if it's a plausible but uncertain match, "Low" if it's
  a weak or purely coincidental match
- matchType: "exact" if the crop precisely isolates the matching section,
  "likely" if it's a good crop but may include extra surrounding content,
  "broader" if only a larger surrounding crop was reasonably similar,
  "fullpage" if only the full page (not a specific section) resembles the
  reference
- explanation: one or two sentences, written for a designer, naming the
  SPECIFIC structural similarities (e.g. "Both use a three-tab navigation
  with a two-column layout, text on the left and product imagery on the
  right.")`;

export async function compareCandidates(
  userImageBase64: string,
  userMimeType: string,
  candidates: { label: string; imageBase64: string; mimeType: string }[]
): Promise<ComparisonOutcome> {
  const parts: GeminiPart[] = [
    { text: COMPARE_PROMPT },
    { text: "Reference (user's submitted UI):" },
    { inlineData: { mimeType: userMimeType, data: userImageBase64 } },
  ];
  for (const c of candidates) {
    parts.push({ text: `Candidate ${candidates.indexOf(c)}: ${c.label}` });
    parts.push({ inlineData: { mimeType: c.mimeType, data: c.imageBase64 } });
  }
  return callGemini<ComparisonOutcome>(parts, COMPARE_SCHEMA);
}
