import Link from "next/link";
import { Compass } from "lucide-react";

export function Navbar() {
  return (
    <header className="border-b border-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Compass size={17} />
          </span>
          <span className="font-display text-lg font-semibold text-ink">UI-Finder</span>
        </Link>
        <Link
          href="/create"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Find similar UI
        </Link>
      </div>
    </header>
  );
}
