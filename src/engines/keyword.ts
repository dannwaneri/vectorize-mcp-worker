import { SearchResult } from '../types/search';
import { Env } from '../types/env';

export class KeywordSearchEngine {
	private k1 = 1.2;
	private b = 0.75;
	private stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'they', 'have', 'has', 'had']);

	tokenize(text: string): string[] {
		return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !this.stopWords.has(t));
	}
	
	async indexDocument(db: D1Database, docId: string, content: string): Promise<void> {
		const tokens = this.tokenize(content);
		const termFreq = new Map<string, number>();
		tokens.forEach(t => termFreq.set(t, (termFreq.get(t) || 0) + 1));

		const batch: D1PreparedStatement[] = [];
		for (const [term, count] of termFreq) {
			batch.push(db.prepare('INSERT INTO keywords (document_id, term, term_frequency) VALUES (?, ?, ?)').bind(docId, term, count));
			batch.push(db.prepare('INSERT INTO term_stats (term, document_frequency) VALUES (?, 1) ON CONFLICT(term) DO UPDATE SET document_frequency = document_frequency + 1').bind(term));
		}
		batch.push(db.prepare('UPDATE doc_stats SET total_documents = total_documents + 1, avg_doc_length = ((avg_doc_length * total_documents) + ?) / (total_documents + 1) WHERE id = 1').bind(tokens.length));
		if (batch.length > 0) await db.batch(batch);
	}
	
	async search(db: D1Database, query: string, topK: number): Promise<SearchResult[]> {
		const tokens = this.tokenize(query);
		if (!tokens.length) return [];
	
		const limitedTokens = tokens.slice(0, 100);
		
		if (!limitedTokens.length) return [];
	
		const stats = await db.prepare('SELECT total_documents, avg_doc_length FROM doc_stats WHERE id = 1').first<{ total_documents: number; avg_doc_length: number }>();
		if (!stats?.total_documents) return [];
	
		const placeholders = limitedTokens.map(() => '?').join(',');
		const results = await db.prepare(`SELECT d.id, d.content, d.category, d.is_image, k.term, k.term_frequency, LENGTH(d.content) as doc_length, ts.document_frequency FROM documents d JOIN keywords k ON d.id = k.document_id JOIN term_stats ts ON k.term = ts.term WHERE k.term IN (${placeholders})`).bind(...limitedTokens).all<{ id: string; content: string; category: string; is_image: number; term_frequency: number; doc_length: number; document_frequency: number }>();
	
		const scores = new Map<string, { score: number; content: string; category: string; isImage: boolean }>();
		for (const r of results.results) {
			const idf = Math.log((stats.total_documents - r.document_frequency + 0.5) / (r.document_frequency + 0.5) + 1);
			const tf = (r.term_frequency * (this.k1 + 1)) / (r.term_frequency + this.k1 * (1 - this.b + this.b * (r.doc_length / stats.avg_doc_length)));
			const existing = scores.get(r.id);
			if (existing) existing.score += idf * tf;
			else scores.set(r.id, { score: idf * tf, content: r.content, category: r.category, isImage: r.is_image === 1 });
		}
	
		return Array.from(scores.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, topK).map(([id, d]) => ({ id, content: d.content, score: d.score, category: d.category, source: 'keyword' as const, isImage: d.isImage }));
	}
}