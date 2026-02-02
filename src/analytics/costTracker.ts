import { Env } from '../types/env';
import { QueryIntent } from '../router/types';

/**
 * Cost Tracker
 * 
 * Tracks costs per route to demonstrate V4 savings.
 * Costs are approximate based on Cloudflare pricing.
 */

// Cost per operation (in USD, approximate)
const COST_PER_OPERATION = {
  // AI Model costs
  embedding: 0.000001,           // BGE embedding generation (~$1 per 1M embeddings)
  llama32b: 0.0000005,          // Llama 3.2-3b inference (~$0.50 per 1M tokens)
  llama4scout: 0.0000001,        // Llama 4 Scout vision (~$5 per 1M tokens)
  reranker: 0.000002,           // BGE reranker (~$2 per 1M operations)
  
  // Database costs
  vectorize: 0.00001,           // Vectorize query (~$10 per 1M queries)
  d1Read: 0.000000001,          // D1 read (~$0.001 per 1M reads)
  d1Write: 0.000000001,         // D1 write (~$0.001 per 1M writes)
  
  // Workers compute
  workerCpu: 0.0000001,         // Workers CPU time (minimal)
} as const;

export interface RouteCost {
  route: string;
  totalCost: number;
  breakdown: {
    embedding?: number;
    vectorSearch?: number;
    keywordSearch?: number;
    reranking?: number;
    graphTraversal?: number;
    llmInference?: number;
    visionProcessing?: number;
    ocrProcessing?: number;
  };
}

export class CostTracker {
  
  /**
   * Calculate cost for a route execution
   */
  static calculateRouteCost(
    route: string,
    operations: {
      embeddings?: number;
      vectorQueries?: number;
      d1Reads?: number;
      d1Writes?: number;
      llm32bTokens?: number;
      llm4ScoutTokens?: number;
      rerankerCalls?: number;
    }
  ): RouteCost {
    
    const breakdown: RouteCost['breakdown'] = {};
    let totalCost = 0;
    
    // Embedding costs
    if (operations.embeddings) {
      const cost = operations.embeddings * COST_PER_OPERATION.embedding;
      breakdown.embedding = cost;
      totalCost += cost;
    }
    
    // Vector search costs
    if (operations.vectorQueries) {
      const cost = operations.vectorQueries * COST_PER_OPERATION.vectorize;
      breakdown.vectorSearch = cost;
      totalCost += cost;
    }
    
    // Keyword search costs (D1 reads)
    if (operations.d1Reads) {
      const cost = operations.d1Reads * COST_PER_OPERATION.d1Read;
      breakdown.keywordSearch = cost;
      totalCost += cost;
    }
    
    // Graph traversal costs (D1 reads)
    if (operations.d1Reads && route === 'GRAPH') {
      breakdown.graphTraversal = operations.d1Reads * COST_PER_OPERATION.d1Read;
    }
    
    // Reranking costs
    if (operations.rerankerCalls) {
      const cost = operations.rerankerCalls * COST_PER_OPERATION.reranker;
      breakdown.reranking = cost;
      totalCost += cost;
    }
    
    // LLM inference costs
    if (operations.llm32bTokens) {
      const cost = operations.llm32bTokens * COST_PER_OPERATION.llama32b;
      breakdown.llmInference = cost;
      totalCost += cost;
    }
    
    // Vision processing costs
    if (operations.llm4ScoutTokens) {
      const cost = operations.llm4ScoutTokens * COST_PER_OPERATION.llama4scout;
      breakdown.visionProcessing = cost;
      totalCost += cost;
    }
    
    // Add base CPU cost
    totalCost += COST_PER_OPERATION.workerCpu;
    
    return {
      route,
      totalCost,
      breakdown
    };
  }
  
  /**
   * Get estimated cost per route type
   */
  static getEstimatedRouteCosts(): Record<string, RouteCost> {
    return {
      SQL: this.calculateRouteCost('SQL', {
        d1Reads: 1,  // ✅ Correct (single SELECT)
      }),
      
      BM25: this.calculateRouteCost('BM25', {
        d1Reads: 10,  // ✅ FIXED (was 50, now 10)
      }),
      
      VECTOR: this.calculateRouteCost('VECTOR', {
        embeddings: 1,
        vectorQueries: 1,
        d1Reads: 10,     // ✅ FIXED (was 50, now 10)
        rerankerCalls: 1,
      }),
      
      GRAPH: this.calculateRouteCost('GRAPH', {
        d1Reads: 5,  // ✅ FIXED (was 10, now 5 for 1-hop)
      }),
      
      OCR: this.calculateRouteCost('OCR', {
        llm4ScoutTokens: 300,  // ✅ Correct
        embeddings: 1,
      }),
      
      VISION: this.calculateRouteCost('VISION', {
        llm4ScoutTokens: 500,  // ✅ Correct
        embeddings: 1,
      }),
    };
  }
  
  /**
   * Format cost for display
   */
  static formatCost(cost: number): string {
    if (cost < 0.000001) {
      return '<$0.000001';
    }
    return `$${cost.toFixed(6)}`;
  }
  
  /**
   * Calculate monthly cost projection
   */
  static projectMonthlyCost(
    queriesPerDay: number,
    routeDistribution: Record<string, number> // percentage per route
  ): {
    totalMonthly: number;
    breakdown: Record<string, number>;
    comparison: {
      v3Cost: number;
      v4Cost: number;
      savings: number;
      savingsPercent: number;
    };
  } {
    
    const routeCosts = this.getEstimatedRouteCosts();
    const queriesPerMonth = queriesPerDay * 30;
    
    let v4MonthlyTotal = 0;
    const breakdown: Record<string, number> = {};
    
    // Calculate V4 cost based on route distribution
    for (const [route, percentage] of Object.entries(routeDistribution)) {
      const routeQueries = queriesPerMonth * (percentage / 100);
      const routeCost = routeCosts[route]?.totalCost || 0;
      const monthlyCost = routeQueries * routeCost;
      
      breakdown[route] = monthlyCost;
      v4MonthlyTotal += monthlyCost;
    }
    
    // V3 uses VECTOR route for everything
    const v3MonthlyTotal = queriesPerMonth * routeCosts.VECTOR.totalCost;
    
    const savings = v3MonthlyTotal - v4MonthlyTotal;
    const savingsPercent = (savings / v3MonthlyTotal) * 100;
    
    return {
      totalMonthly: v4MonthlyTotal,
      breakdown,
      comparison: {
        v3Cost: v3MonthlyTotal,
        v4Cost: v4MonthlyTotal,
        savings,
        savingsPercent
      }
    };
  }
}