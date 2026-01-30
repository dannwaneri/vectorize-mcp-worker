import { Env } from '../types/env';
import { QueryIntent, IntentClassification } from './types';

/**
 * Intent Classifier using Llama 3.2-3b
 * 
 * Analyzes user queries to determine optimal retrieval strategy.
 * Uses lightweight 3B model for sub-100ms classification.
 */
export class IntentClassifier {
  
  private systemPrompt = `You are a query intent classifier for a RAG system.

Classify queries into ONE of these intents:

1. ENTITY_LOOKUP - Direct lookups of specific entities, IDs, names, or facts
   Examples: "What's Haaland's player ID?", "Find user John Smith", "Show document titled X"

2. SEMANTIC_SEARCH - Conceptual similarity, recommendations, exploratory queries
   Examples: "Players similar to Salah", "Documents about AI ethics", "Recommendations for..."

3. KEYWORD_EXACT - Exact phrase matching, technical terms, codes, specific keywords
   Examples: "FPL Gameweek 17", "Error code 404", "numpy.array documentation"

4. OCR_DOCUMENT - Text extraction from images (only if image context mentioned)
   Examples: "Extract text from this receipt", "What does this form say?"

5. VISUAL_ANALYSIS - Image understanding, diagram interpretation (only if image context)
   Examples: "Describe this dashboard", "What's in this screenshot?"

6. GRAPH_REASONING - Multi-hop queries about relationships, connections, citations
   Examples: "Who owns Liverpool players?", "Documents citing Smith 2020", "Find related entities"

Respond with ONLY the intent name (e.g., "ENTITY_LOOKUP"). No explanation.`;

  constructor(private env: Env) {}

  /**
   * Classify query intent using Llama 3.2-3b
   */
  async classify(query: string, hasImage: boolean = false): Promise<IntentClassification> {
    const startTime = Date.now();
    
    try {
      // If image is present, limit to image-related intents
      if (hasImage) {
        return this.classifyImageQuery(query);
      }

      // Use Llama 3.2-3b for fast classification
      const response = await this.env.AI.run(
        '@cf/meta/llama-3.2-3b-instruct',
        {
          messages: [
            {
              role: 'system',
              content: this.systemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 20,      // Just need intent name
          temperature: 0.1     // Low temp for consistent classification
        }
      );

      const intentText = this.extractText(response).trim().toUpperCase().replace(/[^A-Z_]/g, '');
      const intent = this.validateIntent(intentText);
      
      const classificationTime = Date.now() - startTime;
      
      console.log(`Intent classified: ${intent} (${classificationTime}ms)`);

      return {
        intent,
        confidence: 0.85,
        reasoning: `Classified as ${intent} based on query pattern`
      };

    } catch (error) {
      console.error('Intent classification failed:', error);
      
      // Fallback to pattern-based classification
      return this.fallbackClassification(query);
    }
  }

  /**
   * Classify image-related queries
   */
  private classifyImageQuery(query: string): IntentClassification {
    const lowerQuery = query.toLowerCase();
    
    // OCR keywords
    if (lowerQuery.includes('extract') || 
        lowerQuery.includes('read') || 
        lowerQuery.includes('text from') ||
        lowerQuery.includes('ocr')) {
      return {
        intent: 'OCR_DOCUMENT',
        confidence: 0.95,
        reasoning: 'Image query with OCR keywords'
      };
    }
    
    // Default to visual analysis for images
    return {
      intent: 'VISUAL_ANALYSIS',
      confidence: 0.9,
      reasoning: 'Image query without specific OCR intent'
    };
  }

  /**
   * Fallback classification using pattern matching
   */
  private fallbackClassification(query: string): IntentClassification {
    const lowerQuery = query.toLowerCase();
    
    // Entity lookup patterns
    if (this.matchesPattern(lowerQuery, [
      /^(what is|who is|find|show|get)\s+(\w+)/i,
      /^(\w+)'s\s+(id|name|email|phone)/i,
      /(player|user|document|entity)\s+(\w+)/i
    ])) {
      return {
        intent: 'ENTITY_LOOKUP',
        confidence: 0.7,
        reasoning: 'Fallback: Matches entity lookup pattern'
      };
    }
    
    // Keyword exact patterns
    if (this.matchesPattern(lowerQuery, [
      /^(error|code|gw|gameweek)\s+\d+/i,
      /\b[A-Z]{2,}\d+\b/,
      /^"[^"]+"$/
    ])) {
      return {
        intent: 'KEYWORD_EXACT',
        confidence: 0.75,
        reasoning: 'Fallback: Matches keyword pattern'
      };
    }
    
    // Graph reasoning patterns
    if (this.matchesPattern(lowerQuery, [
      /who (owns|has|manages|authored)/i,
      /(related|connected|linked) (to|with)/i,
      /(documents|articles) (citing|referencing)/i
    ])) {
      return {
        intent: 'GRAPH_REASONING',
        confidence: 0.7,
        reasoning: 'Fallback: Matches graph pattern'
      };
    }
    
    // Default to semantic search
    return {
      intent: 'SEMANTIC_SEARCH',
      confidence: 0.6,
      reasoning: 'Fallback: Default to semantic search'
    };
  }

  /**
   * Check if query matches any of the given patterns
   */
  private matchesPattern(query: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Validate and sanitize intent string
   */
  private validateIntent(intentText: string): QueryIntent {
    const validIntents: QueryIntent[] = [
      'ENTITY_LOOKUP',
      'SEMANTIC_SEARCH',
      'KEYWORD_EXACT',
      'OCR_DOCUMENT',
      'VISUAL_ANALYSIS',
      'GRAPH_REASONING'
    ];
    
    if (validIntents.includes(intentText as QueryIntent)) {
      return intentText as QueryIntent;
    }
    
    const partial = validIntents.find(intent => 
      intentText.includes(intent) || intent.includes(intentText)
    );
    
    if (partial) {
      return partial;
    }
    
    console.warn(`Unknown intent: ${intentText}, defaulting to SEMANTIC_SEARCH`);
    return 'SEMANTIC_SEARCH';
  }

  /**
   * Extract text from AI response
   */
  private extractText(response: any): string {
    if (typeof response === 'string') return response;
    if (response?.response) return response.response;
    if (response?.text) return response.text;
    if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
    if (response?.choices?.[0]?.text) return response.choices[0].text;
    return '';
  }
}