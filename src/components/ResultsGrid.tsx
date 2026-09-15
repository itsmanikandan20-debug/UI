"use client";

import type { UIAnalysis, UIFinderResult } from "@/lib/types";
import { ResultCard } from "./ResultCard";

interface ResultsGridProps {
  results: UIFinderResult[];
  analysis: UIAnalysis | null;
}

export function ResultsGrid({ results, analysis }: ResultsGridProps) {
  if (results.length === 0) return null;

  return (
    <div>
      {analysis && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {analysis.sectionType}
          </p>
          <p className="mt-1 text-sm text-ink-soft">{analysis.description}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((r) => (
          <ResultCard key={r.url} result={r} />
        ))}
      </div>
    </div>
  );
}
