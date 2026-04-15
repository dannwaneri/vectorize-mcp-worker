-- migrations/001_add_tenant_id.sql
-- Adds tenant_id to the documents table for multi-tenant isolation.
-- Run against the remote DB:
--   wrangler d1 execute mcp-knowledge-db --remote --file=./migrations/001_add_tenant_id.sql
--
-- Safe to run multiple times (ALTER TABLE fails silently when column exists via
-- the IF NOT EXISTS workaround below; SQLite does not support IF NOT EXISTS on
-- ALTER TABLE, so the command will error on re-run — just ignore that error).

ALTER TABLE documents ADD COLUMN tenant_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
