CREATE TABLE IF NOT EXISTS feedback_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chart_id TEXT NOT NULL,
  title TEXT NOT NULL,
  course TEXT NOT NULL,
  source TEXT,
  field TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('too_high', 'too_low')),
  current_value REAL,
  client_id TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_once
ON feedback_votes(chart_id, field, client_id);

CREATE INDEX IF NOT EXISTS idx_feedback_chart
ON feedback_votes(chart_id, field);
