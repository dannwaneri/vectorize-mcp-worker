export interface Document {
	id: string;
	content: string;
	title?: string;
	source?: string;
	category?: string;
}

export interface ImageDocument extends Document {
	imageBuffer: ArrayBuffer;
	imageDescription?: string;
	imageType?: 'screenshot' | 'diagram' | 'photo' | 'document' | 'chart' | 'auto';
}

export interface Chunk {
	id: string;
	content: string;
	parentId: string;
	chunkIndex: number;
}