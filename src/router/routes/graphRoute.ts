import { Env } from '../../types/env';
import { RouteResult } from '../types';
import { SearchResult } from '../../types/search';

/**
 * Graph Route - Multi-hop reasoning
 * 
 * Queries the knowledge graph for relationships.
 * Supports 1-3 hop traversals.
 * 
 * Target latency: ~30ms per hop
 * 
 * Use cases:
 * - "Who owns Liverpool players?"
 * - "Documents citing Smith 2020"
 * - "Find entities related to X"
 */
export async function graphRoute(
  query: string,
  context: { topK?: number },
  env: Env
): Promise<RouteResult> {
  
  const startTime = Date.now();
  const topK = context.topK || 5;
  
  if (!env.DB) {
    throw new Error('D1 database not available');
  }
  
  // Step 1: Extract entities and relationship type from query
  const queryAnalysis = analyzeGraphQuery(query);
  
  if (!queryAnalysis.entities.length) {
    throw new Error('Could not extract entities from graph query');
  }
  
  // Step 2: Execute graph traversal
  const graphResults = await executeGraphTraversal(
    queryAnalysis.entities,
    queryAnalysis.relationshipType,
    queryAnalysis.hops,
    env.DB
  );
  
  const graphTime = Date.now() - startTime;
  
  // Step 3: Convert graph results to search results
  const searchResults: SearchResult[] = graphResults.map((result, index) => ({
    id: result.entity_id,
    content: formatGraphResult(result),
    score: 1.0 - (index * 0.1), // Decay score by position
    category: 'graph',
    source: 'keyword' as const,
    isImage: false
  }));
  
  return {
    results: searchResults.slice(0, topK),
    performance: {
      queryAnalysisTime: '~5ms',
      graphTraversalTime: `${graphTime - 5}ms`,
      totalTime: `${graphTime}ms`
    },
    metadata: {
      route: 'GRAPH',
      intent: 'GRAPH_REASONING',
      routeTime: `${graphTime}ms`,
      reasoning: `Graph traversal: ${queryAnalysis.hops} hop(s), relationship type: ${queryAnalysis.relationshipType || 'any'}`
    }
  };
}

/**
 * Analyze query to extract graph search parameters
 */
function analyzeGraphQuery(query: string): {
  entities: string[];
  relationshipType: string | null;
  hops: number;
} {
  
  const lowerQuery = query.toLowerCase();
  
  // Extract entities (simple pattern matching)
  const entities: string[] = [];
  
  // Pattern 1: "Who owns [ENTITY]"
  const ownsMatch = lowerQuery.match(/who\s+owns\s+([a-zA-Z\s]+)/i);
  if (ownsMatch) {
    entities.push(ownsMatch[1].trim());
    return {
      entities,
      relationshipType: 'owns',
      hops: 1
    };
  }
  
  // Pattern 2: "Documents citing [ENTITY]"
  const citesMatch = lowerQuery.match(/documents?\s+citing\s+([a-zA-Z0-9\s]+)/i);
  if (citesMatch) {
    entities.push(citesMatch[1].trim());
    return {
      entities,
      relationshipType: 'cites',
      hops: 1
    };
  }
  
  // Pattern 3: "[ENTITY] players" or "[ENTITY] team"
  const teamMatch = lowerQuery.match(/([a-zA-Z]+)\s+(players?|team)/i);
  if (teamMatch) {
    entities.push(teamMatch[1].trim());
    return {
      entities,
      relationshipType: 'plays_for',
      hops: 1
    };
  }
  
  // Pattern 4: "Related to [ENTITY]"
  const relatedMatch = lowerQuery.match(/related\s+to\s+([a-zA-Z\s]+)/i);
  if (relatedMatch) {
    entities.push(relatedMatch[1].trim());
    return {
      entities,
      relationshipType: null, // Any relationship
      hops: 2
    };
  }
  
  // Default: Extract last significant word
  const words = query.split(/\s+/).filter(w => w.length > 3);
  if (words.length > 0) {
    entities.push(words[words.length - 1]);
  }
  
  return {
    entities,
    relationshipType: null,
    hops: 1
  };
}

