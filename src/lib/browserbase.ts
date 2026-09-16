import { chromium, type Page } from "playwright-core";
import { requireEnv } from "./env";
import type { LayoutAnalysis, SectionCandidate } from "./types";

type TargetLayout = Pick<LayoutAnalysis, "hasTabs" | "hasCards" | "hasButtons" | "hasImages" | "columns">;

interface BrowserbaseSession {
  id: string;
  connectUrl?: string;
}

async function createSession(): Promise<BrowserbaseSession> {
  const apiKey = requireEnv("BROWSERBASE_API_KEY");
  const projectId = requireEnv("BROWSERBASE_PROJECT_ID");

  const res = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-BB-API-Key": apiKey,
    },
    body: JSON.stringify({
      projectId,
      browserSettings: { viewport: { width: 1440, height: 900 } },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Browserbase rejected the request (${res.status}). Double-check BROWSERBASE_API_KEY and ` +
          `BROWSERBASE_PROJECT_ID in your environment variables — this usually means the key is ` +
          `wrong/missing, or the two values got swapped. Raw response: ${body.slice(0, 200)}`
      );
    }
    throw new Error(`Browserbase session create failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  return { id: data.id, connectUrl: data.connectUrl };
}

interface RawSection {
  top: number;
  left: number;
  width: number;
  height: number;
  imgCount: number;
  btnCount: number;
  tabLike: number;
  cardLike: number;
  headingCount: number;
  columnGroups: number;
  tag: string;
  /** Trimmed text sample (heading text if present, else the section's own
   * leading text) — the semantic signal used to match against keyText. */
  text: string;
}

interface RawScanResult {
  sections: RawSection[];
  documentHeight: number;
}

// Runs inside the remote page. No closures over outer scope allowed —
// Playwright serializes this function and executes it in the browser.
function findCandidateSections(): RawScanResult {
  const vw = window.innerWidth;
  const documentHeight = document.documentElement.scrollHeight;
  const seen = new Set<string>();
  const out: RawSection[] = [];
  // Prefer actual page sections (<section>, direct children of <main>/
  // <body>) over arbitrary nested divs — those correspond much more
  // reliably to a real, isolated "section" a designer would recognize,
  // rather than an inner wrapper or a whole multi-section container.
  const selector =
    'section, header, footer, article, [role="tabpanel"], [role="tablist"], ' +
    'main > div, main > section, body > div > main > div, body > div > div';

  document.querySelectorAll(selector).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.35 || r.width < 280) return;
    if (r.height < 100 || r.height > 1400) return;
    // A "section" spanning most of the page's total height is really the
    // whole page's content wrapper, not an isolated section — skip it so
    // it doesn't crowd out real candidates (the full page is captured
    // separately as the explicit fallback).
    if (r.height > documentHeight * 0.6) return;

    const top = Math.round(r.top + window.scrollY);
    const left = Math.round(Math.max(0, r.left + window.scrollX));
    const width = Math.round(r.width);
    const height = Math.round(r.height);
    const key = `${top},${left},${width},${height}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Rough column count: group this section's direct children into
    // horizontal bands by their left edge to approximate a layout's
    // column structure without needing full CSS layout introspection.
    const children = Array.from(el.children) as HTMLElement[];
    const lefts = children
      .map((c) => Math.round(c.getBoundingClientRect().left / 40))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    const heading = el.querySelector("h1,h2,h3,h4");
    const textSample = (heading?.textContent || el.textContent || "").trim().slice(0, 200);

    out.push({
      top,
      left,
      width,
      height,
      imgCount: el.querySelectorAll('img, svg, picture, [style*="background-image"]').length,
      btnCount: el.querySelectorAll('button, a[class*="btn" i], [role="button"]').length,
      tabLike: el.querySelectorAll('[role="tab"], [class*="tab" i]').length,
      cardLike: el.querySelectorAll('[class*="card" i]').length,
      headingCount: el.querySelectorAll("h1,h2,h3,h4").length,
      columnGroups: Math.max(1, Math.min(lefts.length, 6)),
      tag: el.tagName.toLowerCase(),
      text: textSample,
    });
  });

  return { sections: out.slice(0, 60), documentHeight };
}

function structureScore(s: RawSection): number {
  return s.imgCount + s.btnCount * 1.5 + s.tabLike * 2 + s.cardLike * 1.5 + s.headingCount;
}

/** How well this raw DOM section's detected features match what the
 * user's submitted UI was analyzed to contain — grounds candidate
 * selection in the actual target structure, not just generic richness.
 * Symmetric: a candidate is rewarded for having what the target has, but
 * also penalized for having extra structure the target DOESN'T have —
 * otherwise a busy, feature-rich section (a hero with tabs/buttons/cards)
 * always out-scores the correct-but-plain section on raw richness alone,
 * even when the target is something simple like a quote + photo block. */
function featureMatchBonus(s: RawSection, target?: TargetLayout): number {
  if (!target) return 0;
  let bonus = 0;
  bonus += target.hasTabs ? (s.tabLike > 0 ? 4 : -2) : s.tabLike > 0 ? -2.5 : 0;
  bonus += target.hasCards ? (s.cardLike > 0 ? 3 : -1) : s.cardLike > 0 ? -1.5 : 0;
  bonus += target.hasButtons ? (s.btnCount > 0 ? 1.5 : 0) : s.btnCount > 0 ? -1 : 0;
  bonus += target.hasImages ? (s.imgCount > 0 ? 1.5 : -1) : s.imgCount > 0 ? -0.5 : 0;
  bonus += target.columns >= 2 ? (s.columnGroups >= 2 ? 2 : -1) : s.columnGroups >= 2 ? -1 : 0;
  return bonus;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with", "our", "your", "we", "is", "are",
]);

function significantWords(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Semantic match between this section's heading/text and the reference's
 * keyText phrases — a strong, direct signal (real sites frequently reuse
 * near-identical headings for common section types like "Meet the
 * Founder" or "Case Studies"), so it's weighted heavily enough to win
 * over pure structural richness when present. */
function textMatchBonus(s: RawSection, keyText?: string[]): number {
  if (!keyText || keyText.length === 0 || !s.text) return 0;
  const sectionWords = new Set(significantWords(s.text));
  if (sectionWords.size === 0) return 0;

  let bonus = 0;
  for (const phrase of keyText) {
    const phraseWords = significantWords(phrase);
    if (phraseWords.length === 0) continue;
    const matched = phraseWords.filter((w) => sectionWords.has(w)).length;
    const ratio = matched / phraseWords.length;
    if (ratio >= 0.6) bonus += 10 * ratio;
  }
  return bonus;
}

function iou(a: RawSection, b: RawSection): number {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return inter / union;
}

function combinedScore(s: RawSection, target?: TargetLayout, keyText?: string[]): number {
  return structureScore(s) + featureMatchBonus(s, target) + textMatchBonus(s, keyText);
}

function pickTopCandidates(
  raw: RawSection[],
  max: number,
  target?: TargetLayout,
  keyText?: string[]
): RawSection[] {
  const sorted = [...raw].sort(
    (a, b) => combinedScore(b, target, keyText) - combinedScore(a, target, keyText)
  );
  const picked: RawSection[] = [];
  for (const c of sorted) {
    if (picked.some((p) => iou(p, c) > 0.6)) continue;
    picked.push(c);
    if (picked.length >= max) break;
  }
  return picked;
}

export interface InspectedPage {
  pageTitle: string;
  candidates: SectionCandidate[];
  fullPageScreenshot: string; // data URL
}

/**
 * Opens a webpage in a remote Browserbase browser, locates structurally
 * interesting section candidates, and screenshots the strongest few plus
 * a full-page fallback.
 */
export async function inspectPage(
  url: string,
  targetLayout?: TargetLayout,
  keyText?: string[],
  timeoutMs = 30000
): Promise<InspectedPage> {
  const session = await createSession();
  const connectUrl =
    session.connectUrl ||
    `wss://connect.browserbase.com?apiKey=${requireEnv("BROWSERBASE_API_KEY")}&sessionId=${session.id}`;

  const browser = await chromium.connectOverCDP(connectUrl, { timeout: timeoutMs });
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page: Page = context.pages()[0] ?? (await context.newPage());
    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page
      .waitForLoadState("networkidle", { timeout: 8000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    const pageTitle = (await page.title().catch(() => "")) || new URL(url).hostname;

    const scan = await page
      .evaluate(findCandidateSections)
      .catch(() => ({ sections: [], documentHeight: 0 }) as RawScanResult);
    const top = pickTopCandidates(scan.sections, 6, targetLayout, keyText);

    const candidates: SectionCandidate[] = [];
    for (const c of top) {
      try {
        const buffer = await page.screenshot({
          clip: { x: c.left, y: c.top, width: c.width, height: c.height },
          type: "jpeg",
          quality: 70,
        });
        candidates.push({
          top: c.top,
          left: c.left,
          width: c.width,
          height: c.height,
          structureScore: structureScore(c),
          tag: c.tag,
          headingText: c.text || undefined,
          imageDataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
        });
      } catch {
        // Skip candidates whose clip falls outside the rendered page.
      }
    }

    const fullBuffer = await page.screenshot({ type: "jpeg", quality: 60, fullPage: true });
    const fullPageScreenshot = `data:image/jpeg;base64,${fullBuffer.toString("base64")}`;

    return { pageTitle, candidates, fullPageScreenshot };
  } finally {
    await browser.close().catch(() => {});
  }
}
