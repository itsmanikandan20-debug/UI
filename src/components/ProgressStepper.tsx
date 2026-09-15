"use client";

import { Check, Loader2 } from "lucide-react";
import type { ProgressStep } from "@/lib/types";

const STEPS: { step: ProgressStep; label: string }[] = [
  { step: "analyzing", label: "Analyzing your UI" },
  { step: "understanding", label: "Understanding layout" },
  { step: "queries", label: "Generating search queries" },
  { step: "searching", label: "Finding relevant webpages" },
  { step: "inspecting", label: "Inspecting webpages" },
  { step: "matching", label: "Finding matching sections" },
  { step: "comparing", label: "Comparing layouts" },
  { step: "ranking", label: "Ranking results" },
];

interface ProgressStepperProps {
  currentStep: ProgressStep | null;
  detail?: string;
}

export function ProgressStepper({ currentStep, detail }: ProgressStepperProps) {
  const currentIndex = currentStep ? STEPS.findIndex((s) => s.step === currentStep) : -1;

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-panel">
      <ol className="space-y-0">
        {STEPS.map((s, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={s.step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    done
                      ? "bg-brand-600 text-white"
                      : active
                        ? "bg-brand-100 text-brand-700"
                        : "bg-surface-sunken text-ink-muted"
                  }`}
                >
                  {done ? <Check size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-px flex-1 ${done ? "bg-brand-300" : "bg-border"}`} style={{ minHeight: 20 }} />
                )}
              </div>
              <div className="pb-5">
                <p
                  className={`text-sm ${
                    active ? "font-semibold text-ink" : done ? "text-ink-soft" : "text-ink-muted"
                  }`}
                >
                  {s.label}
                </p>
                {active && detail && <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
