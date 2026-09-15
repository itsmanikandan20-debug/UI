"use client";

import { useEffect, useRef, useState } from "react";
import { PenTool, UploadCloud, Search, Loader2, AlertTriangle } from "lucide-react";
import { DrawCanvas, type DrawCanvasHandle } from "@/components/DrawCanvas";
import { UploadPanel } from "@/components/UploadPanel";
import { ProgressStepper } from "@/components/ProgressStepper";
import { ResultsGrid } from "@/components/ResultsGrid";
import type { PipelineEvent, ProgressStep, UIAnalysis, UIFinderResult } from "@/lib/types";

type Mode = "draw" | "upload";

export default function CreatePage() {
  const [mode, setMode] = useState<Mode>("draw");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const drawRef = useRef<DrawCanvasHandle>(null);

  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null);
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [analysis, setAnalysis] = useState<UIAnalysis | null>(null);
  const [results, setResults] = useState<UIFinderResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "upload") setMode("upload");
  }, []);

  function handleEvent(event: PipelineEvent) {
    if (event.type === "progress") {
      setCurrentStep(event.step);
      setDetail(event.detail);
    } else if (event.type === "analysis") {
      setAnalysis(event.analysis);
    } else if (event.type === "result") {
      setResults((prev) => [...prev, event.result]);
    } else if (event.type === "error") {
      setError(event.message);
    }
  }

  async function handleFindSimilar() {
    setError(null);
    setResults([]);
    setAnalysis(null);
    setCurrentStep(null);
    setDetail(undefined);

    let image: string;
    if (mode === "draw") {
      if (!drawRef.current || drawRef.current.isEmpty()) {
        setError("Draw something on the canvas first.");
        return;
      }
      try {
        image = await drawRef.current.exportPng();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't export your wireframe.");
        return;
      }
    } else {
      if (!uploadedImage) {
        setError("Upload an image first.");
        return;
      }
      image = uploadedImage;
    }

    setRunning(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) handleEvent(JSON.parse(line) as PipelineEvent);
        }
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer.trim()) as PipelineEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-content px-5 py-8">
      <div className="mb-5 inline-flex rounded-xl border border-border bg-white p-1 shadow-panel">
        <ModeTab active={mode === "draw"} onClick={() => setMode("draw")} icon={<PenTool size={15} />} label="Draw" />
        <ModeTab
          active={mode === "upload"}
          onClick={() => setMode("upload")}
          icon={<UploadCloud size={15} />}
          label="Upload"
        />
      </div>

      <div className={mode === "draw" ? "" : "hidden"}>
        <DrawCanvas ref={drawRef} />
      </div>
      <div className={mode === "upload" ? "" : "hidden"}>
        <UploadPanel value={uploadedImage} onChange={setUploadedImage} />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleFindSimilar}
          disabled={running}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-pop transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {running ? "Finding similar UI…" : "Find Similar UI"}
        </button>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-confidence-low">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
      </div>

      {(running || currentStep) && !error && results.length === 0 && (
        <div className="mt-8 max-w-md">
          <ProgressStepper currentStep={currentStep} detail={detail} />
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">
            {results.length} matching UI reference{results.length === 1 ? "" : "s"}
          </h2>
          <ResultsGrid results={results} analysis={analysis} />
        </div>
      )}
    </main>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
        active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-surface-sunken"
      }`}
    >
      {icon} {label}
    </button>
  );
}
