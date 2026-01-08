-- schema.sql - Run: wrangler d1 execute mcp-knowledge-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    title TEXT,
    source TEXT,
    category TEXT,
    chunk_index INTEGER DEFAULT 0,
    parent_id TEXT,
    word_count INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    term TEXT NOT NULL,
    term_frequency INTEGER DEFAULT 1,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_documents INTEGER DEFAULT 0,
    avg_doc_length REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS term_stats (
    term TEXT PRIMARY KEY,
    document_frequency INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_keywords_term ON keywords(term);
CREATE INDEX IF NOT EXISTS idx_keywords_doc ON keywords(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);

INSERT OR IGNORE INTO doc_stats (id, total_documents, avg_doc_length) VALUES (1, 0, 0);