CREATE TABLE IF NOT EXISTS benchmark_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  model TEXT NOT NULL,
  model_id TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  tokens_used INTEGER,
  quality_score INTEGER,
  response_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
