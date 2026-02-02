import { Env } from '../types/env';
import { SearchResult } from '../types/search';
import { HighlightedResult, Highlight, HighlightConfig } from './types';


export class SemanticHighlighter {
  
    private readonly DEFAULT_CONFIG: HighlightConfig = {
        threshold: 0.5,         
        maxHighlights: 5,       
        contextLength: 50,      
        snippetLength: 200   
      };
  
  private embeddingCache = new Map<string, number[]>();
  
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
    
    const startTime = Date.now();
    
   
    const queryEmbedding = await this.getQueryEmbedding(query);
    
    const highlighted = await Promise.all(
      results.map(result => this.highlightResult(result, query, queryEmbedding))
    );
    
    const highlightTime = Date.now() - startTime;
    console.log(`Semantic highlighting: ${highlightTime}ms for ${results.length} results`);
    
    return highlighted;
  }
  
 
  private async highlightResult(
    result: SearchResult,
    query: string,
    queryEmbedding: number[]
  ): Promise<HighlightedResult> {
    

    const sentences = this.splitIntoSentences(result.content);
    
    if (sentences.length === 0) {
      return {
        ...result,
        highlightedContent: result.content,
        highlights: []
      };
    }
    

    const scoredSentences = await this.scoreSentences(sentences, queryEmbedding);
    
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
    
    // Cache it (max 100 queries to prevent memory bloat)
    if (this.embeddingCache.size >= 100) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
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
      .filter(s => s.length > 20 && !s.match(/^(Header|Transaction|Footer|Section)/));  // Filter headers
    
    return sentences;
  }
  
  /**
   * Score sentences against query embedding
   */
  private async scoreSentences(
    sentences: string[],
    queryEmbedding: number[]
  ): Promise<ScoredSentence[]> {
    
    // Generate embeddings for all sentences in parallel
    const sentenceEmbeddings = await Promise.all(
      sentences.map(s => this.generateEmbedding(s))
    );
    
    // Calculate cosine similarity for each
    const scored = sentences.map((text, i) => {
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
   * Generate BGE embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
        const response = await this.env.AI.run(
            '@cf/baai/bge-small-en-v1.5',
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