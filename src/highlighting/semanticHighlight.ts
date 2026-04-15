import { Env } from '../types/env';
import { SearchResult } from '../types/search';
import { HighlightedResult, Highlight, HighlightConfig } from './types';
import { resolveEmbeddingModel } from '../config/models';


export class SemanticHighlighter {
  
    private readonly DEFAULT_CONFIG: HighlightConfig = {
        threshold: 0.5,         
        maxHighlights: 3,       
        contextLength: 50,      
        snippetLength: 200   
      };
  
  private embeddingCache = new Map<string, number[]>();

private resultCache = new Map<string, { results: HighlightedResult[], timestamp: number }>();
private readonly RESULT_CACHE_TTL = 60000; // 60 seconds
  
  constructor(
    private env: Env,
    private config: Partial<HighlightConfig> = {}
  ) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }
  
  
  async highlightResults(
    query: string,
    results: SearchResult[]
  ): Promise<HighlightedResult[]> {
    
    if (results.length === 0) return [];
    

    // ✅ CHECK CACHE FIRST (sort IDs for consistent key)
    const cacheKey = query.toLowerCase().trim();
    const cached = this.resultCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.RESULT_CACHE_TTL) {
      console.log('✅ Highlighting cache HIT:', query);
      return cached.results;
    }
    
    const startTime = Date.now();
    const timings: any = {};
    
    // Generate query embedding once (cached)
    const embeddingStart = Date.now();
    const queryEmbedding = await this.getQueryEmbedding(query);
    timings.queryEmbedding = Date.now() - embeddingStart;
    
    // Highlight each result in parallel
    const highlightStart = Date.now();
    const highlighted = await Promise.all(
      results.map(result => this.highlightResult(result, query, queryEmbedding))
    );
    timings.sentenceProcessing = Date.now() - highlightStart;
    
    const totalTime = Date.now() - startTime;
  
    console.log(`Semantic highlighting: ${totalTime}ms for ${results.length} results`, timings);
    
    // ✅ CACHE THE RESULTS
    this.resultCache.set(cacheKey, { 
      results: highlighted, 
      timestamp: Date.now() 
    });
    
    // ✅ Limit cache size to prevent memory bloat
    if (this.resultCache.size > 100) {
      const firstKey = this.resultCache.keys().next().value;
      if (firstKey) this.resultCache.delete(firstKey);
    }
    
    return highlighted;

 }
  
 private async highlightResult(
    result: SearchResult,
    query: string,
    queryEmbedding: number[]
  ): Promise<HighlightedResult> {
    
    // ✅ OPTIMIZATION: Skip highlighting for very short content
    if (result.content.length < 100) {
      return {
        ...result,
        highlightedContent: result.content,
        highlights: []
      };
    }
    
    // Split content into sentences
    const sentences = this.splitIntoSentences(result.content);
    
    if (sentences.length === 0) {
      return {
        ...result,
        highlightedContent: result.content,
        highlights: []
      };
    }
    

    // Score each sentence against query
const scoredSentences = await this.scoreSentences(sentences, queryEmbedding, query);
    
    const topSentences = scoredSentences
      .filter(s => s.score >= this.config.threshold!)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxHighlights!);
    
    if (topSentences.length === 0) {
      // No highlights above threshold
      return {
        ...result,
        highlightedContent: result.content,
        highlights: []
      };
    }
    
    // Calculate positions in original content
    const highlights = this.calculatePositions(result.content, topSentences);
    
    // Generate highlighted content
    const highlightedContent = this.applyHighlights(result.content, highlights);
    
    // Extract best snippets
    const snippets = this.extractSnippets(result.content, highlights);
    
    return {
      ...result,
      highlightedContent,
      highlights,
      snippets
    };
  }
  
  /**
   * Get or generate query embedding (cached)
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    
    // Check cache
    if (this.embeddingCache.has(query)) {
      return this.embeddingCache.get(query)!;
    }
    
    // Generate embedding
    const embedding = await this.generateEmbedding(query);
    
   // ✅ OPTIMIZATION: Increase cache to 500 (5KB per embedding, ~2.5MB total)
if (this.embeddingCache.size >= 500) {
    const firstKey = this.embeddingCache.keys().next().value;
    if (firstKey !== undefined) this.embeddingCache.delete(firstKey);
  }
    this.embeddingCache.set(query, embedding);
    
    return embedding;
  }
  
  private splitIntoSentences(text: string): string[] {
    // Remove markdown formatting
    let cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/^\s*\*\s+/gm, '');
    
    // Split on BOTH sentence boundaries AND newlines
    const sentences = cleanText
      .split(/(?:[.!?]+\s+|\n+)/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && !s.match(/^(Header|Transaction|Footer|Section)/));
    
    // ✅ OPTIMIZATION: Limit to first 15 sentences to reduce embedding time
    // Most queries will match in first few sentences anyway
    return sentences.slice(0, 10);
  }
  
  private async scoreSentences(
    sentences: string[],
    queryEmbedding: number[],
    query: string  // ✅ Add query parameter
  ): Promise<ScoredSentence[]> {
    
    // ✅ OPTIMIZATION: Pre-filter sentences using keyword matching
    const filteredSentences = this.preFilterSentences(sentences, query);
    
    console.log(`Highlighting: ${sentences.length} sentences → ${filteredSentences.length} after pre-filter`);
    
   // ✅ OPTIMIZATION: Use batch embedding generation
const sentenceEmbeddings = await this.generateEmbeddingsBatch(filteredSentences);
    
    // Calculate cosine similarity for each
    const scored = filteredSentences.map((text, i) => {
      const embedding = sentenceEmbeddings[i];
      const score = this.cosineSimilarity(queryEmbedding, embedding);
      
      return {
        text,
        score,
        startIndex: 0,  // Will calculate later
        endIndex: 0
      };
    });
    
    return scored;
  }
  


/**
 * Generate embeddings for multiple texts in batch (faster)
 */
