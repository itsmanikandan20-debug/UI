import Link from "next/link";
import { PenTool, UploadCloud, Search, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-content px-5 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
          <Sparkles size={13} /> For UI/UX designers
        </span>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Find real UI sections that match your design
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Draw a rough wireframe or upload any UI reference. UI-Finder finds real website sections
          with a similar layout and structure — not just similar colors.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
        <Link
          href="/create?mode=draw"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-6 shadow-panel transition hover:-translate-y-0.5 hover:shadow-pop"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
            <PenTool size={20} />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-ink">Draw your UI</p>
            <p className="mt-1 text-sm text-ink-soft">
              Sketch a layout with headings, text, images, buttons, cards, and tabs in a simple
              wireframe editor.
            </p>
          </div>
        </Link>

        <Link
          href="/create?mode=upload"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-6 shadow-panel transition hover:-translate-y-0.5 hover:shadow-pop"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
            <UploadCloud size={20} />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-ink">Upload UI</p>
            <p className="mt-1 text-sm text-ink-soft">
              Drop in a wireframe, hi-fi design, Figma export, or a website screenshot — any UI
              reference works.
            </p>
          </div>
        </Link>
      </div>

      <div className="mx-auto mt-16 max-w-3xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Step
            icon={<PenTool size={16} />}
            title="1. Describe your UI"
            body="Draw a wireframe or upload any design reference."
          />
          <Step
            icon={<Search size={16} />}
            title="2. We understand & search"
            body="Gemini reads the structure, then Exa and Browserbase find and inspect real webpages."
          />
          <Step
            icon={<Sparkles size={16} />}
            title="3. Get ranked matches"
            body="See real sections ranked by structural similarity, with an explanation for each."
          />
        </div>
      </div>
    </main>
  );
}

function Step({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-left">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
    </div>
  );
}
