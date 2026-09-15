# UI-Finder

Draw a rough wireframe or upload any UI reference, and UI-Finder finds real
website sections with a similar **layout and structure** — tabs, columns,
cards, image/text placement, hierarchy — regardless of color, fonts, or
branding.

## How it works

1. **Draw your UI** in a built-in wireframe editor (headings, text,
   containers, image placeholders, buttons, cards, tabs, lines), or
   **upload** any UI image — a wireframe, a hi-fi design, a Figma export,
   or a website screenshot.
2. **Gemini** analyzes the structure: section type, columns, tabs, cards,
   buttons, alignment, spacing, hierarchy — and generates several
   structural web-search queries.
3. **Exa Search** uses those queries to discover real webpages that might
   contain a similar section.
4. **Browserbase** opens each candidate page in a real remote browser,
   locates the most structurally interesting sections on the page, and
   screenshots them.
5. **Gemini** compares your design against each candidate section,
   scoring structural similarity (not color/branding) and picking the
   best-matching crop.
6. Results are ranked and shown with a similarity score, confidence
   level, and a short explanation of why each one matches.

The whole run streams live progress ("Analyzing your UI" → "Understanding
layout" → … → "Ranking results") so you can see the tool working.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the three API keys below
npm run dev
```

Open http://localhost:3000.

### Required API keys (`.env.local`)

| Variable | Service | Used for |
|---|---|---|
| `GEMINI_API_KEY` | [Google Gemini](https://aistudio.google.com) | Understanding the submitted UI's structure, and comparing it against candidate sections |
| `EXA_API_KEY` | [Exa Search](https://exa.ai) | Discovering real webpages via structural search queries |
| `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | [Browserbase](https://www.browserbase.com) | Opening candidate pages in a real remote browser, inspecting DOM structure, and capturing section screenshots |

All three are required for a full run. If one is missing, "Find Similar
UI" stops at the exact step that needs it and tells you which
`.env.local` variable to set — see `.env.local.example` for step-by-step
instructions on getting each key.

## Architecture

- **Next.js 14 (App Router) + TypeScript + Tailwind.**
- `POST /api/analyze` streams newline-delimited JSON progress events over
  a single long-lived response (no job queue/database needed) —
  `src/lib/pipeline.ts` orchestrates the run, `src/app/api/analyze/route.ts`
  turns it into a stream.
- `src/lib/gemini.ts`, `src/lib/exa.ts`, `src/lib/browserbase.ts` are thin
  REST clients for each service (no SDKs required).
- Browserbase is used strictly as a **remote** browser: `playwright-core`
  connects to it over CDP (`chromium.connectOverCDP`), so no local
  Chromium install or download is needed.
- Section discovery on each page (`src/lib/browserbase.ts`) runs a
  heuristic DOM scan (tabs/cards/buttons/headings density, size) to find
  the 3-4 most structurally interesting regions, screenshots them plus a
  full-page fallback, then hands all of them to Gemini in one comparison
  call to pick the actual best match — combining structural DOM signals
  with Gemini's visual judgment.
- The wireframe editor (`src/components/DrawCanvas.tsx`) is a small
  from-scratch canvas (no drag/resize library): 8 element types, pointer-based
  create/move/resize, undo/redo, delete, and clear. On submit it's
  rasterized client-side to a PNG via an equivalent SVG renderer
  (`src/lib/export-canvas.ts`) — no external rendering library needed.
- The number of webpages inspected per search is chosen dynamically
  (`src/lib/exa.ts`'s `discoverPages`) based on how close each result's
  relevance score is to the top result, not a fixed count.

## Notes

- Results (including screenshots) live only in page state for the
  current run — nothing is persisted server-side, so there's no database
  to configure.
- Each webpage is inspected in its own short-lived Browserbase session,
  processed with limited concurrency; a single bad page (bot-blocked,
  slow, errors) is skipped without failing the whole run.
