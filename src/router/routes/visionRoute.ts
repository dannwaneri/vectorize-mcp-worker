import { Env } from '../../types/env';
import { RouteResult } from '../types';
import { IngestionEngine } from '../../engines/ingestion';

const ingestion = new IngestionEngine();

/**
 * Vision Route - Image understanding
 * 
 * Uses existing Llama 4 Scout multimodal processing.
 * Handles semantic image understanding, not just OCR.
 */
export async function visionRoute(
  query: string,
  context: { imageBuffer?: ArrayBuffer; topK?: number },
  env: Env
): Promise<RouteResult> {
  
  const startTime = Date.now();
  
  if (!context.imageBuffer) {
    throw new Error('Image buffer required for vision route');
  }
  
  // Use existing multimodal processing
  const result = await ingestion.ingestImage(
    {
      id: `temp-vision-${Date.now()}`,
      content: query,
      imageBuffer: context.imageBuffer,
      imageType: 'auto'
    },
    env
  );
  
  const visionTime = Date.now() - startTime;
  
  // Return description as search result
  return {
    results: [{
      id: 'vision-result',
      content: result.description + (result.extractedText ? `\n\nExtracted Text: ${result.extractedText}` : ''),
      score: 1.0,
      category: 'vision',
      source: 'keyword' as const,
      isImage: false
    }],
    performance: {
      visionProcessingTime: result.performance.multimodalProcessing,
      totalTime: `${visionTime}ms`
    },
    metadata: {
      route: 'VISION',
      intent: 'VISUAL_ANALYSIS',
      routeTime: `${visionTime}ms`,
      reasoning: 'Llama 4 Scout image understanding + OCR'
    }
  };
}