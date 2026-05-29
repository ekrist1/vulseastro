CREATE TABLE vulse_redirects (
  id TEXT PRIMARY KEY,
  from_path TEXT NOT NULL,
  to_url TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 301,
  enabled INTEGER NOT NULL DEFAULT 1,
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX vulse_redirects_from_path ON vulse_redirects(from_path);
