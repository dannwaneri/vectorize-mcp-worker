import { Env } from '../../types/env';
import { RouteResult } from '../types';

/**
 * OCR Route - Text extraction from images
 * 
 * Will use LightOnOCR-2 when implemented.
 * For now, placeholder that redirects to vision route.
 * 
 * TODO: Implement LightOnOCR-2 integration in Week 3
 */
export async function ocrRoute(
  query: string,
  context: { imageBuffer?: ArrayBuffer; topK?: number },
  env: Env
): Promise<RouteResult> {
  
  // Placeholder: Use existing vision route for now
  const { visionRoute } = await import('./visionRoute');
  return visionRoute(query, context, env);
}