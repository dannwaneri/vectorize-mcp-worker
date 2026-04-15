export interface SearchResult {
	id: string;
	content: string;
	score: number;
	category?: string;
	source: 'vector' | 'keyword' | 'hybrid';
	isImage?: boolean;
	/** 'raw' | 'reflection' | 'summary' — set from Vectorize metadata */
	doc_type?: string;
	/** Mean similarity of contributing chunks (reflections/summaries only) */
	reflection_score?: number;
}

export interface HybridSearchResult extends SearchResult {
	vectorScore?: number;
	keywordScore?: number;
	rerankerScore?: number;
	rrfScore: number;
}

// ---------------------------------------------------------------------------
// Metadata filtering
// ---------------------------------------------------------------------------

export type FilterScalar = string | number | boolean;

export interface FilterOperator {
	$eq?: FilterScalar;
	$ne?: FilterScalar;
	$gt?: string | number;
	$gte?: string | number;
	$lt?: string | number;
	$lte?: string | number;
	$in?: string[];
}

export const FILTERABLE_FIELDS = [
	'source_type',
	'category',
	'tags',
	'date_created',
	'tenant_id',
	'mime_type',
	'file_name',
	'doc_type',
] as const;

export type FilterableField = typeof FILTERABLE_FIELDS[number];

export type SearchFilters = Partial<Record<FilterableField, FilterOperator>>;

// ---------------------------------------------------------------------------
// Shared filter validation (used by both REST handler and MCP handler)
// ---------------------------------------------------------------------------

export type FilterValidationResult =
	| { valid: true; filters: SearchFilters }
	| { valid: false; error: string };

export function validateFilters(filters: unknown): FilterValidationResult {
	if (filters === undefined || filters === null) return { valid: true, filters: {} };
	if (typeof filters !== 'object' || Array.isArray(filters)) {
		return { valid: false, error: 'filters must be an object' };
	}
	const allowed = new Set<string>(FILTERABLE_FIELDS);
	for (const key of Object.keys(filters as object)) {
		if (!allowed.has(key)) {
			return {
				valid: false,
				error: `Unknown filter field: "${key}". Allowed fields: ${FILTERABLE_FIELDS.join(', ')}`,
			};
		}
	}
	// Validate ISO 8601 strings on date_created range operators
	const dateOp = (filters as any).date_created;
	if (dateOp) {
		for (const op of ['$eq', '$gt', '$gte', '$lt', '$lte'] as const) {
			const val = dateOp[op];
			if (val !== undefined && typeof val === 'string' && isNaN(Date.parse(val))) {
				return {
					valid: false,
					error: `date_created.${op} is not a valid ISO 8601 date string: "${val}"`,
				};
			}
		}
	}
	return { valid: true, filters: filters as SearchFilters };
}