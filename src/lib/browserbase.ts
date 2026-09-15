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

function pickTopCandidates(raw: RawSection[], max: number, target?: TargetLayout): RawSection[] {
  const sorted = [...raw].sort(
    (a, b) => structureScore(b) + featureMatchBonus(b, target) - (structureScore(a) + featureMatchBonus(a, target))
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
    const top = pickTopCandidates(scan.sections, 6, targetLayout);

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
