-- migrations/002_add_reflection_fields.sql
-- Adds knowledge-accumulation fields for the reflection layer.
-- Run against the remote DB:
--   wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/002_add_reflection_fields.sql
--
-- SQLite does not support IF NOT EXISTS on ALTER TABLE.
-- These commands will error on re-run — that's fine, just ignore the errors.

-- What type is this row? 'raw' = user-supplied, 'reflection' = LLM synthesis, 'summary' = condensed.
ALTER TABLE documents ADD COLUMN doc_type TEXT DEFAULT 'raw';

-- JSON array of document IDs that contributed to this reflection/summary.
-- e.g. '["doc-abc", "doc-xyz"]'
ALTER TABLE documents ADD COLUMN parent_ids TEXT DEFAULT NULL;

-- ISO timestamp of the last reflection that referenced this document.
ALTER TABLE documents ADD COLUMN last_reflected_at TEXT DEFAULT NULL;

-- Increments each time a reflection is regenerated for this document.
ALTER TABLE documents ADD COLUMN reflection_version INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
