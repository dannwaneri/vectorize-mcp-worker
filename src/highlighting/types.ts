import { SearchResult } from '../types/search';

/**
 * Highlighted search result with semantic spans
 */
export interface HighlightedResult extends SearchResult {
  highlightedContent: string;
  highlights: Highlight[];
  snippets?: string[];  // Best passages for preview
}

/**
 * Individual highlight span
 */
export interface Highlight {
  text: string;
  score: number;
  startIndex: number;
  endIndex: number;
  context?: string;  // Surrounding text
}

/**
 * Highlighting configuration
 */
export interface HighlightConfig {
  threshold: number;        // Minimum score to highlight (0-1)
  maxHighlights: number;    // Max highlights per result
  contextLength: number;    // Characters of context around highlight
  snippetLength: number;    // Length of extracted snippets
}