private async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    try {
      // Workers AI supports batch processing
      const responses = await Promise.all(
        texts.map(text => this.env.AI.run(
          resolveEmbeddingModel(this.env.EMBEDDING_MODEL).id as any,
          { text: text.substring(0, 512) }
        ))
      );
      
      return responses.map((response: any) => {
        // Handle different response formats
        if (Array.isArray(response)) return response;
        if (response?.data?.[0]) return response.data[0];
        if (response?.[0]) return response[0];
        return [];
      });
    } catch (error) {
      console.error('Batch embedding generation failed:', error);
      return texts.map(() => []);
    }
  }


  /**
   * Generate BGE embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
        const response = await this.env.AI.run(
            resolveEmbeddingModel(this.env.EMBEDDING_MODEL).id as any,
            { text: text.substring(0, 512) }
          );
          
          // BGE model returns { shape: [1, 384], data: [[...]] } format
          if (Array.isArray(response)) {
            return response;
          }
          
          // Handle the actual response structure
          const embedding = (response as any).data?.[0] || response;
          
          return Array.isArray(embedding) ? embedding : [];
    } catch (error) {
      console.error('Embedding generation failed:', error);
      return [];
    }
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
  
  /**
   * Calculate actual positions of sentences in original content
   */
  private calculatePositions(
    content: string,
    scoredSentences: ScoredSentence[]
  ): Highlight[] {
    
    const highlights: Highlight[] = [];
    
    for (const sentence of scoredSentences) {
      const startIndex = content.indexOf(sentence.text);
      
      if (startIndex === -1) continue;  // Sentence not found
      
      const endIndex = startIndex + sentence.text.length;
      
      // Extract context (surrounding text)
      const contextStart = Math.max(0, startIndex - this.config.contextLength!);
      const contextEnd = Math.min(content.length, endIndex + this.config.contextLength!);
      const context = content.substring(contextStart, contextEnd);
      
      highlights.push({
        text: sentence.text,
        score: sentence.score,
        startIndex,
        endIndex,
        context
      });
    }
    
    return highlights;
  }
  
  /**
   * Apply highlights to content (add <mark> tags)
   */
  private applyHighlights(
    content: string,
    highlights: Highlight[]
  ): string {
    
    if (highlights.length === 0) return content;
    
    // Sort by position (descending) to avoid offset issues when inserting tags
    const sortedHighlights = [...highlights].sort((a, b) => b.startIndex - a.startIndex);
    
    let highlightedContent = content;
    
    for (const highlight of sortedHighlights) {
      const before = highlightedContent.substring(0, highlight.startIndex);
      const marked = `<mark class="semantic-highlight" data-score="${highlight.score.toFixed(2)}">${highlight.text}</mark>`;
      const after = highlightedContent.substring(highlight.endIndex);
      
      highlightedContent = before + marked + after;
    }
    
    return highlightedContent;
  }
  
  /**
   * Extract best snippets (passages with highlights)
   */
  private extractSnippets(
    content: string,
    highlights: Highlight[]
  ): string[] {
    
    if (highlights.length === 0) {
      // No highlights - return first N chars as snippet
      return [content.substring(0, this.config.snippetLength!) + '...'];
    }
    
    const snippets: string[] = [];
    
    for (const highlight of highlights.slice(0, 3)) {  // Top 3 snippets
      const snippetStart = Math.max(0, highlight.startIndex - 50);
      const snippetEnd = Math.min(content.length, highlight.endIndex + 50);
      
      let snippet = content.substring(snippetStart, snippetEnd);
      
      // Add ellipsis if truncated
      if (snippetStart > 0) snippet = '...' + snippet;
      if (snippetEnd < content.length) snippet = snippet + '...';
      
      snippets.push(snippet);
    }
    
    return snippets;
  }
/**
 * Pre-filter sentences using simple keyword matching
 * This avoids embedding sentences that have no keyword overlap
 */
private preFilterSentences(sentences: string[], query: string): string[] {
    // Extract keywords from query (remove common words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been']);
    const queryKeywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    if (queryKeywords.length === 0) {
      // No keywords to filter by, return all sentences
      return sentences;
    }
    
    // Score sentences by keyword overlap
    const scored = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase();
      const matchCount = queryKeywords.filter(keyword => 
        lowerSentence.includes(keyword)
      ).length;
      
      return { sentence, matchCount };
    });
    
    // Keep sentences with at least 1 keyword match, or top 10 if none match
    const filtered = scored.filter(s => s.matchCount > 0);
    
    if (filtered.length === 0) {
      // No keyword matches - fall back to all sentences (but limit to 10)
      return sentences.slice(0, 10);
    }
    
    // Sort by match count and return top sentences
    return filtered
  .sort((a, b) => b.matchCount - a.matchCount)
  .slice(0, 5)  // ✅ AGGRESSIVE: Only embed top 5 most promising
  .map(s => s.sentence);
  }

}

/**
 * Internal type for scored sentences
 */
interface ScoredSentence {
  text: string;
  score: number;
  startIndex: number;
  endIndex: number;
}