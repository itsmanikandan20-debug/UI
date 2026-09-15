"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";

interface UploadPanelProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

export function UploadPanel({ value, onChange }: UploadPanelProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file (PNG, JPG, WEBP, or SVG export).");
        return;
      }
      setError(null);
      try {
        const dataUrl = await readAsDataUrl(file);
        onChange(dataUrl);
      } catch {
        setError("Couldn't read that file — try another one.");
      }
    },
    [onChange]
  );

  if (value) {
    return (
      <div className="rounded-xl border border-border bg-white p-3 shadow-panel">
        <div className="relative overflow-hidden rounded-lg border border-border bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Uploaded UI reference" className="mx-auto max-h-[520px] w-auto object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Remove image"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink-soft shadow-panel transition hover:bg-white"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex h-[420px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition ${
          dragging ? "border-brand-500 bg-brand-50" : "border-border-strong bg-surface-sunken hover:bg-brand-50/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <UploadCloud size={22} />
        </div>
        <div>
          <p className="font-medium text-ink">Drop a UI image here, or click to browse</p>
          <p className="mt-1 text-sm text-ink-muted">
            Wireframes, hi-fi designs, Figma exports, or website screenshots — any format works.
          </p>
        </div>
      </label>
      {error && <p className="mt-2 text-sm text-confidence-low">{error}</p>}
    </div>
  );
}
