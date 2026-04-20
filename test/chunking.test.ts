import { describe, it, expect } from 'vitest';
import { ChunkingEngine } from '../src/engines/chunking';

const engine = new ChunkingEngine();

// Helpers to generate text
function repeat(str: string, n: number): string {
	return Array(n).fill(str).join(' ');
}

function paragraphs(count: number, wordsEach: number): string {
	return Array.from({ length: count }, (_, i) =>
		repeat(`paragraph${i}word`, wordsEach),
	).join('\n\n');
}

describe('ChunkingEngine', () => {
	describe('short text (under minChunkSize = 100 chars)', () => {
		it('returns exactly 1 chunk', () => {
			const text = 'Short text.';
			const chunks = engine.chunk(text, 'doc-1');
			expect(chunks).toHaveLength(1);
		});

		it('the single chunk contains the full text', () => {
			const text = 'Short text that is definitely under 100 characters.';
			const chunks = engine.chunk(text, 'doc-1');
			expect(chunks[0].content).toBe(text.trim());
		});
	});

	describe('multi-paragraph text', () => {
		it('splits into multiple chunks when text is long enough', () => {
			// Build a string that is significantly over maxChunkSize (512)
			const text = paragraphs(10, 20); // ~10 paragraphs × ~20 words each
			const chunks = engine.chunk(text, 'doc-2');
			expect(chunks.length).toBeGreaterThan(1);
		});
	});

	describe('parentId', () => {
		it('all chunks have parentId matching the supplied documentId', () => {
			const text = paragraphs(8, 20);
			const docId = 'my-document-42';
			const chunks = engine.chunk(text, docId);
			for (const chunk of chunks) {
				expect(chunk.parentId).toBe(docId);
			}
		});
	});

	describe('chunk IDs', () => {
		it('follow the {documentId}-chunk-{index} pattern', () => {
			const docId = 'doc-abc';
			const text = paragraphs(8, 20);
			const chunks = engine.chunk(text, docId);
			for (const chunk of chunks) {
				expect(chunk.id).toMatch(new RegExp(`^${docId}-chunk-\\d+$`));
			}
		});

		it('each chunk id encodes its own index', () => {
			const docId = 'doc-xyz';
			const text = paragraphs(8, 20);
			const chunks = engine.chunk(text, docId);
			for (const chunk of chunks) {
				expect(chunk.id).toBe(`${docId}-chunk-${chunk.chunkIndex}`);
			}
		});
	});

	describe('chunk indices', () => {
		it('are sequential starting from 0', () => {
			const text = paragraphs(8, 20);
			const chunks = engine.chunk(text, 'doc-seq');
			const indices = chunks.map((c) => c.chunkIndex);
			for (let i = 0; i < indices.length; i++) {
				expect(indices[i]).toBe(i);
			}
		});
	});

	describe('overlap', () => {
		it('consecutive chunks share overlapping content (~76 chars at the boundary)', () => {
			// Use paragraphs long enough to produce at least 2 chunks
			const text = paragraphs(10, 25);
			const chunks = engine.chunk(text, 'doc-overlap');
			// Need at least 2 chunks to test overlap
			expect(chunks.length).toBeGreaterThanOrEqual(2);

			// The tail of chunk N should appear at the head of chunk N+1
			for (let i = 0; i < chunks.length - 1; i++) {
				const tail = chunks[i].content.slice(-76);
				const nextContent = chunks[i + 1].content;
				// The overlap tail may be trimmed/adjusted at paragraph boundaries;
				// use a substring of it as the overlap probe
				const probe = tail.slice(0, 30).trim();
				if (probe.length > 0) {
					expect(nextContent).toContain(probe);
				}
			}
		});
	});

	describe('empty / whitespace text', () => {
		it('returns at least 1 chunk for empty string', () => {
			const chunks = engine.chunk('', 'doc-empty');
			expect(chunks.length).toBeGreaterThanOrEqual(1);
		});

		it('returns at least 1 chunk for whitespace-only string', () => {
			const chunks = engine.chunk('   \n\n  ', 'doc-ws');
			expect(chunks.length).toBeGreaterThanOrEqual(1);
		});

		it('returned chunk has correct parentId even for empty text', () => {
			const chunks = engine.chunk('', 'doc-empty-id');
			expect(chunks[0].parentId).toBe('doc-empty-id');
		});
	});

	describe('single chunk structure', () => {
		it('chunk index is 0 for a single-chunk document', () => {
			const chunks = engine.chunk('tiny', 'doc-tiny');
			expect(chunks[0].chunkIndex).toBe(0);
		});

		it('chunk id is {docId}-chunk-0 for a single-chunk document', () => {
			const chunks = engine.chunk('tiny', 'doc-tiny');
			expect(chunks[0].id).toBe('doc-tiny-chunk-0');
		});
	});
});
