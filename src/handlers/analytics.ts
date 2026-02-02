import { Env } from '../types/env';
import { CostTracker } from '../analytics/costTracker';
import { corsHeaders } from '../middleware/cors';

/**
 * Get cost analytics and projections
 * GET /analytics/cost
 */
export async function handleCostAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const queriesPerDay = parseInt(url.searchParams.get('queriesPerDay') || '1000');
    
    // Default route distribution (based on typical usage)
    // FIXED route distribution
const routeDistribution = {
    SQL: 40,      // 40%
    BM25: 30,     // 30%
    VECTOR: 25,   // 25%
    GRAPH: 4,     // 4%
    VISION: 0.5,  // 0.5%
    OCR: 0.5,     // 0.5%
  };
    
    const projection = CostTracker.projectMonthlyCost(queriesPerDay, routeDistribution);
    const routeCosts = CostTracker.getEstimatedRouteCosts();
    
    return new Response(
      JSON.stringify({
        queriesPerDay,
        queriesPerMonth: queriesPerDay * 30,
        routeDistribution,
        routeCosts: Object.fromEntries(
          Object.entries(routeCosts).map(([route, cost]) => [
            route,
            {
              costPerQuery: CostTracker.formatCost(cost.totalCost),
              breakdown: cost.breakdown
            }
          ])
        ),
        monthlyProjection: {
          v3Cost: CostTracker.formatCost(projection.comparison.v3Cost),
          v4Cost: CostTracker.formatCost(projection.comparison.v4Cost),
          savings: CostTracker.formatCost(projection.comparison.savings),
          savingsPercent: `${projection.comparison.savingsPercent.toFixed(1)}%`,
          breakdownByRoute: Object.fromEntries(
            Object.entries(projection.breakdown).map(([route, cost]) => [
              route,
              CostTracker.formatCost(cost)
            ])
          )
        }
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Analytics failed"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      }
    );
  }
}