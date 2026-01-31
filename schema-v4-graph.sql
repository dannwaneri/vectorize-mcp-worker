-- Graph-RAG Schema for V4
-- Enables multi-hop reasoning and relationship queries
-- Run: wrangler d1 execute mcp-knowledge-db --remote --file=./schema-v4-graph.sql

-- ========================================
-- ENTITIES TABLE
-- ========================================
-- Stores named entities extracted from documents
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,           -- 'person', 'player', 'team', 'document', 'company', 'concept', etc.
  name TEXT NOT NULL,           -- Display name
  canonical_name TEXT,          -- Normalized name for matching (lowercase, no spaces)
  metadata TEXT,                -- JSON blob for additional properties
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(type, canonical_name)
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

-- ========================================
-- RELATIONSHIPS TABLE
-- ========================================
-- Stores directed relationships between entities
CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_entity TEXT NOT NULL,
  to_entity TEXT NOT NULL,
  relationship_type TEXT NOT NULL,  -- 'owns', 'plays_for', 'authored', 'cites', 'manages', 'located_in', etc.
  strength REAL DEFAULT 1.0,        -- Relationship strength (0.0-1.0) for weighted graph traversal
  metadata TEXT,                     -- JSON blob for additional context
  source_document TEXT,              -- Which document this relationship was extracted from
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (from_entity) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_entity);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_entity);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_from_type ON relationships(from_entity, relationship_type);

-- ========================================
-- ENTITY_MENTIONS TABLE
-- ========================================
-- Links entities back to document chunks where they appear
CREATE TABLE IF NOT EXISTS entity_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  context TEXT,                     -- Surrounding text snippet
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(entity_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_mentions_document ON entity_mentions(document_id);

-- ========================================
-- SAMPLE DATA (for testing)
-- ========================================

-- Example entities (FPL theme)
INSERT OR IGNORE INTO entities (id, type, name, canonical_name) VALUES
  ('ent_haaland', 'player', 'Erling Haaland', 'erlinghaaland'),
  ('ent_salah', 'player', 'Mohamed Salah', 'mohamedsalah'),
  ('ent_mancity', 'team', 'Manchester City', 'manchestercity'),
  ('ent_liverpool', 'team', 'Liverpool', 'liverpool'),
  ('ent_user_john', 'user', 'John Smith', 'johnsmith'),
  ('ent_user_alice', 'user', 'Alice Johnson', 'alicejohnson');

-- Example relationships
INSERT OR IGNORE INTO relationships (from_entity, to_entity, relationship_type, strength, source_document) VALUES
  ('ent_haaland', 'ent_mancity', 'plays_for', 1.0, 'player-profiles'),
  ('ent_salah', 'ent_liverpool', 'plays_for', 1.0, 'player-profiles'),
  ('ent_user_john', 'ent_haaland', 'owns', 1.0, 'user-teams'),
  ('ent_user_john', 'ent_salah', 'owns', 0.8, 'user-teams'),
  ('ent_user_alice', 'ent_salah', 'owns', 1.0, 'user-teams'),
  ('ent_user_alice', 'ent_liverpool', 'supports', 0.9, 'user-preferences');