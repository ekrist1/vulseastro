CREATE TABLE vulse_global_sets (
  handle TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  definition TEXT NOT NULL,
  blueprint_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE vulse_global_values (
  handle TEXT PRIMARY KEY REFERENCES vulse_global_sets(handle) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
