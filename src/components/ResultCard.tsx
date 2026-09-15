"use client";

import { ExternalLink } from "lucide-react";
import type { UIFinderResult } from "@/lib/types";

const CONFIDENCE_STYLES: Record<UIFinderResult["confidence"], string> = {
  High: "bg-confidence-high-bg text-confidence-high",
  Medium: "bg-confidence-medium-bg text-confidence-medium",
  Low: "bg-confidence-low-bg text-confidence-low",
};

const MATCH_TYPE_LABEL: Record<UIFinderResult["matchType"], string> = {
  exact: "Exact section match",
  likely: "Likely section match",
  broader: "Broader surrounding crop",
  fullpage: "Full-page match (no single section isolated)",
};

export function ResultCard({ result }: { result: UIFinderResult }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-panel">
      <div className="relative bg-surface-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.sectionScreenshot}
          alt={`Matching section on ${result.siteName}`}
          className="h-56 w-full object-cover object-top"
        />
        <div className="absolute left-3 top-3 rounded-full bg-ink/85 px-3 py-1 text-sm font-semibold text-white backdrop-blur">
          {result.similarityScore}% similar
        </div>
        <div
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium ${CONFIDENCE_STYLES[result.confidence]}`}
        >
          {result.confidence} confidence
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <p className="font-display text-base font-semibold text-ink">{result.siteName}</p>
          <p className="truncate text-xs text-ink-muted">{result.pageTitle}</p>
        </div>

        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
          {MATCH_TYPE_LABEL[result.matchType]}
        </p>

        <div>
          <p className="text-xs font-semibold text-ink-soft">Why it matches</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{result.explanation}</p>
        </div>

        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          View website <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}
