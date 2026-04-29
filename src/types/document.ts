export interface Document {
	id: string;
	content: string;
	title?: string;
	source?: string;
	category?: string;
	source_type?: string;
	tags?: string[];
	tenant_id?: string;
	mime_type?: string;
	file_name?: string;
	date_created?: string;
	/** 'raw' = user-supplied document; 'reflection' = LLM synthesis; 'summary' = condensed version */
	doc_type?: 'raw' | 'reflection' | 'summary';
	/** IDs of documents that contributed to this one (used by reflections/summaries) */
	parent_ids?: string[];
	/** ISO timestamp of the last time a reflection was generated for this document */
	last_reflected_at?: string;
	/** Increments each time a reflection is regenerated for this document */
	reflection_version?: number;
	/** Arbitrary caller-supplied metadata (e.g. author, likes, url) stored verbatim in the vector index */
	metadata?: Record<string, unknown>;
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

// Shape stored in Vectorize metadata for every vector
export interface VectorMetadata {
	content: string;
	category?: string;
	parentId: string;
	chunkIndex: number;
	isImage: boolean;
	hasExtractedText?: boolean;
	source_type?: string;
	tags?: string[];
	date_created?: string;
	tenant_id?: string;
	mime_type?: string;
	file_name?: string;
	/** Which embedding model produced this vector, e.g. "bge-small" */
	embedding_model?: string;
	/** Dimension count of this vector, e.g. 384 or 1024 */
	embedding_dimensions?: number;
	/** 'raw' | 'reflection' | 'summary' — lets search callers filter by document type */
	doc_type?: 'raw' | 'reflection' | 'summary';
}