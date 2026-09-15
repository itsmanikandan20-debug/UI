import { analyzeUI, compareCandidates } from "./gemini";
import { discoverPages } from "./exa";
import { inspectPage } from "./browserbase";
import { decodeDataUrl, mapWithConcurrency } from "./image";
import type { PipelineEvent, ProgressStep, UIFinderResult } from "./types";

export class PipelineError extends Error {
  constructor(message: string, public readonly step: ProgressStep) {
    super(message);
    this.name = "PipelineError";
  }
}

type Emit = (event: PipelineEvent) => void;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function runPipeline(
  imageBase64: string,
  mimeType: string,
  emit: Emit
): Promise<void> {
  emit({ type: "progress", step: "analyzing" });
  const analysis = await analyzeUI(imageBase64, mimeType).catch((err) => {
    throw new PipelineError(`Couldn't analyze your UI: ${errMsg(err)}`, "analyzing");
  });
  emit({ type: "analysis", analysis });
  emit({ type: "progress", step: "understanding", detail: analysis.description });

  emit({ type: "progress", step: "queries" });
  const queries =
    analysis.searchQueries.length > 0
      ? analysis.searchQueries
      : [`website ${analysis.sectionType} section layout`];
  emit({ type: "progress", step: "searching", detail: `${queries.length} search queries` });

  const pages = await discoverPages(queries, 8).catch((err) => {
    throw new PipelineError(`Web search failed: ${errMsg(err)}`, "searching");
  });
  if (pages.length === 0) {
    throw new PipelineError(
      "No relevant webpages were found for this design. Try a more detailed or distinctive UI.",
      "searching"
    );
  }

  emit({
    type: "progress",
    step: "inspecting",
    detail: `0/${pages.length} pages found`,
  });

  let inspected = 0;
  const failures: string[] = [];
  const settled = await mapWithConcurrency(pages, 3, async (page) => {
    try {
      const site = hostnameOf(page.url);
      const insp = await inspectPage(page.url);
      inspected += 1;
      emit({
        type: "progress",
        step: "inspecting",
        detail: `${inspected}/${pages.length} pages — ${site}`,
      });

      emit({ type: "progress", step: "matching", detail: site });
      const candidateParts = insp.candidates
        .filter((c) => c.imageDataUrl)
        .map((c) => {
          const decoded = decodeDataUrl(c.imageDataUrl!);
          return {
            label: `${c.tag} section, ~${Math.round(c.width)}x${Math.round(c.height)}px`,
            imageBase64: decoded.base64,
            mimeType: decoded.mimeType,
          };
        });
      const fullPageDecoded = decodeDataUrl(insp.fullPageScreenshot);
      candidateParts.push({
        label: "Full page (fallback)",
        imageBase64: fullPageDecoded.base64,
        mimeType: fullPageDecoded.mimeType,
      });

      emit({ type: "progress", step: "comparing", detail: site });
      const outcome = await compareCandidates(imageBase64, mimeType, candidateParts);

      const fullPageIndex = candidateParts.length - 1;
      const isFullpage =
        outcome.bestCandidateIndex < 0 || outcome.bestCandidateIndex >= fullPageIndex;
      const sectionScreenshot = isFullpage
        ? insp.fullPageScreenshot
        : insp.candidates[outcome.bestCandidateIndex]?.imageDataUrl ?? insp.fullPageScreenshot;

      const result: UIFinderResult = {
        url: page.url,
        siteName: site,
        pageTitle: insp.pageTitle,
        fullPageScreenshot: insp.fullPageScreenshot,
        sectionScreenshot,
        similarityScore: clamp(Math.round(outcome.similarityScore), 0, 100),
        confidence: outcome.confidence,
        explanation: outcome.explanation,
        matchType: isFullpage ? "fullpage" : outcome.matchType,
      };
      return result;
    } catch (err) {
      inspected += 1;
      const message = errMsg(err);
      failures.push(`${hostnameOf(page.url)}: ${message}`);
      emit({
        type: "progress",
        step: "inspecting",
        detail: `Skipped ${hostnameOf(page.url)}: ${message}`,
      });
      return null;
    }
  });

  const results = settled.filter((r): r is UIFinderResult => r !== null);
  if (results.length === 0) {
    const sample = failures.slice(0, 3).join(" | ");
    throw new PipelineError(
      `None of the ${pages.length} candidate webpages could be inspected. ${sample}`,
      "inspecting"
    );
  }

  emit({ type: "progress", step: "ranking" });
  results.sort((a, b) => b.similarityScore - a.similarityScore);
  for (const result of results) {
    emit({ type: "result", result });
  }
  emit({ type: "done", count: results.length });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
