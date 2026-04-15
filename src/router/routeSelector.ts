import { Env } from '../types/env';
import { QueryIntent, RouteResult } from './types';
import { IntentClassifier } from './intentClassifier';
import { SearchFilters } from '../types/search';

// Route imports (will create these)
import { sqlRoute } from './routes/sqlRoute';
import { vectorRoute } from './routes/vectorRoute';
import { bm25Route } from './routes/bm25Route';
import { graphRoute } from './routes/graphRoute';
import { ocrRoute } from './routes/ocrRoute';
import { visionRoute } from './routes/visionRoute';

import { CostTracker, RouteCost } from '../analytics/costTracker';

/**
 * Route Selector
 * 
 * Orchestrates query routing based on intent classification.
 * Implements fallback strategy for reliability.
 */
export class RouteSelector {
  
  private classifier: IntentClassifier;
  
  constructor(env: Env) {
    this.classifier = new IntentClassifier(env);
  }

  /**
   * Main routing function
   */
  async route(
    query: string,
    context: {
      topK?: number;
      hasImage?: boolean;
      imageBuffer?: ArrayBuffer;
      filters?: SearchFilters;
    },
    env: Env
  ): Promise<RouteResult & { cost?: RouteCost }> {
    
    const startTime = Date.now();
    
    // Step 1: Classify intent
    const classification = await this.classifier.classify(query, context.hasImage || false);
    
    console.log(`Routing query: "${query}" → ${classification.intent}`);
    
    // Step 2: Select and execute route
    let result: RouteResult;
    
    try {
      switch (classification.intent) {
        case 'ENTITY_LOOKUP':
          result = await sqlRoute(query, context, env);
          break;
        
        case 'SEMANTIC_SEARCH':
          result = await vectorRoute(query, { ...context, filters: context.filters }, env);
          break;
        
        case 'KEYWORD_EXACT':
          result = await bm25Route(query, context, env);
          break;
        
        case 'OCR_DOCUMENT':
          if (!context.imageBuffer) {
            // Fallback: No image provided, use semantic search
            result = await this.fallbackRoute('OCR_DOCUMENT', query, context, env, 'No image provided');
          } else {
            result = await ocrRoute(query, context, env);
          }
          break;
        
        case 'VISUAL_ANALYSIS':
          if (!context.imageBuffer) {
            result = await this.fallbackRoute('VISUAL_ANALYSIS', query, context, env, 'No image provided');
          } else {
            result = await visionRoute(query, context, env);
          }
          break;
        
        case 'GRAPH_REASONING':
          result = await graphRoute(query, context, env);
          break;
        
        default:
          // Unknown intent, default to semantic search
          result = await vectorRoute(query, { ...context, filters: context.filters }, env);
      }
      
    } catch (error) {
      console.error(`Route ${classification.intent} failed:`, error);
      
      // Fallback to semantic search on route failure
      result = await this.fallbackRoute(
        classification.intent,
        query,
        context,
        env,
        error instanceof Error ? error.message : 'Route execution failed'
      );
    }
    
    // Add routing metadata
    const totalTime = Date.now() - startTime;
    result.metadata.intent = classification.intent;
    result.performance.routingTime = `${totalTime}ms`;
    
    // Add cost calculation based on route
    let cost: RouteCost | undefined;
    
    switch (classification.intent) {
      case 'ENTITY_LOOKUP':
        cost = CostTracker.calculateRouteCost('SQL', { d1Reads: 1 });
        break;
      
      case 'KEYWORD_EXACT':
        cost = CostTracker.calculateRouteCost('BM25', { d1Reads: 50 });
        break;
      
      case 'SEMANTIC_SEARCH':
        cost = CostTracker.calculateRouteCost('VECTOR', {
          embeddings: 1,
          vectorQueries: 1,
          d1Reads: 50,
          rerankerCalls: context.topK && context.topK > 5 ? 1 : 0,
        });
        break;
      
      case 'GRAPH_REASONING':
        cost = CostTracker.calculateRouteCost('GRAPH', { d1Reads: 10 });
        break;
      
      case 'VISUAL_ANALYSIS':
        cost = CostTracker.calculateRouteCost('VISION', {
          llm4ScoutTokens: 500,
          embeddings: 1,
        });
        break;
      
      case 'OCR_DOCUMENT':
        cost = CostTracker.calculateRouteCost('OCR', {
          llm4ScoutTokens: 300,
          embeddings: 1,
        });
        break;
    }
    
    return {
      ...result,
      cost
    };
  }

  /**
   * Fallback route when primary route fails
   */
  private async fallbackRoute(
    failedIntent: QueryIntent,
    query: string,
    context: any,
    env: Env,
    reason: string
  ): Promise<RouteResult> {
    
    console.warn(`Fallback activated: ${failedIntent} → SEMANTIC_SEARCH (${reason})`);
    
    const result = await vectorRoute(query, { ...context, filters: context.filters }, env);

    result.metadata.fallbackUsed = true;
    result.metadata.reasoning = `Primary route (${failedIntent}) failed: ${reason}. Using semantic search fallback.`;
    
    return result;
  }
}