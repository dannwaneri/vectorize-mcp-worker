export type QueryIntent = 
  | 'ENTITY_LOOKUP'      // "What's Haaland's player ID?" "Find user John"
  | 'SEMANTIC_SEARCH'    // "Players similar to Salah" "Documents about AI"
  | 'KEYWORD_EXACT'      // "FPL GW17" "Error code 404" "Python numpy"
  | 'OCR_DOCUMENT'       // "Extract text from receipt" (with image)
  | 'VISUAL_ANALYSIS'    // "Describe this dashboard" (with image)
  | 'GRAPH_REASONING';   // "Who owns Liverpool players?" "Documents citing X"

export interface IntentClassification {
  intent: QueryIntent;
  confidence: number;
  reasoning?: string;
  alternativeIntents?: { intent: QueryIntent; confidence: number }[];
}

export interface RouteMetadata {
  route: string;
  intent: QueryIntent;
  routeTime: string;
  reasoning?: string;
  fallbackUsed?: boolean;
}

export interface RouteResult {
  results: any[];
  performance: Record<string, string>;
  metadata: RouteMetadata;
}