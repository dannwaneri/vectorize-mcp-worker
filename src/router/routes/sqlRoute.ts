import { Env } from '../../types/env';
import { RouteResult } from '../types';
import { SearchResult } from '../../types/search';

/**
 * SQL Route - Direct database queries
 * 
 * Fastest route for entity lookups.
 * Target latency: <50ms
 */
export async function sqlRoute(
  query: string,
  context: { topK?: number },
  env: Env
): Promise<RouteResult> {
  
  const startTime = Date.now();
  const topK = context.topK || 5;
  
  // Extract entity from query
  const entity = extractEntity(query);
  
  if (!entity) {
    throw new Error('Could not extract entity from query');
  }
  
  // Direct SQL lookup
  const result = await env.DB.prepare(`
    SELECT 
      id,
      content,
      title,
      category,
      is_image
    FROM documents
    WHERE 
      content LIKE ? 
      OR title LIKE ?
      OR id LIKE ?
    ORDER BY 
      CASE 
        WHEN id = ? THEN 1
        WHEN title LIKE ? THEN 2
        ELSE 3
      END
    LIMIT ?
  `).bind(
    `%${entity}%`,
    `%${entity}%`,
    `%${entity}%`,
    entity,
    `${entity}%`,
    topK
  ).all();
  
  const sqlTime = Date.now() - startTime;
  
  const searchResults: SearchResult[] = result.results.map((row: any) => ({
    id: row.id,
    content: row.content,
    score: 1.0, // SQL match = perfect score
    category: row.category,
    source: 'keyword' as const,
    isImage: row.is_image === 1
  }));
  
  return {
    results: searchResults,
    performance: {
      sqlQueryTime: `${sqlTime}ms`,
      totalTime: `${Date.now() - startTime}ms`
    },
    metadata: {
      route: 'SQL',
      intent: 'ENTITY_LOOKUP',
      routeTime: `${sqlTime}ms`,
      reasoning: `Direct SQL lookup for entity: ${entity}`
    }
  };
}

/**
 * Extract entity name from query using simple patterns
 */
function extractEntity(query: string): string | null {
  
  // Pattern 1: "What's/Who's [ENTITY]'s..."
  const pattern1 = /(?:what's|who's|find|show|get)\s+([a-zA-Z0-9_-]+)/i;
  const match1 = query.match(pattern1);
  if (match1) return match1[1];
  
  // Pattern 2: "[ENTITY]'s ID/name/..."
  const pattern2 = /^([a-zA-Z0-9_-]+)'s\s/i;
  const match2 = query.match(pattern2);
  if (match2) return match2[1];
  
  // Pattern 3: "player/user/document [ENTITY]"
  const pattern3 = /(?:player|user|document|entity)\s+([a-zA-Z0-9_-]+)/i;
  const match3 = query.match(pattern3);
  if (match3) return match3[1];
  
  // Pattern 4: "titled/named [ENTITY]"
  const pattern4 = /(?:titled|named|called)\s+"?([^"]+)"?/i;
  const match4 = query.match(pattern4);
  if (match4) return match4[1].trim();
  
  // Fallback: Use first word if query is short
  const words = query.split(/\s+/);
  if (words.length <= 3) {
    return words[words.length - 1].replace(/[^a-zA-Z0-9_-]/g, '');
  }
  
  return null;
}