import { Chunk } from '../types/document';

export class ChunkingEngine {
	private maxChunkSize = 512;
	private overlapPercent = 0.15;
	private minChunkSize = 100;

	chunk(text: string, documentId: string): Chunk[] {
		const chunks: Chunk[] = [];
		const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
		let currentChunk = '';
		let chunkIndex = 0;
		const overlapSize = Math.floor(this.maxChunkSize * this.overlapPercent);

		for (const paragraph of paragraphs) {
			if ((currentChunk + '\n\n' + paragraph).length > this.maxChunkSize && currentChunk.trim()) {
				chunks.push({ 
					id: `${documentId}-chunk-${chunkIndex++}`, 
					content: currentChunk.trim(), 
					parentId: documentId, 
					chunkIndex: chunkIndex - 1 
				});
				currentChunk = currentChunk.slice(-overlapSize);
			}
			currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
		}
		
		if (currentChunk.trim().length >= this.minChunkSize) {
			chunks.push({ 
				id: `${documentId}-chunk-${chunkIndex}`, 
				content: currentChunk.trim(), 
				parentId: documentId, 
				chunkIndex 
			});
		}
		
		return chunks.length > 0 ? chunks : [{ 
			id: `${documentId}-chunk-0`, 
			content: text.trim(), 
			parentId: documentId, 
			chunkIndex: 0 
		}];
	}
}