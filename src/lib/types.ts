// Shared types for the UI-Finder pipeline: submitted-design analysis,
// discovered webpages, candidate sections, and the final ranked results.

export type Confidence = "High" | "Medium" | "Low";
export type MatchType = "exact" | "likely" | "broader" | "fullpage";

export interface LayoutAnalysis {
  columns: number;
  alignment: string;
  hasTabs: boolean;
  tabCount: number;
  hasCards: boolean;
  cardCount: number;
  hasButtons: boolean;
  buttonCount: number;
  hasImages: boolean;
  imagePosition: string;
  textPosition: string;
  spacingDensity: string;
  visualHierarchy: string[];
}

export interface UIAnalysis {
  sectionType: string;
  description: string;
  layout: LayoutAnalysis;
  searchQueries: string[];
}

export interface ExaSearchResult {
  title: string;
  url: string;
  score: number;
  query: string;
}

export interface SectionCandidate {
  top: number;
  left: number;
  width: number;
  height: number;
  structureScore: number;
  tag: string;
  imageDataUrl?: string;
}

export interface ComparisonOutcome {
  bestCandidateIndex: number; // -1 means "no candidate matched, use fallback"
  similarityScore: number; // 0-100
  confidence: Confidence;
  explanation: string;
  matchType: MatchType;
}

export interface UIFinderResult {
  url: string;
  siteName: string;
  pageTitle: string;
  fullPageScreenshot: string; // data URL
  sectionScreenshot: string; // data URL — the matched crop (or full page as fallback)
  similarityScore: number;
  confidence: Confidence;
  explanation: string;
  matchType: MatchType;
}

// --- Streaming progress protocol between /api/analyze and the client ---

export type ProgressStep =
  | "analyzing"
  | "understanding"
  | "queries"
  | "searching"
  | "inspecting"
  | "matching"
  | "comparing"
  | "ranking";

export interface ProgressEvent {
  type: "progress";
  step: ProgressStep;
  detail?: string;
}

export interface AnalysisEvent {
  type: "analysis";
  analysis: UIAnalysis;
}

export interface ResultEvent {
  type: "result";
  result: UIFinderResult;
}

export interface DoneEvent {
  type: "done";
  count: number;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  step?: ProgressStep;
}

export type PipelineEvent = ProgressEvent | AnalysisEvent | ResultEvent | DoneEvent | ErrorEvent;