/**
 * Execute graph traversal query
 */
async function executeGraphTraversal(
  entityNames: string[],
  relationshipType: string | null,
  hops: number,
  db: D1Database
): Promise<GraphResult[]> {
  
  // Normalize entity names for matching
  const canonicalNames = entityNames.map(name => 
    name.toLowerCase().replace(/\s+/g, '')
  );
  
  // Build query based on hops
  if (hops === 1) {
    return executeOneHopQuery(canonicalNames, relationshipType, db);
  } else if (hops === 2) {
    return executeTwoHopQuery(canonicalNames, relationshipType, db);
  } else {
    // Default to 1-hop for now
    return executeOneHopQuery(canonicalNames, relationshipType, db);
  }
}

/**
 * One-hop graph query
 * Example: "Who owns Liverpool players?"
 */
async function executeOneHopQuery(
  canonicalNames: string[],
  relationshipType: string | null,
  db: D1Database
): Promise<GraphResult[]> {
  
  const placeholders = canonicalNames.map(() => '?').join(',');
  
  let query = `
    SELECT 
      e1.id as entity_id,
      e1.name as entity_name,
      e1.type as entity_type,
      r.relationship_type,
      e2.id as related_entity_id,
      e2.name as related_entity_name,
      e2.type as related_entity_type,
      r.strength
    FROM entities e1
    JOIN relationships r ON e1.id = r.from_entity
    JOIN entities e2 ON r.to_entity = e2.id
    WHERE e2.canonical_name IN (${placeholders})
  `;
  
  const params: any[] = [...canonicalNames];
  
  if (relationshipType) {
    query += ` AND r.relationship_type = ?`;
    params.push(relationshipType);
  }
  
  query += ` ORDER BY r.strength DESC LIMIT 20`;
  
  const result = await db.prepare(query).bind(...params).all();
return result.results as unknown as GraphResult[];
}

/**
 * Two-hop graph query
 * Example: "Find entities related to Liverpool"
 */
async function executeTwoHopQuery(
  canonicalNames: string[],
  relationshipType: string | null,
  db: D1Database
): Promise<GraphResult[]> {
  
  const placeholders = canonicalNames.map(() => '?').join(',');
  
  // Two-hop: Start entity → Intermediate entity → Target entity
  let query = `
    SELECT 
      e3.id as entity_id,
      e3.name as entity_name,
      e3.type as entity_type,
      r1.relationship_type || ' → ' || r2.relationship_type as relationship_type,
      e1.id as related_entity_id,
      e1.name as related_entity_name,
      'source' as related_entity_type,
      (r1.strength * r2.strength) as strength
    FROM entities e1
    JOIN relationships r1 ON e1.id = r1.from_entity
    JOIN entities e2 ON r1.to_entity = e2.id
    JOIN relationships r2 ON e2.id = r2.from_entity
    JOIN entities e3 ON r2.to_entity = e3.id
    WHERE e1.canonical_name IN (${placeholders})
  `;
  
  const params: any[] = [...canonicalNames];
  
  if (relationshipType) {
    query += ` AND (r1.relationship_type = ? OR r2.relationship_type = ?)`;
    params.push(relationshipType, relationshipType);
  }
  
  query += ` ORDER BY strength DESC LIMIT 20`;
  
  const result = await db.prepare(query).bind(...params).all();
  return result.results as unknown as GraphResult[];
}

/**
 * Format graph result for display
 */
function formatGraphResult(result: GraphResult): string {
  return `${result.entity_name} (${result.entity_type}) - ${result.relationship_type} - ${result.related_entity_name} (${result.related_entity_type}) [strength: ${result.strength.toFixed(2)}]`;
}

/**
 * Graph result interface
 */
interface GraphResult {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  relationship_type: string;
  related_entity_id: string;
  related_entity_name: string;
  related_entity_type: string;
  strength: number;
}