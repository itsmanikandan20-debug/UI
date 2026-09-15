import { requireEnv } from "./env";
import type { ExaSearchResult } from "./types";

interface ExaApiResult {
  title: string | null;
  url: string;
  score?: number;
}

// UI component-library catalogs, template marketplaces, design-inspiration
// galleries, and dev-tool hosts. These rank very highly for generic
// structural queries ("tabbed feature section") because they're literally
// pages *about* that pattern — but they're not the real product/marketing
// websites the tool is supposed to find. Excluded at the Exa query level
// (not just filtered after) so Exa backfills with genuine results instead
// of us just shrinking the pool.
const EXCLUDED_DOMAINS = [
  "shadcnblocks.com",
  "shadcn-ui-blocks.com",
  "shadcn.io",
  "ui.shadcn.com",
  "tailwindui.com",
  "tailwindcss.com",
  "uiverse.io",
  "lapa.ninja",
  "land-book.com",
  "landbook.com",
  "dribbble.com",
  "behance.net",
  "pinterest.com",
  "github.com",
  "npmjs.com",
  "storybook.js.org",
  "codepen.io",
  "codesandbox.io",
  "figma.com",
  "awwwards.com",
  "producthunt.com",
  "chromewebstore.google.com",
  "mobbin.com",
  "htmlrev.com",
  "onepagelove.com",
];

function isExcludedDomain(hostname: string): boolean {
  return EXCLUDED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

export async function searchExa(query: string, numResults = 8): Promise<ExaSearchResult[]> {
  const apiKey = requireEnv("EXA_API_KEY");

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      numResults,
      type: "auto",
      useAutoprompt: true,
      excludeDomains: EXCLUDED_DOMAINS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exa search failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const results: ExaApiResult[] = data?.results || [];
  return results
    .filter((r) => isLikelyWebpage(r.url))
    .map((r) => ({
      title: r.title || new URL(r.url).hostname,
      url: r.url,
      score: r.score ?? 0,
      query,
    }));
}

function isLikelyWebpage(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (/\.(pdf|zip|png|jpg|jpeg|svg|mp4|mov|docx?|xlsx?)$/i.test(u.pathname)) return false;
    if (isExcludedDomain(u.hostname.replace(/^www\./, ""))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs several search queries and merges results into a de-duplicated,
 * relevance-ranked list of candidate pages (one per domain), choosing how
 * many to keep dynamically based on how strong the scores are rather than
 * a fixed count.
 */
export async function discoverPages(
  queries: string[],
  maxPages = 8
): Promise<ExaSearchResult[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchExa(q, 10)));
  const all: ExaSearchResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") all.push(...s.value);
  }
  if (all.length === 0) return [];

  const byDomain = new Map<string, ExaSearchResult>();
  for (const r of all) {
    const domain = new URL(r.url).hostname.replace(/^www\./, "");
    const existing = byDomain.get(domain);
    if (!existing || r.score > existing.score) byDomain.set(domain, r);
  }

  const ranked = [...byDomain.values()].sort((a, b) => b.score - a.score);
  const topScore = ranked[0]?.score ?? 0;
  const threshold = topScore * 0.45;
  const relevant = ranked.filter((r) => r.score >= threshold);

  const count = Math.max(5, Math.min(maxPages, relevant.length || ranked.length));
  return (relevant.length ? relevant : ranked).slice(0, count);
}
